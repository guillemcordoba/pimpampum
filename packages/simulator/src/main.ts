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
  createCleric,
  createGoblinShaman,
  createBasilisk,
  ALL_EQUIPMENT,
  EquipmentSlot,
} from '@pimpampum/engine';
import type { CombatStats, EquipmentTemplate } from '@pimpampum/engine';

// =============================================================================
// RANDOM EQUIPMENT ASSIGNMENT
// =============================================================================

const equipmentBySlot = new Map<EquipmentSlot, EquipmentTemplate[]>();
for (const tmpl of ALL_EQUIPMENT) {
  const list = equipmentBySlot.get(tmpl.slot) ?? [];
  list.push(tmpl);
  equipmentBySlot.set(tmpl.slot, list);
}

function assignRandomEquipment(character: Character): void {
  for (const [, items] of equipmentBySlot) {
    // Equally likely: nothing or any of the items in this slot
    const roll = Math.floor(Math.random() * (items.length + 1));
    if (roll < items.length) {
      character.equip(items[roll].creator());
    }
  }
}

// =============================================================================
// SIMULATION RUNNER
// =============================================================================

interface SimulationResults {
  team1Wins: number;
  team2Wins: number;
  draws: number;
  totalRounds: number;
  numSimulations: number;
  stats: CombatStats;
}

type CharacterCreator = (name: string) => Character;

function runSimulation(
  team1Creators: CharacterCreator[],
  team2Creators: CharacterCreator[],
  numSimulations: number,
  verbose = false,
): SimulationResults {
  const results: SimulationResults = {
    team1Wins: 0,
    team2Wins: 0,
    draws: 0,
    totalRounds: 0,
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

    const engine = new CombatEngine(team1, team2, verbose);
    const winner = engine.runCombat();

    results.totalRounds += engine.roundNumber;
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
// BATTLE CONFIGURATION
// =============================================================================

function getAllCreators(): [string, CharacterCreator][] {
  return [
    ['Fighter', createFighter],
    ['Wizard', createWizard],
    ['Rogue', createRogue],
    ['Barbarian', createBarbarian],
    ['Cleric', createCleric],
    ['Goblin', createGoblin],
    ['GoblinShaman', createGoblinShaman],
    ['Basilisk', createBasilisk],
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

function generateTeamCompositions(teamSize: number): [string, CharacterCreator[]][] {
  const creators = getAllCreators();
  const compositions: [string, CharacterCreator[]][] = [];

  for (const indices of combinationsWithReplacement(creators.length, teamSize)) {
    const teamCreators = indices.map(i => creators[i][1]);
    // Count occurrences of each class
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

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

function pad(str: string, width: number, right = false): string {
  if (right) return str.padStart(width);
  return str.padEnd(width);
}

function runBattleAnalysis(
  team1Size: number,
  team2Size: number,
  numSimulations: number,
): CombatStats {
  const label = `${team1Size}v${team2Size}`;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label} BATTLE ANALYSIS (${numSimulations} simulations per matchup)`);
  console.log('='.repeat(70));

  const team1Comps = generateTeamCompositions(team1Size);
  const team2Comps = generateTeamCompositions(team2Size);

  const allStats = newCombatStats();
  const teamWins = new Map<string, number>();
  const teamGames = new Map<string, number>();

  const colWidth = 12;

  // Print header
  let header = pad('', 20);
  for (const [name] of team2Comps) {
    const shortName = name.slice(0, colWidth - 1);
    header += pad(shortName, colWidth, true);
  }
  console.log(`\n${header}`);
  console.log('-'.repeat(20 + team2Comps.length * colWidth));

  for (const [name1, creators1] of team1Comps) {
    const shortName1 = name1.slice(0, 19);
    let row = pad(shortName1, 20);

    for (const [name2, creators2] of team2Comps) {
      const results = runSimulation(creators1, creators2, numSimulations, false);
      mergeCombatStats(allStats, results.stats);

      const winRate = (results.team1Wins / results.numSimulations) * 100;
      row += pad(`${winRate.toFixed(1)}%`, colWidth, true);

      teamWins.set(name1, (teamWins.get(name1) ?? 0) + results.team1Wins);
      teamGames.set(name1, (teamGames.get(name1) ?? 0) + numSimulations);
      teamWins.set(name2, (teamWins.get(name2) ?? 0) + results.team2Wins);
      teamGames.set(name2, (teamGames.get(name2) ?? 0) + numSimulations);
    }
    console.log(row);
  }

  // Team power ranking
  console.log(`\n${label} Team Power Ranking:`);
  console.log('-'.repeat(50));

  const allTeamNames = new Set([...team1Comps.map(c => c[0]), ...team2Comps.map(c => c[0])]);
  const rankings: [string, number][] = [...allTeamNames].map(name => {
    const wins = teamWins.get(name) ?? 0;
    const games = teamGames.get(name) ?? 1;
    return [name, (wins / games) * 100];
  });

  rankings.sort((a, b) => b[1] - a[1]);

  for (let i = 0; i < Math.min(10, rankings.length); i++) {
    const [name, winRate] = rankings[i];
    const barLen = Math.floor(winRate / 2.5);
    const bar = '█'.repeat(barLen);
    console.log(`${pad(String(i + 1), 2, true)}. ${pad(name, 25)} ${pad(winRate.toFixed(1) + '%', 6, true)} ${bar}`);
  }

  return allStats;
}

function printClassStats(stats: CombatStats): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CLASS WIN RATES');
  console.log('='.repeat(60));
  console.log(`${pad('Class', 20)} ${pad('Games', 10, true)} ${pad('Wins', 10, true)} ${pad('Win Rate', 12, true)}`);
  console.log('-'.repeat(60));

  const classStats: [string, number][] = [...stats.classGames.entries()];
  classStats.sort((a, b) => {
    const rateA = (stats.classWins.get(a[0]) ?? 0) / a[1];
    const rateB = (stats.classWins.get(b[0]) ?? 0) / b[1];
    return rateB - rateA;
  });

  for (const [cls, games] of classStats) {
    const wins = stats.classWins.get(cls) ?? 0;
    const winRate = (wins / games) * 100;
    const barLen = Math.floor(winRate / 2.5);
    const bar = '█'.repeat(barLen);
    console.log(`${pad(cls, 20)} ${pad(String(games), 10, true)} ${pad(String(wins), 10, true)} ${pad(winRate.toFixed(1) + '%', 11, true)} ${bar}`);
  }
}

function printCardStats(stats: CombatStats): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CARD TYPE EFFECTIVENESS');
  console.log('='.repeat(60));
  console.log(`${pad('Type', 20)} ${pad('Plays', 8, true)} ${pad('By Winner', 10, true)} ${pad('Win Corr.', 12, true)} ${pad('Interrupt%', 10, true)}`);
  console.log('-'.repeat(60));

  const typeStats = [...stats.cardTypeStats.entries()];
  typeStats.sort((a, b) => {
    const corrA = a[1].playsByWinner / Math.max(1, a[1].plays);
    const corrB = b[1].playsByWinner / Math.max(1, b[1].plays);
    return corrB - corrA;
  });

  for (const [cardType, cs] of typeStats) {
    const winCorr = cs.plays > 0 ? (cs.playsByWinner / cs.plays) * 100 : 0;
    const intRate = cs.plays > 0 ? (cs.interrupted / cs.plays) * 100 : 0;
    console.log(`${pad(cardType, 20)} ${pad(String(cs.plays), 8, true)} ${pad(String(cs.playsByWinner), 10, true)} ${pad(winCorr.toFixed(1) + '%', 11, true)} ${pad(intRate.toFixed(1) + '%', 9, true)}`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('INDIVIDUAL CARD EFFECTIVENESS (sorted by win correlation)');
  console.log('='.repeat(80));
  console.log(`${pad('Card', 25)} ${pad('Plays', 8, true)} ${pad('By Winner', 10, true)} ${pad('Win Corr.', 12, true)} ${pad('Interrupt%', 10, true)}`);
  console.log('-'.repeat(80));

  const cardStats = [...stats.cardStats.entries()];
  cardStats.sort((a, b) => {
    const corrA = a[1].playsByWinner / Math.max(1, a[1].plays);
    const corrB = b[1].playsByWinner / Math.max(1, b[1].plays);
    return corrB - corrA;
  });

  for (const [cardName, cs] of cardStats) {
    const winCorr = cs.plays > 0 ? (cs.playsByWinner / cs.plays) * 100 : 0;
    const intRate = cs.plays > 0 ? (cs.interrupted / cs.plays) * 100 : 0;
    console.log(`${pad(cardName, 25)} ${pad(String(cs.plays), 8, true)} ${pad(String(cs.playsByWinner), 10, true)} ${pad(winCorr.toFixed(1) + '%', 11, true)} ${pad(intRate.toFixed(1) + '%', 9, true)}`);
  }
}

function printStrategyStats(stats: CombatStats): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('STRATEGY EFFECTIVENESS');
  console.log('='.repeat(60));
  console.log(`${pad('Strategy', 12)} ${pad('Games', 10, true)} ${pad('Wins', 10, true)} ${pad('Win Rate', 12, true)}`);
  console.log('-'.repeat(60));

  const entries = [...stats.strategyStats.entries()];
  entries.sort((a, b) => {
    const rateA = a[1].games > 0 ? a[1].wins / a[1].games : 0;
    const rateB = b[1].games > 0 ? b[1].wins / b[1].games : 0;
    return rateB - rateA;
  });

  for (const [strategy, s] of entries) {
    const winRate = s.games > 0 ? (s.wins / s.games) * 100 : 0;
    const barLen = Math.floor(winRate / 2.5);
    const bar = '█'.repeat(barLen);
    console.log(`${pad(strategy, 12)} ${pad(String(s.games), 10, true)} ${pad(String(s.wins), 10, true)} ${pad(winRate.toFixed(1) + '%', 11, true)} ${bar}`);
  }
}

function printSummary(stats: CombatStats): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(70));

  if (stats.classGames.size > 0) {
    let bestClass = '';
    let bestRate = -1;
    let bestWins = 0;
    let bestGames = 0;
    for (const [cls, games] of stats.classGames) {
      const wins = stats.classWins.get(cls) ?? 0;
      const rate = wins / games;
      if (rate > bestRate) {
        bestClass = cls;
        bestRate = rate;
        bestWins = wins;
        bestGames = games;
      }
    }
    console.log(`\nBEST CLASS: ${bestClass} (${(bestRate * 100).toFixed(1)}% win rate, ${bestWins} wins / ${bestGames} games)`);
  }

  if (stats.cardTypeStats.size > 0) {
    let bestType = '';
    let bestCorr = -1;
    let bestPlays = 0;
    for (const [name, s] of stats.cardTypeStats) {
      if (s.plays <= 100) continue;
      const corr = s.playsByWinner / s.plays;
      if (corr > bestCorr) {
        bestType = name;
        bestCorr = corr;
        bestPlays = s.plays;
      }
    }
    if (bestType) {
      console.log(`BEST CARD TYPE: ${bestType} (${(bestCorr * 100).toFixed(1)}% win correlation, ${bestPlays} plays)`);
    }
  }

  if (stats.cardStats.size > 0) {
    let bestCard = '';
    let bestCorr = -1;
    let bestPlays = 0;
    for (const [name, s] of stats.cardStats) {
      if (s.plays <= 50) continue;
      const corr = s.playsByWinner / s.plays;
      if (corr > bestCorr) {
        bestCard = name;
        bestCorr = corr;
        bestPlays = s.plays;
      }
    }
    if (bestCard) {
      console.log(`BEST CARD: ${bestCard} (${(bestCorr * 100).toFixed(1)}% win correlation, ${bestPlays} plays)`);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  console.log('='.repeat(70));
  console.log('PIM PAM PUM COMBAT SIMULATION ENGINE');
  console.log('Multi-Configuration Battle Analysis');
  console.log('='.repeat(70));

  let allStats = newCombatStats();

  const configs: [number, number, number][] = [
    [1, 1, 200],
    [2, 1, 200],
    [2, 2, 200],
    [3, 2, 150],
    [3, 3, 100],
    [4, 3, 50],
    [4, 4, 30],
    [5, 4, 10],
    [5, 5, 8],
  ];

  for (const [team1Size, team2Size, sims] of configs) {
    const stats = runBattleAnalysis(team1Size, team2Size, sims);
    mergeCombatStats(allStats, stats);
  }

  printClassStats(allStats);
  printCardStats(allStats);
  printStrategyStats(allStats);
  printSummary(allStats);
}

main();
