import { ref, computed } from 'vue';
import {
  CombatEngine,
  selectCardAI,
  assignStrategies,
  getCardTargetRequirement,
  getCardTargetCount,
  ALL_CHARACTER_TEMPLATES,
  ALL_EQUIPMENT,
} from '@pimpampum/engine';
import type { LogEntry, CharacterTemplate, CardSelection, PlannedAction } from '@pimpampum/engine';

export type GamePhase = 'setup' | 'card-selection' | 'reveal' | 'resolving' | 'victory';

export interface PlayerSelection {
  cardIdx: number;
}

export interface TargetPrompt {
  charIdx: number;
  charName: string;
  cardName: string;
  requirement: 'enemy' | 'ally' | 'ally_other';
  count: number;
}

export function useGame() {
  const gamePhase = ref<GamePhase>('setup');
  const engine = ref<CombatEngine | null>(null);
  const playerTeamTemplates = ref<CharacterTemplate[]>([]);
  const enemyTeamTemplates = ref<CharacterTemplate[]>([]);
  const playerEquipment = ref<string[][]>([]);
  const enemyEquipment = ref<string[][]>([]);
  const combatLog = ref<LogEntry[]>([]);
  const playerSelections = ref<Map<number, PlayerSelection>>(new Map());
  const winner = ref<number>(0);
  const roundSkipping = ref<Map<number, Set<number>>>(new Map());

  // Resolution-time target selection
  const currentTargetPrompt = ref<TargetPrompt | null>(null);
  const multiTargetSelections = ref<[number, number][]>([]);

  // Step-by-step resolution state
  const actionQueue = ref<PlannedAction[]>([]);
  const currentActionIndex = ref(-1);
  const highlightedTarget = ref<{ team: number; charIdx: number } | null>(null);
  const roundComplete = ref(false);

  const playerTeam = computed(() => engine.value?.team1 ?? []);
  const enemyTeam = computed(() => engine.value?.team2 ?? []);

  function addToPlayerTeam(template: CharacterTemplate) {
    if (playerTeamTemplates.value.length >= 3) return;
    playerTeamTemplates.value.push(template);
    playerEquipment.value.push([]);
  }

  function removeFromPlayerTeam(index: number) {
    playerTeamTemplates.value.splice(index, 1);
    playerEquipment.value.splice(index, 1);
  }

  function addToEnemyTeam(template: CharacterTemplate) {
    if (enemyTeamTemplates.value.length >= 3) return;
    enemyTeamTemplates.value.push(template);
    enemyEquipment.value.push([]);
  }

  function removeFromEnemyTeam(index: number) {
    enemyTeamTemplates.value.splice(index, 1);
    enemyEquipment.value.splice(index, 1);
  }

  function setPlayerEquipment(charIdx: number, equipIds: string[]) {
    playerEquipment.value[charIdx] = equipIds;
    playerEquipment.value = [...playerEquipment.value];
  }

  function setEnemyEquipment(charIdx: number, equipIds: string[]) {
    enemyEquipment.value[charIdx] = equipIds;
    enemyEquipment.value = [...enemyEquipment.value];
  }

  function applyEquipment(character: ReturnType<CharacterTemplate['creator']>, equipIds: string[]) {
    character.equipment = [];
    const lookup = new Map(ALL_EQUIPMENT.map(e => [e.id, e]));
    for (const id of equipIds) {
      const tmpl = lookup.get(id);
      if (tmpl) character.equip(tmpl.creator());
    }
  }

  function startCombat() {
    if (playerTeamTemplates.value.length === 0 || enemyTeamTemplates.value.length === 0) return;

    const team1 = playerTeamTemplates.value.map((t, i) => {
      const c = t.creator(`${t.displayName} ${i + 1}`);
      applyEquipment(c, playerEquipment.value[i] ?? []);
      return c;
    });
    const team2 = enemyTeamTemplates.value.map((t, i) => {
      const c = t.creator(`${t.displayName} ${i + 1}`);
      applyEquipment(c, enemyEquipment.value[i] ?? []);
      return c;
    });

    engine.value = new CombatEngine(team1, team2);
    assignStrategies(team2);
    combatLog.value = [];
    playerSelections.value = new Map();
    winner.value = 0;

    startNewRound();
  }

  function startNewRound() {
    if (!engine.value) return;

    if (engine.value.isCombatOver() || engine.value.roundNumber >= engine.value.maxRounds) {
      endCombat();
      return;
    }

    const result = engine.value.prepareRound();
    roundSkipping.value = result.skipping;
    combatLog.value.push(...engine.value.logEntries);
    playerSelections.value = new Map();
    currentTargetPrompt.value = null;
    actionQueue.value = [];
    currentActionIndex.value = -1;
    highlightedTarget.value = null;
    roundComplete.value = false;
    gamePhase.value = 'card-selection';
  }

  function selectCard(charIdx: number, cardIdx: number) {
    const current = playerSelections.value.get(charIdx);
    if (current?.cardIdx === cardIdx) {
      playerSelections.value.delete(charIdx);
    } else {
      playerSelections.value.set(charIdx, { cardIdx });
    }
    playerSelections.value = new Map(playerSelections.value);
  }

  function canConfirmCards(): boolean {
    if (!engine.value) return false;
    const team = engine.value.team1;
    const skips = roundSkipping.value.get(1) ?? new Set();
    for (let i = 0; i < team.length; i++) {
      if (!team[i].isAlive() || skips.has(i)) continue;
      if (!playerSelections.value.has(i)) return false;
    }
    return true;
  }

  function confirmCards() {
    if (!engine.value) return;
    resolveRound();
  }

  function resolveRound() {
    if (!engine.value) return;

    // Build selection map — card choices only, no targets yet
    const selections = new Map<string, CardSelection>();

    for (const [charIdx, sel] of playerSelections.value) {
      const name = engine.value.team1[charIdx].name;
      selections.set(name, { cardIdx: sel.cardIdx });
    }

    // AI selections for enemy team
    const skips2 = roundSkipping.value.get(2) ?? new Set();
    for (let i = 0; i < engine.value.team2.length; i++) {
      if (!engine.value.team2[i].isAlive() || skips2.has(i)) continue;
      const cardIdx = selectCardAI(engine.value.team2[i], engine.value);
      engine.value.team2[i].playedCardIdx = cardIdx;
      selections.set(engine.value.team2[i].name, { cardIdx });
    }

    const planned = engine.value.planActions(selections);
    actionQueue.value = planned;
    currentActionIndex.value = -1;
    highlightedTarget.value = null;
    roundComplete.value = false;
    gamePhase.value = 'reveal';
  }

  function startResolving() {
    gamePhase.value = 'resolving';
    advanceResolution();
  }

  function advanceResolution() {
    if (!engine.value) return;

    // Check if the next action needs a player target
    const nextIdx = engine.value.pendingActionIndex;
    if (nextIdx < engine.value.pendingActions.length) {
      const next = engine.value.pendingActions[nextIdx];
      if (next.team === 1) {
        const ch = engine.value.team1[next.charIdx];
        if (ch.isAlive()) {
          const card = ch.cards[next.cardIdx];
          const req = getCardTargetRequirement(card);
          if (req !== 'none') {
            const count = getCardTargetCount(card);
            multiTargetSelections.value = [];
            currentTargetPrompt.value = {
              charIdx: next.charIdx,
              charName: next.characterName,
              cardName: next.cardName,
              requirement: req,
              count,
            };
            return; // Wait for target selection
          }
        }
      }
    }

    doResolveNext();
  }

  function toggleMultiTarget(team: number, idx: number) {
    const existing = multiTargetSelections.value.findIndex(t => t[0] === team && t[1] === idx);
    if (existing >= 0) {
      multiTargetSelections.value.splice(existing, 1);
    } else {
      multiTargetSelections.value.push([team, idx]);
    }
    multiTargetSelections.value = [...multiTargetSelections.value];
  }

  function confirmMultiTarget() {
    if (!currentTargetPrompt.value || !engine.value) return;
    const prompt = currentTargetPrompt.value;
    const charName = engine.value.team1[prompt.charIdx].name;

    if (prompt.requirement === 'enemy') {
      engine.value.setResolveTarget(charName, { attackTargets: multiTargetSelections.value });
    } else {
      engine.value.setResolveTarget(charName, { allyTargets: multiTargetSelections.value });
    }

    multiTargetSelections.value = [];
    currentTargetPrompt.value = null;
    doResolveNext();
  }

  function selectTarget(team: number, idx: number) {
    if (!currentTargetPrompt.value || !engine.value) return;

    const prompt = currentTargetPrompt.value;

    // Multi-target: accumulate selections
    if (prompt.count > 1) {
      toggleMultiTarget(team, idx);
      if (multiTargetSelections.value.length === prompt.count) {
        confirmMultiTarget();
      }
      return;
    }

    // Single target
    const charName = engine.value.team1[prompt.charIdx].name;
    const targets: { attackTarget?: [number, number]; allyTarget?: [number, number] } = {};

    if (prompt.requirement === 'enemy') {
      targets.attackTarget = [team, idx];
    } else {
      targets.allyTarget = [team, idx];
    }

    engine.value.setResolveTarget(charName, targets);
    currentTargetPrompt.value = null;
    doResolveNext();
  }

  function doResolveNext() {
    if (!engine.value) return;

    const result = engine.value.resolveNextAction();
    if (result.logs.length > 0) {
      combatLog.value.push(...result.logs);
    }
    currentActionIndex.value = engine.value.pendingActionIndex - 1;

    // Infer highlight target from logs
    highlightedTarget.value = null;
    if (result.action) {
      for (const log of result.logs) {
        if ((log.type === 'hit' || log.type === 'miss' || log.type === 'defense') && log.characterName) {
          const found = findCharacterByName(log.characterName);
          if (found) {
            highlightedTarget.value = found;
          }
        }
      }
    }

    if (result.done) {
      roundComplete.value = true;
    }
  }

  function findCharacterByName(name: string): { team: number; charIdx: number } | null {
    if (!engine.value) return null;
    for (let i = 0; i < engine.value.team1.length; i++) {
      if (engine.value.team1[i].name === name) return { team: 1, charIdx: i };
    }
    for (let i = 0; i < engine.value.team2.length; i++) {
      if (engine.value.team2[i].name === name) return { team: 2, charIdx: i };
    }
    return null;
  }

  function nextRound() {
    if (!engine.value) return;
    engine.value.finishRound();
    actionQueue.value = [];
    currentActionIndex.value = -1;
    highlightedTarget.value = null;
    roundComplete.value = false;

    if (engine.value.isCombatOver() || engine.value.roundNumber >= engine.value.maxRounds) {
      endCombat();
    } else {
      startNewRound();
    }
  }

  function endCombat() {
    if (!engine.value) return;
    const team1Alive = engine.value.team1.filter(c => c.isAlive()).length;
    const team2Alive = engine.value.team2.filter(c => c.isAlive()).length;

    if (team1Alive > team2Alive) winner.value = 1;
    else if (team2Alive > team1Alive) winner.value = 2;
    else winner.value = 0;

    gamePhase.value = 'victory';
  }

  function playAgain() {
    gamePhase.value = 'setup';
    engine.value = null;
    combatLog.value = [];
    playerSelections.value = new Map();
    winner.value = 0;
    actionQueue.value = [];
    currentActionIndex.value = -1;
    highlightedTarget.value = null;
    roundComplete.value = false;
    playerEquipment.value = [];
    enemyEquipment.value = [];
  }

  return {
    gamePhase,
    engine,
    playerTeam,
    enemyTeam,
    playerTeamTemplates,
    enemyTeamTemplates,
    combatLog,
    playerSelections,
    winner,
    roundSkipping,
    currentTargetPrompt,
    multiTargetSelections,
    actionQueue,
    currentActionIndex,
    highlightedTarget,
    roundComplete,
    playerEquipment,
    enemyEquipment,
    addToPlayerTeam,
    removeFromPlayerTeam,
    addToEnemyTeam,
    removeFromEnemyTeam,
    setPlayerEquipment,
    setEnemyEquipment,
    startCombat,
    selectCard,
    canConfirmCards,
    confirmCards,
    selectTarget,
    confirmMultiTarget,
    startResolving,
    advanceResolution,
    nextRound,
    playAgain,
    allTemplates: ALL_CHARACTER_TEMPLATES,
  };
}
