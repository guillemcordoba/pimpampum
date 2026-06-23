import { ref, computed } from 'vue';
import {
  Character, CombatEngine, assignStrategies, AIStrategy,
} from '@pimpampum/engine';
import type { LogEntry, RevealedAction, TargetPrompt, TargetRef } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemyFromTemplate, getEnemyTemplate } from '@pimpampum/enemies';

export type GamePhase = 'setup' | 'card-selection' | 'reveal' | 'resolving' | 'victory';

/** A player character being built in the setup screen. */
export interface PlayerSpec {
  name: string;
  classCss: string;
  iconPath: string;
  pv: number;
  skills: Record<string, number>;
  equipment: string[];
}

/** An enemy entry in the setup screen (template + level + equipment). */
export interface EnemySpec {
  templateId: string;
  level: number;
  equipment: string[];
}

const registry = createRegistry();

export function useGame() {
  const gamePhase = ref<GamePhase>('setup');
  const engine = ref<CombatEngine | null>(null);

  const playerSpecs = ref<PlayerSpec[]>([]);
  const enemySpecs = ref<EnemySpec[]>([]);

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

  const playerTeam = computed<Character[]>(() => (engine.value?.teams[0] ?? []) as Character[]);
  const enemyTeam = computed<Character[]>(() => (engine.value?.teams[1] ?? []) as Character[]);

  // --- Setup ---------------------------------------------------------------

  function addPlayer(spec: PlayerSpec) {
    if (playerSpecs.value.length >= 10) return;
    playerSpecs.value = [...playerSpecs.value, spec];
  }
  function removePlayer(idx: number) {
    playerSpecs.value = playerSpecs.value.filter((_, i) => i !== idx);
  }
  function addEnemy(spec: EnemySpec) {
    if (enemySpecs.value.length >= 10) return;
    enemySpecs.value = [...enemySpecs.value, spec];
  }
  function removeEnemy(idx: number) {
    enemySpecs.value = enemySpecs.value.filter((_, i) => i !== idx);
  }

  function buildPlayers(): Character[] {
    return playerSpecs.value.map((s, i) => buildCharacter({
      name: s.name || `Heroi ${i + 1}`,
      classCss: s.classCss,
      iconPath: s.iconPath,
      pv: s.pv,
      skills: s.skills,
      equipment: s.equipment,
      category: 'player',
    }));
  }

  function buildEnemies(): Character[] {
    return enemySpecs.value.map((s, i) => {
      const t = getEnemyTemplate(s.templateId);
      if (!t) throw new Error(`Unknown enemy ${s.templateId}`);
      const levels = Object.fromEntries(t.skills.map(sk => [sk, s.level]));
      return createEnemyFromTemplate(t, levels, `${t.displayName} ${i + 1}`, s.equipment);
    });
  }

  function canStart(): boolean {
    return playerSpecs.value.length > 0 && enemySpecs.value.length > 0;
  }

  function startCombat() {
    if (!canStart()) return;
    const players = buildPlayers();
    const enemies = buildEnemies();
    // Players are human-controlled (aiStrategy null); enemies are AI.
    assignStrategies(enemies, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    engine.value = new CombatEngine(players, enemies, { registry, maxRounds: 50 });
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
    currentStepIndex.value = -1;
    roundComplete.value = false;
    gamePhase.value = 'reveal';
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
    combatLog.value = [...eng.logEntries];
    highlightedTarget.value = inferHighlight(step.logs);
    if (step.done) roundComplete.value = true;
  }

  function inferHighlight(logs: LogEntry[]): { team: number; idx: number } | null {
    const eng = engine.value;
    if (!eng) return null;
    for (const log of logs) {
      const m = log.message.match(/colpeja ([^:(]+)|protegeix ([^.]+)|bloqueja l'atac de/);
      if (m) {
        const name = (m[1] ?? m[2] ?? '').trim().split(',')[0].trim();
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
    highlightedTarget, roundComplete,
    addPlayer, removePlayer, addEnemy, removeEnemy, canStart, startCombat,
    selectCard, canConfirmCards, confirmCards, startResolving, advanceResolution,
    selectTarget, confirmTargets, nextRound, playAgain,
  };
}

export type Game = ReturnType<typeof useGame>;
