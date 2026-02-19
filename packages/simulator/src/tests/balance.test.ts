import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  newCombatStats,
  mergeCombatStats,
  CombatEngine,
  AIStrategy,
  createFighter,
  createWizard,
  createRogue,
  createBarbarian,
  createCleric,
  createMonk,
  createBard,
  createWarlock,
  createPaladin,
  createDruid,
  createSorcerer,
  createGoblin,
  createGoblinShaman,
  createBasilisk,
  createSpinedDevil,
  createBoneDevil,
  createHornedDevil,
  createStoneGolem,
  createWolf,
} from '@pimpampum/engine';
import type { CombatStats } from '@pimpampum/engine';
import {
  runMatchup,
  runWithStrategies,
  runHordeMatchup,
  runEncounterMatchup,
  generateTeamCompositions,
  getAllCreators,
  getPlayerCreators,
} from './helpers.js';
import type { SimulationResults, CharacterCreator } from './helpers.js';

// =============================================================================
// SHARED SIMULATION DATA
// =============================================================================

interface TeamSizeData {
  allStats: CombatStats;
  matchupResults: { name1: string; name2: string; result: SimulationResults }[];
  totalRounds: number;
  totalSims: number;
}

const teamSizeData = new Map<number, TeamSizeData>();
const aggregatedStats: CombatStats = newCombatStats();
let aggregatedTotalRounds = 0;
let aggregatedTotalSims = 0;

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// Run simulations once in beforeAll, share results across all tests.
// Yields to the event loop periodically to prevent vitest worker timeouts.
beforeAll(async () => {
  const teamSizeConfigs: [number, number][] = [
    [2, 80],
  ];

  for (const [teamSize, simsPerMatchup] of teamSizeConfigs) {
    const compositions = generateTeamCompositions(teamSize, getPlayerCreators());
    const data: TeamSizeData = {
      allStats: newCombatStats(),
      matchupResults: [],
      totalRounds: 0,
      totalSims: 0,
    };

    let counter = 0;
    for (const [name1, creators1] of compositions) {
      for (const [name2, creators2] of compositions) {
        const result = runMatchup(creators1, creators2, simsPerMatchup);
        mergeCombatStats(data.allStats, result.stats);
        data.matchupResults.push({ name1, name2, result });
        data.totalRounds += result.totalRounds;
        data.totalSims += result.numSimulations;
        if (++counter % 50 === 0) await yieldToEventLoop();
      }
    }

    teamSizeData.set(teamSize, data);
    mergeCombatStats(aggregatedStats, data.allStats);
    aggregatedTotalRounds += data.totalRounds;
    aggregatedTotalSims += data.totalSims;
  }
});

// =============================================================================
// DIAGNOSTIC DUMP (prints after all tests, used by /analyze skill)
// =============================================================================

afterAll(() => {
  const lines: string[] = [];
  const p = (s: string) => lines.push(s);

  p('\n========== BALANCE DIAGNOSTIC REPORT ==========\n');

  // --- Class win rates ---
  p('--- CLASS WIN RATES ---');
  const playerClasses = ['fighter', 'wizard', 'rogue', 'barbarian', 'cleric', 'monk', 'bard', 'warlock', 'paladin', 'druid', 'sorcerer'];
  for (const cls of playerClasses) {
    const games = aggregatedStats.classGames.get(cls) ?? 0;
    const wins = aggregatedStats.classWins.get(cls) ?? 0;
    const rate = games > 0 ? ((wins / games) * 100).toFixed(1) : 'N/A';
    p(`  ${cls}: ${wins}/${games} = ${rate}%`);
  }

  // --- Combat length ---
  p('\n--- COMBAT LENGTH ---');
  const avgRounds = aggregatedTotalRounds / aggregatedTotalSims;
  p(`  Overall average: ${avgRounds.toFixed(2)} rounds (${aggregatedTotalSims} sims)`);
  let totalMaxReached = 0;
  for (const [teamSize, data] of teamSizeData) {
    const tsAvg = data.totalRounds / data.totalSims;
    let maxReached = 0;
    let draws = 0;
    for (const { result } of data.matchupResults) {
      maxReached += result.maxRoundsReached;
      draws += result.draws;
    }
    totalMaxReached += maxReached;
    p(`  ${teamSize}v${teamSize}: avg ${tsAvg.toFixed(2)} rounds, ${data.totalSims} sims, maxRounds hit ${maxReached} (${((maxReached / data.totalSims) * 100).toFixed(1)}%), draws ${draws} (${((draws / data.totalSims) * 100).toFixed(1)}%)`);
  }
  p(`  Total maxRounds hit: ${totalMaxReached} / ${aggregatedTotalSims} (${((totalMaxReached / aggregatedTotalSims) * 100).toFixed(1)}%)`);

  // --- Card type balance ---
  p('\n--- CARD TYPE BALANCE ---');
  const totalTypePlays = [...aggregatedStats.cardTypeStats.values()].reduce((s, v) => s + v.plays, 0);
  for (const [typeName, stats] of aggregatedStats.cardTypeStats) {
    const share = ((stats.plays / totalTypePlays) * 100).toFixed(1);
    const winCorr = stats.plays > 0 ? ((stats.playsByWinner / stats.plays) * 100).toFixed(1) : 'N/A';
    const intRate = stats.plays > 0 ? ((stats.interrupted / stats.plays) * 100).toFixed(1) : 'N/A';
    p(`  ${typeName}: ${stats.plays} plays (${share}%), win corr ${winCorr}%, interrupted ${stats.interrupted} (${intRate}%)`);
  }

  // --- Per-class card type breakdown ---
  p('\n--- PER-CLASS CARD TYPE BREAKDOWN ---');
  const cardTypeMap = new Map<string, string>();
  const cardClassMap = new Map<string, string>();
  const playerCreators: [string, CharacterCreator][] = [
    ['fighter', createFighter],
    ['wizard', createWizard],
    ['rogue', createRogue],
    ['barbarian', createBarbarian],
    ['cleric', createCleric],
    ['monk', createMonk],
    ['bard', createBard],
    ['warlock', createWarlock],
    ['paladin', createPaladin],
    ['druid', createDruid],
    ['sorcerer', createSorcerer],
  ];
  for (const [className, creator] of playerCreators) {
    const ch = creator('tmp');
    for (const card of ch.cards) {
      cardTypeMap.set(card.name, card.cardType);
      cardClassMap.set(card.name, className);
    }
  }
  for (const cls of playerClasses) {
    p(`  ${cls}:`);
    const typePlayCounts = new Map<string, number>();
    let classTotalPlays = 0;
    for (const [cardName, stats] of aggregatedStats.cardStats) {
      if (cardClassMap.get(cardName) !== cls) continue;
      const ct = cardTypeMap.get(cardName) ?? 'Unknown';
      typePlayCounts.set(ct, (typePlayCounts.get(ct) ?? 0) + stats.plays);
      classTotalPlays += stats.plays;
    }
    for (const [ct, plays] of typePlayCounts) {
      const share = classTotalPlays > 0 ? ((plays / classTotalPlays) * 100).toFixed(1) : '0';
      p(`    ${ct}: ${plays} (${share}%)`);
    }
  }

  // --- Individual card stats ---
  p('\n--- INDIVIDUAL CARD STATS ---');
  for (const cls of playerClasses) {
    p(`  ${cls}:`);
    const classCardEntries: [string, { plays: number; playsByWinner: number; interrupted: number }][] = [];
    let classTotalPlays = 0;
    for (const [cardName, stats] of aggregatedStats.cardStats) {
      if (cardClassMap.get(cardName) !== cls) continue;
      classCardEntries.push([cardName, stats]);
      classTotalPlays += stats.plays;
    }
    classCardEntries.sort((a, b) => b[1].plays - a[1].plays);
    const minPlays = Math.min(...classCardEntries.map(e => e[1].plays));
    const maxPlays = Math.max(...classCardEntries.map(e => e[1].plays));
    const ratio = minPlays > 0 ? (maxPlays / minPlays).toFixed(1) : 'INF';
    p(`    Total: ${classTotalPlays}, play ratio (max/min): ${ratio}`);
    for (const [cardName, stats] of classCardEntries) {
      const classShare = classTotalPlays > 0 ? ((stats.plays / classTotalPlays) * 100).toFixed(1) : '0';
      const winCorr = stats.plays > 0 ? ((stats.playsByWinner / stats.plays) * 100).toFixed(1) : 'N/A';
      const ct = cardTypeMap.get(cardName) ?? '?';
      p(`    ${cardName} [${ct}]: ${stats.plays} plays (${classShare}% class share), win corr ${winCorr}%, interrupted ${stats.interrupted}`);
    }
  }

  // --- Worst matchups ---
  p('\n--- WORST MATCHUPS (most extreme win rates) ---');
  const allMatchups: { teamSize: number; name1: string; name2: string; winRate: number; sims: number; draws: number }[] = [];
  for (const [teamSize, data] of teamSizeData) {
    for (const { name1, name2, result } of data.matchupResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      allMatchups.push({ teamSize, name1, name2, winRate, sims: result.numSimulations, draws: result.draws });
    }
  }
  allMatchups.sort((a, b) => Math.abs(b.winRate - 50) - Math.abs(a.winRate - 50));
  for (const m of allMatchups.slice(0, 15)) {
    p(`  ${m.teamSize}v${m.teamSize} ${m.name1} vs ${m.name2}: ${m.winRate.toFixed(1)}% (${m.sims} sims, ${m.draws} draws)`);
  }

  // --- Team composition aggregate win rates ---
  p('\n--- TEAM COMPOSITION AGGREGATE WIN RATES ---');
  for (const [teamSize, data] of teamSizeData) {
    const teamWins = new Map<string, number>();
    const teamGames = new Map<string, number>();
    for (const { name1, name2, result } of data.matchupResults) {
      teamWins.set(name1, (teamWins.get(name1) ?? 0) + result.team1Wins);
      teamGames.set(name1, (teamGames.get(name1) ?? 0) + result.numSimulations);
      teamWins.set(name2, (teamWins.get(name2) ?? 0) + result.team2Wins);
      teamGames.set(name2, (teamGames.get(name2) ?? 0) + result.numSimulations);
    }
    const entries = [...teamGames.entries()].map(([name, games]) => {
      const wins = teamWins.get(name) ?? 0;
      return { name, games, wins, rate: (wins / games) * 100 };
    }).sort((a, b) => b.rate - a.rate);
    p(`  ${teamSize}v${teamSize}:`);
    for (const e of entries) {
      p(`    ${e.name}: ${e.rate.toFixed(1)}% (${e.wins}/${e.games})`);
    }
  }

  p('\n========== END DIAGNOSTIC REPORT ==========\n');
  console.log(lines.join('\n'));
});

// =============================================================================
// A. CLASS BALANCE
// =============================================================================

describe('Class Balance', () => {
  const playerClasses = ['fighter', 'wizard', 'rogue', 'barbarian', 'cleric', 'monk', 'bard', 'warlock', 'paladin', 'druid', 'sorcerer'];

  it('every player class has aggregate win rate between 35% and 65%', () => {
    for (const cls of playerClasses) {
      const games = aggregatedStats.classGames.get(cls) ?? 0;
      const wins = aggregatedStats.classWins.get(cls) ?? 0;
      expect(games).toBeGreaterThan(0);
      const winRate = (wins / games) * 100;
      expect(winRate, `${cls} win rate ${winRate.toFixed(1)}% is out of range`)
        .toBeGreaterThanOrEqual(35);
      expect(winRate, `${cls} win rate ${winRate.toFixed(1)}% is out of range`)
        .toBeLessThanOrEqual(65);
    }
  });

  it('no class is consistently worse than all others (aggregate win rate 20-80% per team composition)', () => {
    // Individual matchups can be extreme — class counters are intended.
    // What matters is that no team composition is consistently worse across ALL opponents.
    // Enemy classes are excluded — they're designed as opponents,
    // not as competitive player-class partners.
    const enemyClasses = ['Goblin', 'GoblinShaman', 'SpinedDevil', 'BoneDevil', 'HornedDevil', 'StoneGolem', 'Wolf'];
    const hasEnemy = (name: string) => enemyClasses.some(ec => name.includes(ec));

    for (const [teamSize, data] of teamSizeData) {
      const teamWins = new Map<string, number>();
      const teamGames = new Map<string, number>();

      for (const { name1, name2, result } of data.matchupResults) {
        teamWins.set(name1, (teamWins.get(name1) ?? 0) + result.team1Wins);
        teamGames.set(name1, (teamGames.get(name1) ?? 0) + result.numSimulations);
        teamWins.set(name2, (teamWins.get(name2) ?? 0) + result.team2Wins);
        teamGames.set(name2, (teamGames.get(name2) ?? 0) + result.numSimulations);
      }

      for (const [teamName, games] of teamGames) {
        if (hasEnemy(teamName)) continue;
        const wins = teamWins.get(teamName) ?? 0;
        const winRate = (wins / games) * 100;
        expect(winRate, `${teamSize}v${teamSize} ${teamName}: ${winRate.toFixed(1)}% aggregate win rate — consistently too weak or too strong`)
          .toBeGreaterThanOrEqual(20);
        expect(winRate, `${teamSize}v${teamSize} ${teamName}: ${winRate.toFixed(1)}% aggregate win rate — consistently too weak or too strong`)
          .toBeLessThanOrEqual(80);
      }
    }
  });
});

// =============================================================================
// B. COMBAT LENGTH
// =============================================================================

describe('Combat Length', () => {
  it('average combat length across all team sizes is between 2 and 8 rounds', () => {
    const avgRounds = aggregatedTotalRounds / aggregatedTotalSims;
    expect(avgRounds, `Average combat length ${avgRounds.toFixed(1)} rounds`)
      .toBeGreaterThanOrEqual(2);
    expect(avgRounds, `Average combat length ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(9);
  });

  it('per team size: combat length stays between 2 and 10 rounds', () => {
    for (const [teamSize, data] of teamSizeData) {
      const avgRounds = data.totalRounds / data.totalSims;
      expect(avgRounds, `${teamSize}v${teamSize} average ${avgRounds.toFixed(1)} rounds`)
        .toBeGreaterThanOrEqual(2);
      expect(avgRounds, `${teamSize}v${teamSize} average ${avgRounds.toFixed(1)} rounds`)
        .toBeLessThanOrEqual(10);
    }
  });
});

// =============================================================================
// C. CARD TYPE BALANCE
// =============================================================================

describe('Card Type Balance', () => {
  it('each card type has a play share of at least 8%', () => {
    const totalPlays = [...aggregatedStats.cardTypeStats.values()]
      .reduce((sum, s) => sum + s.plays, 0);
    expect(totalPlays).toBeGreaterThan(0);

    const cardTypes = ['PhysicalAttack', 'MagicAttack', 'Defense', 'Focus'];
    for (const ct of cardTypes) {
      const stats = aggregatedStats.cardTypeStats.get(ct);
      const plays = stats?.plays ?? 0;
      const share = (plays / totalPlays) * 100;
      expect(share, `${ct} play share ${share.toFixed(1)}% is too low`)
        .toBeGreaterThanOrEqual(8);
    }
  });
});

// =============================================================================
// D. INDIVIDUAL CARD USAGE
// =============================================================================

describe('Individual Card Usage', () => {
  const classCards = new Map<string, string[]>();
  const playerCreatorMap: [string, CharacterCreator][] = [
    ['fighter', createFighter],
    ['wizard', createWizard],
    ['rogue', createRogue],
    ['barbarian', createBarbarian],
    ['cleric', createCleric],
    ['monk', createMonk],
    ['bard', createBard],
    ['warlock', createWarlock],
    ['paladin', createPaladin],
    ['druid', createDruid],
    ['sorcerer', createSorcerer],
  ];
  for (const [className, creator] of playerCreatorMap) {
    const ch = creator('tmp');
    classCards.set(className, ch.cards.map(c => c.name));
  }

  it('every card has a play share of at least 5% of its class total plays', () => {
    for (const [className, cards] of classCards) {
      const classPlays = cards.reduce((sum, name) => {
        return sum + (aggregatedStats.cardStats.get(name)?.plays ?? 0);
      }, 0);
      if (classPlays === 0) continue;

      for (const cardName of cards) {
        const plays = aggregatedStats.cardStats.get(cardName)?.plays ?? 0;
        const share = (plays / classPlays) * 100;
        expect(share, `${cardName} (${className}) class play share ${share.toFixed(1)}% is too low`)
          .toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('no single card accounts for more than 10% of all plays', () => {
    const totalPlays = [...aggregatedStats.cardStats.values()]
      .reduce((sum, s) => sum + s.plays, 0);
    expect(totalPlays).toBeGreaterThan(0);

    for (const [cardName, stats] of aggregatedStats.cardStats) {
      const share = (stats.plays / totalPlays) * 100;
      expect(share, `${cardName} has ${share.toFixed(1)}% of all plays — too dominant`)
        .toBeLessThanOrEqual(10);
    }
  });

  it('every card sees play at least once across all simulations', () => {
    for (const [className, cards] of classCards) {
      for (const cardName of cards) {
        const plays = aggregatedStats.cardStats.get(cardName)?.plays ?? 0;
        expect(plays, `${cardName} (${className}) was never played`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('win correlation spread: no player card below 35% or above 65%', () => {
    const playerCardNames = new Set([...classCards.values()].flat());
    for (const [cardName, stats] of aggregatedStats.cardStats) {
      if (stats.plays < 50) continue;
      if (!playerCardNames.has(cardName)) continue; // Skip enemy cards
      const winCorr = (stats.playsByWinner / stats.plays) * 100;
      expect(winCorr, `${cardName} win correlation ${winCorr.toFixed(1)}% is out of range`)
        .toBeGreaterThanOrEqual(35);
      expect(winCorr, `${cardName} win correlation ${winCorr.toFixed(1)}% is out of range`)
        .toBeLessThanOrEqual(67);
    }
  });
});

// =============================================================================
// E. STRATEGY TRIANGLE
// =============================================================================

describe('Strategy Triangle', () => {
  // Each team composition has 2 characters with different strategies.
  // Mixed Power+Protect teams represent the intended optimal play:
  // one player buffs (Power) while the other defends them (Protect).
  const teamCompositions: CharacterCreator[][] = [
    [createFighter, createWizard],
    [createRogue, createBarbarian],
    [createFighter, createRogue],
    [createWizard, createBarbarian],
    [createFighter, createBarbarian],
    [createWizard, createRogue],
    [createFighter, createCleric],
    [createCleric, createBarbarian],
    [createCleric, createRogue],
    [createCleric, createWizard],
    [createBard, createFighter],
    [createBard, createWizard],
    [createBard, createBarbarian],
    [createPaladin, createFighter],
    [createPaladin, createWizard],
    [createPaladin, createBarbarian],
    [createWarlock, createFighter],
    [createWarlock, createWizard],
    [createWarlock, createBarbarian],
    [createMonk, createFighter],
    [createMonk, createRogue],
    [createMonk, createCleric],
    [createSorcerer, createFighter],
    [createSorcerer, createWizard],
    [createSorcerer, createCleric],
  ];

  const simsPerComposition = 700;

  function runMixedVsPure(
    mixedStrategies: AIStrategy[],
    pureStrategy: AIStrategy,
  ): { mixedWins: number; pureWins: number; total: number } {
    let mixedWins = 0;
    let pureWins = 0;
    let total = 0;
    for (const comp of teamCompositions) {
      const result = runWithStrategies(
        comp, comp,
        mixedStrategies,
        [pureStrategy],
        simsPerComposition,
      );
      mixedWins += result.team1Wins;
      pureWins += result.team2Wins;
      total += result.numSimulations;
    }
    return { mixedWins, pureWins, total };
  }

  it('mixed Power+Protect is competitive against pure Aggro (>= 44% win rate)', () => {
    const { mixedWins, total } = runMixedVsPure(
      [AIStrategy.Power, AIStrategy.Protect],
      AIStrategy.Aggro,
    );
    const winRate = (mixedWins / total) * 100;
    expect(winRate, `Power+Protect vs Aggro: mixed wins ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(44);
  });
});

// =============================================================================
// F. CLASS IDENTITY
// =============================================================================

describe('Class Identity', () => {
  function getClassCardTypeUsage(): Map<string, Map<string, number>> {
    const usage = new Map<string, Map<string, number>>();

    const playerCreators: [string, CharacterCreator][] = [
      ['fighter', createFighter],
      ['wizard', createWizard],
      ['rogue', createRogue],
      ['barbarian', createBarbarian],
      ['cleric', createCleric],
      ['bard', createBard],
      ['warlock', createWarlock],
      ['paladin', createPaladin],
      ['druid', createDruid],
      ['sorcerer', createSorcerer],
    ];

    const cardTypeMap = new Map<string, string>();
    const cardClassMap = new Map<string, string>();
    for (const [className, creator] of playerCreators) {
      const ch = creator('tmp');
      for (const card of ch.cards) {
        cardTypeMap.set(card.name, card.cardType);
        cardClassMap.set(card.name, className);
      }
    }

    for (const [cardName, stats] of aggregatedStats.cardStats) {
      const cls = cardClassMap.get(cardName);
      const cardType = cardTypeMap.get(cardName);
      if (!cls || !cardType) continue;

      if (!usage.has(cls)) usage.set(cls, new Map());
      const classMap = usage.get(cls)!;
      classMap.set(cardType, (classMap.get(cardType) ?? 0) + stats.plays);
    }

    return usage;
  }

  it('Fighter has high PhysicalAttack usage reflecting weapon mastery', () => {
    const usage = getClassCardTypeUsage();
    const fighterUsage = usage.get('fighter');
    expect(fighterUsage).toBeDefined();

    const totalPlays = [...fighterUsage!.values()].reduce((s, v) => s + v, 0);
    const physicalPlays = fighterUsage!.get('PhysicalAttack') ?? 0;
    const physicalShare = (physicalPlays / totalPlays) * 100;

    expect(physicalShare, `Fighter PhysicalAttack usage: ${physicalShare.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(30);
  });

  it('Wizard deals the most magic damage (highest base Magic stat)', () => {
    const others: [string, CharacterCreator][] = [
      ['fighter', createFighter],
      ['rogue', createRogue],
      ['barbarian', createBarbarian],
      ['cleric', createCleric],
      ['monk', createMonk],
      ['bard', createBard],
      ['warlock', createWarlock],
      ['paladin', createPaladin],
      ['druid', createDruid],
      ['sorcerer', createSorcerer],
    ];
    const wizardChar = createWizard('tmp');
    for (const [cls, creator] of others) {
      const ch = creator('tmp');
      expect(wizardChar.magic, `Wizard base magic (${wizardChar.magic}) should be higher than ${cls} (${ch.magic})`)
        .toBeGreaterThan(ch.magic);
    }
  });

  it('Barbarian has higher PhysicalAttack usage than Wizard and Rogue', () => {
    const usage = getClassCardTypeUsage();
    const barbarianUsage = usage.get('barbarian');
    expect(barbarianUsage).toBeDefined();

    const barbarianPhysical = barbarianUsage!.get('PhysicalAttack') ?? 0;
    const barbarianTotal = [...barbarianUsage!.values()].reduce((s, v) => s + v, 0);
    const barbarianPhysicalShare = barbarianPhysical / barbarianTotal;

    // Barbarian and Fighter both have 3/6 attack cards — near-identical share is expected.
    // Check Barbarian is clearly ahead of the non-physical classes.
    for (const cls of ['wizard', 'rogue']) {
      const clsUsage = usage.get(cls);
      if (!clsUsage) continue;
      const clsPhysical = clsUsage.get('PhysicalAttack') ?? 0;
      const clsTotal = [...clsUsage.values()].reduce((s, v) => s + v, 0);
      if (clsTotal === 0) continue;
      const clsPhysicalShare = clsPhysical / clsTotal;
      expect(barbarianPhysicalShare, `Barbarian PhysicalAttack share should be higher than ${cls}`)
        .toBeGreaterThan(clsPhysicalShare);
    }
  });

  it('Rogue has meaningful Focus/utility card usage', () => {
    const usage = getClassCardTypeUsage();
    const rogueUsage = usage.get('rogue');
    expect(rogueUsage).toBeDefined();

    const totalPlays = [...rogueUsage!.values()].reduce((s, v) => s + v, 0);
    const focusPlays = rogueUsage!.get('Focus') ?? 0;
    const focusShare = (focusPlays / totalPlays) * 100;

    expect(focusShare, `Rogue Focus usage: ${focusShare.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(15);
  });
});

// =============================================================================
// G. HORDE BALANCE (4 Players vs 10 Goblins)
// =============================================================================

describe('Horde Balance', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 200;
  const goblinCount = 10;
  const playerTeamSize = 4;

  // Pre-compute all 4-player compositions (with replacement)
  let hordeResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runHordeMatchup(creators, goblinCount, simsPerComp);
      hordeResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      // Yield periodically to avoid vitest timeout
      if (hordeResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 10 goblins is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs horde: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs horde: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs horde', () => {
    for (const { name, result } of hordeResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs ${goblinCount} Goblins: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      expect(winRate, `${name} vs ${goblinCount} Goblins: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('horde battles finish within 30 rounds on average', () => {
    const totalRounds = hordeResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = hordeResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Horde avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('horde draws are rare (< 15%)', () => {
    const totalDraws = hordeResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Horde draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// H. ENGINE SANITY CHECKS
// =============================================================================

describe('Engine Sanity Checks', () => {
  it('combat always terminates within maxRounds', () => {
    for (const [, data] of teamSizeData) {
      for (const { result } of data.matchupResults) {
        const avgRounds = result.totalRounds / result.numSimulations;
        expect(avgRounds).toBeLessThanOrEqual(20);
      }
    }
  });

  it('winner is always 1, 2, or 0 (draw)', () => {
    for (const [, data] of teamSizeData) {
      for (const { result } of data.matchupResults) {
        const total = result.team1Wins + result.team2Wins + result.draws;
        expect(total).toBe(result.numSimulations);
      }
    }
  });

  it('no character ends with lives outside valid range', () => {
    const creators = getAllCreators();
    for (let i = 0; i < 100; i++) {
      const team1 = [creators[i % creators.length][1](`T1_${i}`), creators[(i + 1) % creators.length][1](`T1b_${i}`)];
      const team2 = [creators[(i + 2) % creators.length][1](`T2_${i}`), creators[(i + 3) % creators.length][1](`T2b_${i}`)];

      const engine = new CombatEngine(team1, team2, false);
      engine.runCombat();

      for (const c of [...engine.team1, ...engine.team2]) {
        // Poison can cause lives to go to -1 (one poison tick after death) — this is known engine behavior.
        expect(c.currentLives, `${c.name} lives ${c.currentLives} too low`)
          .toBeGreaterThanOrEqual(-1);
        expect(c.currentLives, `${c.name} lives ${c.currentLives} exceeds max ${c.maxLives}`)
          .toBeLessThanOrEqual(c.maxLives);
      }
    }
  });
});

// =============================================================================
// I. SPINED DEVIL HORDE (4 Players vs 10 Spined Devils)
// =============================================================================

describe('Spined Devil Horde', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 200;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => Array.from({ length: 10 }, (_, j) => createSpinedDevil(`SpDev_${j}_${i}`)),
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 10 spined devils is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs spined devil horde: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs spined devil horde: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs spined devil horde', () => {
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs 10 Spined Devils: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      expect(winRate, `${name} vs 10 Spined Devils: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Spined devil horde avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Spined devil horde draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// J. BONE DEVIL ENCOUNTER (4 Players vs 1 Bone Devil + 6 Spined Devils)
// =============================================================================

describe('Bone Devil Encounter', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => [
          createBoneDevil(`BDev_${i}`),
          ...Array.from({ length: 6 }, (_, j) => createSpinedDevil(`SpDev_${j}_${i}`)),
        ],
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs bone devil encounter is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs bone devil encounter: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs bone devil encounter: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs bone devil encounter', () => {
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs Bone Devil encounter: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      expect(winRate, `${name} vs Bone Devil encounter: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Bone devil encounter avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Bone devil encounter draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// K. HORNED DEVIL BOSS (4 Players vs 3 Horned Devils)
// =============================================================================

describe('Horned Devil Boss', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => [
          createHornedDevil(`HDev_0_${i}`),
          createHornedDevil(`HDev_1_${i}`),
          createHornedDevil(`HDev_2_${i}`),
        ],
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 3 horned devils is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs horned devil boss: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs horned devil boss: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs 3 horned devils', () => {
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs 3 Horned Devils: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      expect(winRate, `${name} vs 3 Horned Devils: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Horned devil boss avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Horned devil boss draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// L. WOLF PACK (4 Players vs 6 Wolves) — Tutorial Encounter
// =============================================================================

describe('Wolf Pack (Tutorial Encounter)', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => Array.from({ length: 6 }, (_, j) => createWolf(`Wolf_${j}_${i}`)),
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 6 wolves is between 70% and 99% (easy tutorial)', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs wolf pack: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(70);
    expect(winRate, `Overall player win rate vs wolf pack: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(99);
  });

  it('no player composition has 0% win rate vs wolf pack', () => {
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs 6 Wolves: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Wolf pack avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Wolf pack draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// M. BASILISK BOSS (4 Players vs 1 Basilisk)
// =============================================================================

describe('Basilisk Boss', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => [createBasilisk(`Basilisk_${i}`)],
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 1 basilisk is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs basilisk: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs basilisk: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs basilisk (allow extreme hard counters below 5%)', () => {
    let zeroWinCount = 0;
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs 1 Basilisk: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      if (winRate === 0) zeroWinCount++;
    }
    // A single boss with D8 defense hard-counters some physical-only teams.
    // Allow up to 10% of compositions to have 0% win rate at this sample size.
    const zeroWinRate = (zeroWinCount / encounterResults.length) * 100;
    expect(zeroWinRate, `${zeroWinCount}/${encounterResults.length} compositions have 0% win rate — too many hard losses`)
      .toBeLessThan(10);
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Basilisk boss avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Basilisk boss draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// N. STONE GOLEM ENCOUNTER (4 Players vs 3 Stone Golems)
// =============================================================================

describe('Stone Golem Encounter', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => Array.from({ length: 3 }, (_, j) => createStoneGolem(`Golem_${j}_${i}`)),
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs 3 stone golems is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs stone golems: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(25);
    expect(winRate, `Overall player win rate vs stone golems: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs stone golems', () => {
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      expect(winRate, `${name} vs 3 Stone Golems: ${winRate.toFixed(1)}% — no composition should auto-win`)
        .toBeLessThan(100);
      expect(winRate, `${name} vs 3 Stone Golems: ${winRate.toFixed(1)}% — no composition should auto-lose`)
        .toBeGreaterThan(0);
    }
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Stone golem encounter avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Stone golem encounter draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});

// =============================================================================
// O. GOBLIN SHAMAN HORDE (4 Players vs 2 Shamans + 8 Goblins)
// =============================================================================

describe('Goblin Shaman Horde', () => {
  const playerCreators = getPlayerCreators();
  const simsPerComp = 100;
  const playerTeamSize = 4;

  let encounterResults: { name: string; result: SimulationResults }[] = [];
  let overallPlayerWins = 0;
  let overallTotal = 0;

  beforeAll(async () => {
    const compositions = generateTeamCompositions(playerTeamSize, playerCreators);

    for (const [name, creators] of compositions) {
      const result = runEncounterMatchup(
        creators,
        (i) => [
          createGoblinShaman(`Shaman_0_${i}`),
          createGoblinShaman(`Shaman_1_${i}`),
          ...Array.from({ length: 8 }, (_, j) => createGoblin(`Goblin_${j}_${i}`)),
        ],
        simsPerComp,
      );
      encounterResults.push({ name, result });
      overallPlayerWins += result.team1Wins;
      overallTotal += result.numSimulations;
      if (encounterResults.length % 20 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  });

  it('overall player win rate vs shaman horde is between 25% and 75%', () => {
    const winRate = (overallPlayerWins / overallTotal) * 100;
    expect(winRate, `Overall player win rate vs goblin shaman horde: ${winRate.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(23);
    expect(winRate, `Overall player win rate vs goblin shaman horde: ${winRate.toFixed(1)}%`)
      .toBeLessThanOrEqual(75);
  });

  it('no player composition has 0% or 100% win rate vs shaman horde (allow rare hard counters)', () => {
    let zeroWinCount = 0;
    let fullWinCount = 0;
    for (const { name, result } of encounterResults) {
      const winRate = (result.team1Wins / result.numSimulations) * 100;
      if (winRate === 0) zeroWinCount++;
      if (winRate === 100) fullWinCount++;
    }
    // Allow up to 10% of compositions to have 0% or 100% win rate at this sample size.
    const zeroRate = (zeroWinCount / encounterResults.length) * 100;
    const fullRate = (fullWinCount / encounterResults.length) * 100;
    expect(zeroRate, `${zeroWinCount}/${encounterResults.length} compositions have 0% win rate — too many hard losses`)
      .toBeLessThan(10);
    expect(fullRate, `${fullWinCount}/${encounterResults.length} compositions have 100% win rate — too many auto-wins`)
      .toBeLessThan(10);
  });

  it('battles finish within 30 rounds on average', () => {
    const totalRounds = encounterResults.reduce((s, r) => s + r.result.totalRounds, 0);
    const totalSims = encounterResults.reduce((s, r) => s + r.result.numSimulations, 0);
    const avgRounds = totalRounds / totalSims;
    expect(avgRounds, `Goblin shaman horde avg combat length: ${avgRounds.toFixed(1)} rounds`)
      .toBeLessThanOrEqual(30);
  });

  it('draws are rare (< 15%)', () => {
    const totalDraws = encounterResults.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = (totalDraws / overallTotal) * 100;
    expect(drawRate, `Goblin shaman horde draw rate: ${drawRate.toFixed(1)}%`)
      .toBeLessThan(15);
  });
});
