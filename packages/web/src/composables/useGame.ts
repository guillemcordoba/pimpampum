import { ref, computed } from 'vue';
import { Character, CombatEngine } from '@pimpampum/engine';
import type { LogEntry, RevealedAction, TargetPrompt, TargetRef } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemyFrom, getEnemy, registerEnemySkills } from '@pimpampum/enemies';
import { takePendingEncounter } from './pendingEncounter';
import { useParties, heroBuildSpec, type HeroSpec } from './party';

export type GamePhase = 'setup' | 'card-selection' | 'reveal' | 'resolving' | 'victory';

/** A player character. The heroes ARE the stored party — the combat view does
 *  not keep a roster of its own, so a fight fields exactly the table the
 *  encounter creator priced its encounters against. */
export type PlayerSpec = HeroSpec;

/** An enemy entry in the setup screen. Creatures carry no printed PV — the
 *  encounter decides it, so `pv` is always explicit. */
export interface EnemySpec {
  enemyId: string;
  level: number;
  equipment: string[];
  pv: number;
}

const registry = createRegistry();
registerEnemySkills(registry);

export function useGame() {
  const gamePhase = ref<GamePhase>('setup');
  const engine = ref<CombatEngine | null>(null);

  // The heroes come from the stored party rather than a roster of this
  // screen's own, so the fight fields exactly the characters the encounter
  // creator solved against.
  const party = useParties();
  const playerSpecs = computed<PlayerSpec[]>(() => party.heroes.value);
  const enemySpecs = ref<EnemySpec[]>([]);

  // An encounter handed over by the creator pre-fills the enemy roster.
  const handoff = takePendingEncounter();
  if (handoff) {
    enemySpecs.value = handoff.encounter.groups.flatMap(g =>
      Array.from({ length: g.count }, () =>
        ({ enemyId: g.enemyId, level: g.level, equipment: [], pv: g.pv })));
  }

  const combatLog = ref<LogEntry[]>([]);
  const playerSelections = ref<Map<number, number>>(new Map()); // charIdx -> actionIdx
  const winner = ref<number | null>(null);
  const skippingPlayers = ref<Set<number>>(new Set());

  // Resolution state
  const revealed = ref<RevealedAction[]>([]);
  const currentStepIndex = ref(-1);
  const currentTargetPrompt = ref<TargetPrompt | null>(null);
  const multiTargetSelections = ref<TargetRef[]>([]);
  const highlightedTarget = ref<{ team: number; idx: number } | null>(null);
  const roundComplete = ref(false);
  // Char indices (team 0) who may still swap their revealed card via Estat de flux.
  const flowSwappers = ref<number[]>([]);

  const playerTeam = computed<Character[]>(() => (engine.value?.teams[0] ?? []) as Character[]);
  const enemyTeam = computed<Character[]>(() => (engine.value?.teams[1] ?? []) as Character[]);

  // --- Setup ---------------------------------------------------------------

  // There is no addPlayer/removePlayer here: the players ARE the stored party,
  // edited through <PartyRoster> in whichever screen the GM happens to be in.
  function addEnemy(spec: EnemySpec) {
    if (enemySpecs.value.length >= 10) return;
    enemySpecs.value = [...enemySpecs.value, spec];
  }
  function removeEnemy(idx: number) {
    enemySpecs.value = enemySpecs.value.filter((_, i) => i !== idx);
  }

  function buildPlayers(): Character[] {
    return playerSpecs.value.map((s, i) => buildCharacter(heroBuildSpec(s, i)));
  }

  function buildEnemies(): Character[] {
    return enemySpecs.value.map((s, i) => {
      const t = getEnemy(s.enemyId);
      if (!t) throw new Error(`Unknown enemy ${s.enemyId}`);
      return createEnemyFrom(t, {
        pv: s.pv, level: s.level, name: `${t.displayName} ${i + 1}`, equipment: s.equipment,
      });
    });
  }

  function canStart(): boolean {
    return playerSpecs.value.length > 0 && enemySpecs.value.length > 0;
  }

  function startCombat() {
    if (!canStart()) return;
    const players = buildPlayers();
    const enemies = buildEnemies();
    // Players are human-controlled; the factory marks enemies aiControlled.
    // The enemies think one round ahead (aiDepth 1) — the same AI the balancer
    // priced the encounter with, so the fight plays out as advertised.
    engine.value = new CombatEngine(players, enemies, { registry, maxRounds: 50, aiDepth: 1 });
    combatLog.value = [];
    winner.value = null;
    startNewRound();
  }

  // --- Round flow ----------------------------------------------------------

  function startNewRound() {
    const eng = engine.value;
    if (!eng) return;
    if (eng.isOver() || eng.round >= eng.maxRounds) { endCombat(); return; }

    const prep = eng.prepareRound();
    combatLog.value = [...eng.logEntries];
    skippingPlayers.value = new Set(prep.skipping.filter(s => s.team === 0).map(s => s.idx));
    playerSelections.value = new Map();
    revealed.value = [];
    currentStepIndex.value = -1;
    currentTargetPrompt.value = null;
    multiTargetSelections.value = [];
    highlightedTarget.value = null;
    roundComplete.value = false;
    flowSwappers.value = [];
    gamePhase.value = 'card-selection';
  }

  function selectCard(charIdx: number, actionIdx: number) {
    const eng = engine.value;
    if (!eng) return;
    const c = eng.teams[0][charIdx];
    if (!c?.isAlive() || skippingPlayers.value.has(charIdx)) return;
    const action = c.actions[actionIdx];
    if (!action?.isAvailable() || c.isActionSetAside(actionIdx)) return;
    if (!eng.canPlayActionIdx(c, actionIdx)) return;
    if (playerSelections.value.get(charIdx) === actionIdx) playerSelections.value.delete(charIdx);
    else playerSelections.value.set(charIdx, actionIdx);
    playerSelections.value = new Map(playerSelections.value);
  }

  function canConfirmCards(): boolean {
    const eng = engine.value;
    if (!eng) return false;
    return eng.teams[0].every((c, i) =>
      !c.isAlive() || skippingPlayers.value.has(i) || playerSelections.value.has(i));
  }

  function confirmCards() {
    const eng = engine.value;
    if (!eng) return;
    const selections = [...playerSelections.value.entries()].map(([idx, actionIdx]) => ({
      team: 0, idx, actionIdx,
    }));
    revealed.value = eng.planActions(selections);
    flowSwappers.value = eng.flowSwapRefs().filter(r => r.team === 0).map(r => r.idx);
    currentStepIndex.value = -1;
    roundComplete.value = false;
    gamePhase.value = 'reveal';
  }

  /** Estat de flux: replace a revealed card with another, after seeing the table. */
  function flowSwapCard(charIdx: number, actionIdx: number) {
    const eng = engine.value;
    if (!eng) return;
    revealed.value = eng.flowSwap({ team: 0, idx: charIdx }, actionIdx);
    flowSwappers.value = eng.flowSwapRefs().filter(r => r.team === 0).map(r => r.idx);
  }

  /** Remaining card-swap charges of a team-0 character. */
  function cardSwapCharges(charIdx: number): number {
    const eng = engine.value;
    const c = eng?.teams[0][charIdx];
    return eng && c ? eng.cardSwapCharges(c as Character) : 0;
  }

  function startResolving() {
    gamePhase.value = 'resolving';
    advanceResolution();
  }

  /** Resolve one step; pause on a target prompt or after a resolved action. */
  function advanceResolution() {
    const eng = engine.value;
    if (!eng || roundComplete.value) return;
    const step = eng.resolveNextAction();
    if (step.kind === 'target') {
      currentTargetPrompt.value = step.prompt;
      multiTargetSelections.value = [];
      return;
    }
    if (step.kind === 'done') {
      roundComplete.value = true;
      return;
    }
    // resolved
    currentTargetPrompt.value = null;
    currentStepIndex.value = eng.currentPendingIndex - 1;
    // Re-sync the revealed card with its resolution outcome, and darken every
    // card ALREADY known to never happen (a focus whose holder just took
    // damage goes dark the moment the hit lands, not when its turn comes).
    if (currentStepIndex.value >= 0) revealed.value[currentStepIndex.value] = step.action;
    const doomed = eng.pendingCancelled();
    revealed.value = revealed.value.map((r, i) => (doomed[i] && !r.cancelled ? { ...r, cancelled: true } : r));
    combatLog.value = [...eng.logEntries];
    highlightedTarget.value = inferHighlight(step.logs);
    if (step.done) roundComplete.value = true;
  }

  function inferHighlight(logs: LogEntry[]): { team: number; idx: number } | null {
    const eng = engine.value;
    if (!eng) return null;
    for (const log of logs) {
      const msg = log.message;
      let m = msg.match(/colpeja ([^:(]+)/);          // hit target
      if (!m) m = msg.match(/protegeix ([^.]+)\./);   // guard declaration → protected ally
      // Block declaration: `X «acció» bloqueja Y.` — but NOT `bloqueja l'atac de …`
      // (deflected attack, no useful single target) nor `Y bloqueja X «acció».`.
      if (!m) m = msg.match(/» bloqueja ([^.«]+)\./); // blocked enemy
      if (!m) m = msg.match(/^([^«]+) «[^»]*» es posa en guàrdia/); // self-guard → defender
      if (m) {
        const name = (m[1] ?? '').trim().split(',')[0].trim();
        for (let t = 0; t < 2; t++) {
          const idx = eng.teams[t].findIndex(c => c.name === name);
          if (idx >= 0) return { team: t, idx };
        }
      }
    }
    return null;
  }

  // --- Target selection during resolution ----------------------------------

  function selectTarget(team: number, idx: number) {
    const eng = engine.value;
    const prompt = currentTargetPrompt.value;
    if (!eng || !prompt) return;
    if (prompt.count > 1) {
      const i = multiTargetSelections.value.findIndex(t => t.team === team && t.idx === idx);
      if (i >= 0) multiTargetSelections.value.splice(i, 1);
      else multiTargetSelections.value.push({ team, idx });
      multiTargetSelections.value = [...multiTargetSelections.value];
      if (multiTargetSelections.value.length === prompt.count) confirmTargets();
      return;
    }
    eng.setResolveTarget([{ team, idx }]);
    currentTargetPrompt.value = null;
    advanceResolution();
  }

  function confirmTargets() {
    const eng = engine.value;
    if (!eng || !currentTargetPrompt.value) return;
    eng.setResolveTarget([...multiTargetSelections.value]);
    currentTargetPrompt.value = null;
    multiTargetSelections.value = [];
    advanceResolution();
  }

  function nextRound() {
    const eng = engine.value;
    if (!eng) return;
    eng.finishRound();
    combatLog.value = [...eng.logEntries];
    highlightedTarget.value = null;
    if (eng.isOver() || eng.round >= eng.maxRounds) endCombat();
    else startNewRound();
  }

  function endCombat() {
    const eng = engine.value;
    if (!eng) return;
    winner.value = eng.winner();
    gamePhase.value = 'victory';
  }

  // Arriving from the creator there is nothing left to set up: it settled both
  // sides — the enemies it solved, and the party it priced them against — so
  // «Combat contra la IA» drops straight into the fight. If the party is empty
  // the setup screen still appears, which is where that gets fixed.
  if (handoff && canStart()) startCombat();

  function playAgain() {
    gamePhase.value = 'setup';
    engine.value = null;
    combatLog.value = [];
    playerSelections.value = new Map();
    winner.value = null;
    revealed.value = [];
    roundComplete.value = false;
  }

  return {
    gamePhase, engine, playerTeam, enemyTeam,
    playerSpecs, enemySpecs,
    combatLog, playerSelections, skippingPlayers, winner,
    revealed, currentStepIndex, currentTargetPrompt, multiTargetSelections,
    highlightedTarget, roundComplete, flowSwappers,
    addEnemy, removeEnemy, canStart, startCombat,
    selectCard, canConfirmCards, confirmCards, startResolving, advanceResolution,
    selectTarget, confirmTargets, nextRound, playAgain, flowSwapCard, cardSwapCharges,
  };
}

export type Game = ReturnType<typeof useGame>;
