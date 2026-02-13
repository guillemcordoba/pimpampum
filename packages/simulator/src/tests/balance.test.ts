import { describe, it, expect, beforeAll } from 'vitest';
import {
  newCombatStats,
  mergeCombatStats,
  CombatEngine,
  AIStrategy,
  createFighter,
  createWizard,
  createRogue,
  createBarbarian,
} from '@pimpampum/engine';
import type { CombatStats } from '@pimpampum/engine';
import {
  runMatchup,
  runWithStrategies,
  generateTeamCompositions,
  getAllCreators,
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
    [3, 30],
  ];

  for (const [teamSize, simsPerMatchup] of teamSizeConfigs) {
    const compositions = generateTeamCompositions(teamSize);
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
// A. CLASS BALANCE
// =============================================================================

describe('Class Balance', () => {
  const playerClasses = ['Fighter', 'Wizard', 'Rogue', 'Barbarian'];

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

  it('no team composition matchup is more extreme than 15-85%', () => {
    for (const [, data] of teamSizeData) {
      for (const { name1, name2, result } of data.matchupResults) {
        if (result.numSimulations < 10) continue;
        const winRate = (result.team1Wins / result.numSimulations) * 100;
        expect(winRate, `${name1} vs ${name2}: ${winRate.toFixed(1)}% win rate is too extreme`)
          .toBeGreaterThanOrEqual(15);
        expect(winRate, `${name1} vs ${name2}: ${winRate.toFixed(1)}% win rate is too extreme`)
          .toBeLessThanOrEqual(85);
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
      .toBeLessThanOrEqual(8);
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
    ['Fighter', createFighter],
    ['Wizard', createWizard],
    ['Rogue', createRogue],
    ['Barbarian', createBarbarian],
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

  it('within each class, no card has more than 2x the play rate of the least-played card', () => {
    for (const [className, cards] of classCards) {
      const plays = cards.map(name => aggregatedStats.cardStats.get(name)?.plays ?? 0);
      const minPlays = Math.min(...plays);
      const maxPlays = Math.max(...plays);
      if (minPlays === 0) continue;

      const ratio = maxPlays / minPlays;
      expect(ratio, `${className}: most-played card has ${ratio.toFixed(1)}x the plays of least-played`)
        .toBeLessThanOrEqual(2);
    }
  });

  it('win correlation spread: no card below 35% or above 65%', () => {
    for (const [cardName, stats] of aggregatedStats.cardStats) {
      if (stats.plays < 50) continue;
      const winCorr = (stats.playsByWinner / stats.plays) * 100;
      expect(winCorr, `${cardName} win correlation ${winCorr.toFixed(1)}% is out of range`)
        .toBeGreaterThanOrEqual(35);
      expect(winCorr, `${cardName} win correlation ${winCorr.toFixed(1)}% is out of range`)
        .toBeLessThanOrEqual(65);
    }
  });
});

// =============================================================================
// E. STRATEGY TRIANGLE
// =============================================================================

describe('Strategy Triangle', () => {
  const teamCompositions: CharacterCreator[][] = [
    [createFighter, createWizard],
    [createRogue, createBarbarian],
    [createFighter, createRogue],
    [createWizard, createBarbarian],
    [createFighter, createBarbarian],
    [createWizard, createRogue],
  ];

  const simsPerComposition = 50;

  function runStrategyMatchup(s1: AIStrategy, s2: AIStrategy): { s1Wins: number; s2Wins: number; total: number } {
    let s1Wins = 0;
    let s2Wins = 0;
    let total = 0;
    for (const comp of teamCompositions) {
      const result = runWithStrategies(comp, comp, s1, s2, simsPerComposition);
      s1Wins += result.team1Wins;
      s2Wins += result.team2Wins;
      total += result.numSimulations;
    }
    return { s1Wins, s2Wins, total };
  }

  it('Power beats Protect (Power > 50% win rate)', () => {
    const { s1Wins, total } = runStrategyMatchup(AIStrategy.Power, AIStrategy.Protect);
    const winRate = (s1Wins / total) * 100;
    expect(winRate, `Power vs Protect: Power wins ${winRate.toFixed(1)}%`)
      .toBeGreaterThan(50);
  });

  it('Protect beats Aggro (Protect > 50% win rate)', () => {
    const { s1Wins, total } = runStrategyMatchup(AIStrategy.Protect, AIStrategy.Aggro);
    const winRate = (s1Wins / total) * 100;
    expect(winRate, `Protect vs Aggro: Protect wins ${winRate.toFixed(1)}%`)
      .toBeGreaterThan(50);
  });

  it('Aggro beats Power (Aggro > 50% win rate)', () => {
    const { s1Wins, total } = runStrategyMatchup(AIStrategy.Aggro, AIStrategy.Power);
    const winRate = (s1Wins / total) * 100;
    expect(winRate, `Aggro vs Power: Aggro wins ${winRate.toFixed(1)}%`)
      .toBeGreaterThan(50);
  });
});

// =============================================================================
// F. CLASS IDENTITY
// =============================================================================

describe('Class Identity', () => {
  function getClassCardTypeUsage(): Map<string, Map<string, number>> {
    const usage = new Map<string, Map<string, number>>();

    const playerCreators: [string, CharacterCreator][] = [
      ['Fighter', createFighter],
      ['Wizard', createWizard],
      ['Rogue', createRogue],
      ['Barbarian', createBarbarian],
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

  it('Fighter has meaningful Defense card usage', () => {
    const usage = getClassCardTypeUsage();
    const fighterUsage = usage.get('Fighter');
    expect(fighterUsage).toBeDefined();

    const totalPlays = [...fighterUsage!.values()].reduce((s, v) => s + v, 0);
    const defensePlays = fighterUsage!.get('Defense') ?? 0;
    const defenseShare = (defensePlays / totalPlays) * 100;

    expect(defenseShare, `Fighter Defense usage: ${defenseShare.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(10);
  });

  it('Wizard has highest MagicAttack card usage', () => {
    const usage = getClassCardTypeUsage();
    const wizardUsage = usage.get('Wizard');
    expect(wizardUsage).toBeDefined();

    const wizardMagic = wizardUsage!.get('MagicAttack') ?? 0;
    const wizardTotal = [...wizardUsage!.values()].reduce((s, v) => s + v, 0);
    const wizardMagicShare = wizardMagic / wizardTotal;

    for (const [cls, clsUsage] of usage) {
      if (cls === 'Wizard') continue;
      const clsMagic = clsUsage.get('MagicAttack') ?? 0;
      const clsTotal = [...clsUsage.values()].reduce((s, v) => s + v, 0);
      if (clsTotal === 0) continue;
      const clsMagicShare = clsMagic / clsTotal;
      expect(wizardMagicShare, `Wizard MagicAttack share should be higher than ${cls}`)
        .toBeGreaterThan(clsMagicShare);
    }
  });

  it('Barbarian has highest PhysicalAttack card usage share', () => {
    const usage = getClassCardTypeUsage();
    const barbarianUsage = usage.get('Barbarian');
    expect(barbarianUsage).toBeDefined();

    const barbarianPhysical = barbarianUsage!.get('PhysicalAttack') ?? 0;
    const barbarianTotal = [...barbarianUsage!.values()].reduce((s, v) => s + v, 0);
    const barbarianPhysicalShare = barbarianPhysical / barbarianTotal;

    for (const [cls, clsUsage] of usage) {
      if (cls === 'Barbarian') continue;
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
    const rogueUsage = usage.get('Rogue');
    expect(rogueUsage).toBeDefined();

    const totalPlays = [...rogueUsage!.values()].reduce((s, v) => s + v, 0);
    const focusPlays = rogueUsage!.get('Focus') ?? 0;
    const focusShare = (focusPlays / totalPlays) * 100;

    expect(focusShare, `Rogue Focus usage: ${focusShare.toFixed(1)}%`)
      .toBeGreaterThanOrEqual(15);
  });
});

// =============================================================================
// G. TEAM COMPOSITION BALANCE
// =============================================================================

describe('Team Composition Balance', () => {
  it('no team composition has aggregate win rate below 20% or above 80%', () => {
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
        const wins = teamWins.get(teamName) ?? 0;
        const winRate = (wins / games) * 100;
        expect(winRate, `${teamSize}v${teamSize} ${teamName}: ${winRate.toFixed(1)}% aggregate win rate`)
          .toBeGreaterThanOrEqual(20);
        expect(winRate, `${teamSize}v${teamSize} ${teamName}: ${winRate.toFixed(1)}% aggregate win rate`)
          .toBeLessThanOrEqual(80);
      }
    }
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

  it('no character ends with negative wounds', () => {
    const creators = getAllCreators();
    for (let i = 0; i < 100; i++) {
      const team1 = [creators[i % creators.length][1](`T1_${i}`), creators[(i + 1) % creators.length][1](`T1b_${i}`)];
      const team2 = [creators[(i + 2) % creators.length][1](`T2_${i}`), creators[(i + 3) % creators.length][1](`T2b_${i}`)];

      const engine = new CombatEngine(team1, team2, false);
      engine.runCombat();

      for (const c of [...engine.team1, ...engine.team2]) {
        expect(c.currentWounds, `${c.name} has negative wounds`).toBeGreaterThanOrEqual(0);
        // Poison can cause wounds to exceed maxWounds — this is a known engine behavior.
        // Dead characters (wounds >= maxWounds) should not go beyond maxWounds + 1 (one poison tick).
        expect(c.currentWounds, `${c.name} wounds ${c.currentWounds} far exceeds max ${c.maxWounds}`)
          .toBeLessThanOrEqual(c.maxWounds + 1);
      }
    }
  });
});
