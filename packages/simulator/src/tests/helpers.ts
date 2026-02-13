import {
  Character,
  CombatEngine,
  newCombatStats,
  mergeCombatStats,
  createFighter,
  createWizard,
  createRogue,
  createBarbarian,
  createGoblin,
  createGoblinShaman,
  ALL_EQUIPMENT,
  EquipmentSlot,
  AIStrategy,
} from '@pimpampum/engine';
import type { CombatStats, EquipmentTemplate } from '@pimpampum/engine';

// =============================================================================
// TYPES
// =============================================================================

export type CharacterCreator = (name: string) => Character;

export interface SimulationResults {
  team1Wins: number;
  team2Wins: number;
  draws: number;
  totalRounds: number;
  numSimulations: number;
  maxRoundsReached: number;
  stats: CombatStats;
}

// =============================================================================
// RANDOM EQUIPMENT
// =============================================================================

const equipmentBySlot = new Map<EquipmentSlot, EquipmentTemplate[]>();
for (const tmpl of ALL_EQUIPMENT) {
  const list = equipmentBySlot.get(tmpl.slot) ?? [];
  list.push(tmpl);
  equipmentBySlot.set(tmpl.slot, list);
}

function assignRandomEquipment(character: Character): void {
  for (const [, items] of equipmentBySlot) {
    const roll = Math.floor(Math.random() * (items.length + 1));
    if (roll < items.length) {
      character.equip(items[roll].creator());
    }
  }
}

// =============================================================================
// SIMULATION RUNNERS
// =============================================================================

export function runMatchup(
  team1Creators: CharacterCreator[],
  team2Creators: CharacterCreator[],
  numSimulations: number,
): SimulationResults {
  const results: SimulationResults = {
    team1Wins: 0,
    team2Wins: 0,
    draws: 0,
    totalRounds: 0,
    maxRoundsReached: 0,
    numSimulations,
    stats: newCombatStats(),
  };

  for (let i = 0; i < numSimulations; i++) {
    const team1 = team1Creators.map((creator, j) => {
      const c = creator(`T1_${j}_${i}`);
      assignRandomEquipment(c);
      return c;
    });
    const team2 = team2Creators.map((creator, j) => {
      const c = creator(`T2_${j}_${i}`);
      assignRandomEquipment(c);
      return c;
    });

    const team1Classes = team1.map(c => c.characterClass);
    const team2Classes = team2.map(c => c.characterClass);

    const engine = new CombatEngine(team1, team2, false);
    const winner = engine.runCombat();

    results.totalRounds += engine.roundNumber;
    if (engine.roundNumber >= engine.maxRounds) results.maxRoundsReached++;
    mergeCombatStats(results.stats, engine.stats);

    for (const cls of team1Classes) {
      results.stats.classGames.set(cls, (results.stats.classGames.get(cls) ?? 0) + 1);
      if (winner === 1) results.stats.classWins.set(cls, (results.stats.classWins.get(cls) ?? 0) + 1);
    }
    for (const cls of team2Classes) {
      results.stats.classGames.set(cls, (results.stats.classGames.get(cls) ?? 0) + 1);
      if (winner === 2) results.stats.classWins.set(cls, (results.stats.classWins.get(cls) ?? 0) + 1);
    }

    if (winner === 1) results.team1Wins++;
    else if (winner === 2) results.team2Wins++;
    else results.draws++;
  }

  return results;
}

/**
 * Run simulations with forced strategies (bypasses runCombat's assignStrategies).
 * Uses a manual loop with runRound() so strategies aren't overwritten.
 * Accepts per-character strategy arrays — strategies cycle over team members.
 */
export function runWithStrategies(
  team1Creators: CharacterCreator[],
  team2Creators: CharacterCreator[],
  strategies1: AIStrategy[],
  strategies2: AIStrategy[],
  numSimulations: number,
): SimulationResults {
  const results: SimulationResults = {
    team1Wins: 0,
    team2Wins: 0,
    draws: 0,
    totalRounds: 0,
    maxRoundsReached: 0,
    numSimulations,
    stats: newCombatStats(),
  };

  for (let i = 0; i < numSimulations; i++) {
    const team1 = team1Creators.map((creator, j) => {
      const c = creator(`T1_${j}_${i}`);
      assignRandomEquipment(c);
      return c;
    });
    const team2 = team2Creators.map((creator, j) => {
      const c = creator(`T2_${j}_${i}`);
      assignRandomEquipment(c);
      return c;
    });

    const team1Classes = team1.map(c => c.characterClass);
    const team2Classes = team2.map(c => c.characterClass);

    const engine = new CombatEngine(team1, team2, false);

    // Force per-character strategies (cycle over the array)
    for (let j = 0; j < team1.length; j++) team1[j].aiStrategy = strategies1[j % strategies1.length];
    for (let j = 0; j < team2.length; j++) team2[j].aiStrategy = strategies2[j % strategies2.length];

    while (engine.roundNumber < engine.maxRounds) {
      if (!engine.runRound()) break;
    }

    const team1Alive = team1.filter(c => c.isAlive()).length;
    const team2Alive = team2.filter(c => c.isAlive()).length;

    let winner: number;
    if (team1Alive > 0 && team2Alive === 0) winner = 1;
    else if (team2Alive > 0 && team1Alive === 0) winner = 2;
    else if (team1Alive > team2Alive) winner = 1;
    else if (team2Alive > team1Alive) winner = 2;
    else winner = 0;

    // Record winner's cards
    const winnerCards = winner === 1 ? engine.team1CardsPlayed : winner === 2 ? engine.team2CardsPlayed : null;
    if (winnerCards) {
      for (const [cardName, cardType] of winnerCards) {
        if (!engine.stats.cardStats.has(cardName)) engine.stats.cardStats.set(cardName, { plays: 0, playsByWinner: 0, interrupted: 0 });
        engine.stats.cardStats.get(cardName)!.playsByWinner++;
        if (!engine.stats.cardTypeStats.has(cardType)) engine.stats.cardTypeStats.set(cardType, { plays: 0, playsByWinner: 0, interrupted: 0 });
        engine.stats.cardTypeStats.get(cardType)!.playsByWinner++;
      }
    }

    // Record strategy stats
    const winnerTeam = winner === 1 ? team1 : winner === 2 ? team2 : null;
    for (const c of [...team1, ...team2]) {
      if (c.aiStrategy) {
        const entry = engine.stats.strategyStats.get(c.aiStrategy) ?? { games: 0, wins: 0 };
        entry.games++;
        if (winnerTeam && winnerTeam.includes(c)) entry.wins++;
        engine.stats.strategyStats.set(c.aiStrategy, entry);
      }
    }

    results.totalRounds += engine.roundNumber;
    if (engine.roundNumber >= engine.maxRounds) results.maxRoundsReached++;
    mergeCombatStats(results.stats, engine.stats);

    for (const cls of team1Classes) {
      results.stats.classGames.set(cls, (results.stats.classGames.get(cls) ?? 0) + 1);
      if (winner === 1) results.stats.classWins.set(cls, (results.stats.classWins.get(cls) ?? 0) + 1);
    }
    for (const cls of team2Classes) {
      results.stats.classGames.set(cls, (results.stats.classGames.get(cls) ?? 0) + 1);
      if (winner === 2) results.stats.classWins.set(cls, (results.stats.classWins.get(cls) ?? 0) + 1);
    }

    if (winner === 1) results.team1Wins++;
    else if (winner === 2) results.team2Wins++;
    else results.draws++;
  }

  return results;
}

// =============================================================================
// TEAM COMPOSITION GENERATION
// =============================================================================

export function getAllCreators(): [string, CharacterCreator][] {
  return [
    ['Fighter', createFighter],
    ['Wizard', createWizard],
    ['Rogue', createRogue],
    ['Barbarian', createBarbarian],
    ['Goblin', createGoblin],
    ['GoblinShaman', createGoblinShaman],
  ];
}

export function getPlayerCreators(): [string, CharacterCreator][] {
  return [
    ['Fighter', createFighter],
    ['Wizard', createWizard],
    ['Rogue', createRogue],
    ['Barbarian', createBarbarian],
  ];
}

function combinationsWithReplacement(n: number, k: number): number[][] {
  const results: number[][] = [];
  const current: number[] = [];
  function generate(start: number, remaining: number): void {
    if (remaining === 0) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < n; i++) {
      current.push(i);
      generate(i, remaining - 1);
      current.pop();
    }
  }
  generate(0, k);
  return results;
}

export function generateTeamCompositions(teamSize: number, creatorsSource?: [string, CharacterCreator][]): [string, CharacterCreator[]][] {
  const creators = creatorsSource ?? getAllCreators();
  const compositions: [string, CharacterCreator[]][] = [];

  for (const indices of combinationsWithReplacement(creators.length, teamSize)) {
    const teamCreators = indices.map(i => creators[i][1]);
    const counts = new Map<number, number>();
    for (const idx of indices) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    const parts: string[] = [];
    for (const [idx, count] of counts) {
      parts.push(count > 1 ? `${count}x ${creators[idx][0]}` : creators[idx][0]);
    }
    compositions.push([parts.join('+'), teamCreators]);
  }

  return compositions;
}
