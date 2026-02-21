import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createGoblin,
  createGoblinShaman,
  createBasilisk,
  createSpinedDevil,
  createBoneDevil,
  createHornedDevil,
  createStoneGolem,
  createWolf,
} from '@pimpampum/engine';
import type { Character } from '@pimpampum/engine';
import {
  runEncounterMatchup,
  randomTeamCreators,
  getPlayerCreators,
} from './helpers.js';
import type { SimulationResults } from './helpers.js';

// =============================================================================
// ENCOUNTER DEFINITIONS
// =============================================================================

interface EncounterConfig {
  name: string;
  enemies: string;
  enemyCount: number;
  enemyFactory: (si: number) => Character[];
  playerTeamSize: number;
  numComps: number;
  simsPerComp: number;
  winRateMin: number;
  winRateMax: number;
  /** If true, 100% win rate compositions are allowed (tutorial encounters) */
  allowAutoWin?: boolean;
  /** Max % of compositions with 0% win rate (default: 0 = none allowed) */
  zeroWinThreshold?: number;
}

const ENCOUNTERS: EncounterConfig[] = [
  {
    name: 'Wolf Pack (Tutorial)',
    enemies: '3 Llops',
    enemyCount: 3,
    enemyFactory: (si) => Array.from({ length: 3 }, (_, j) => createWolf(`Wolf_${j}_${si}`)),
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 95,
    winRateMax: 100,
    allowAutoWin: true,
  },
  {
    name: 'Goblin Horde',
    enemies: '8 Goblins + 1 Xaman Goblin',
    enemyCount: 9,
    enemyFactory: (si) => [
      createGoblinShaman(`Shaman_${si}`),
      ...Array.from({ length: 8 }, (_, j) => createGoblin(`Goblin_${j}_${si}`)),
    ],
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 60,
    winRateMax: 70,
  },
  {
    name: 'Basilisk I',
    enemies: '1 Basilisc',
    enemyCount: 1,
    enemyFactory: (si) => [createBasilisk(`Basilisk_${si}`)],
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 60,
    winRateMax: 70,
    zeroWinThreshold: 10,
  },
  {
    name: 'Basilisk II',
    enemies: '1 Basilisc',
    enemyCount: 1,
    enemyFactory: (si) => [createBasilisk(`Basilisk_${si}`)],
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 60,
    winRateMax: 70,
    zeroWinThreshold: 10,
  },
  {
    name: 'Devil Encounter',
    enemies: "4 Diables d'Espines + 1 Diable d'Os",
    enemyCount: 5,
    enemyFactory: (si) => [
      createBoneDevil(`BDev_${si}`),
      ...Array.from({ length: 4 }, (_, j) => createSpinedDevil(`SpDev_${j}_${si}`)),
    ],
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 60,
    winRateMax: 70,
  },
  {
    name: 'Stone Golem Encounter',
    enemies: '2 Gòlems de Pedra',
    enemyCount: 2,
    enemyFactory: (si) => Array.from({ length: 2 }, (_, j) => createStoneGolem(`Golem_${j}_${si}`)),
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 59,
    winRateMax: 70,
  },
  {
    name: 'Horned Devil Boss',
    enemies: '2 Diables Banyuts',
    enemyCount: 2,
    enemyFactory: (si) => [
      createHornedDevil(`HDev_0_${si}`),
      createHornedDevil(`HDev_1_${si}`),
    ],
    playerTeamSize: 5,
    numComps: 100,
    simsPerComp: 100,
    winRateMin: 50,
    winRateMax: 60,
  },
];

// =============================================================================
// SHARED STATE & DIAGNOSTIC DUMP
// =============================================================================

interface EncounterResults {
  config: EncounterConfig;
  compositions: { name: string; result: SimulationResults }[];
  overallPlayerWins: number;
  overallTotal: number;
}

const allEncounterResults: EncounterResults[] = [];

afterAll(() => {
  const lines: string[] = [];
  const p = (s: string) => lines.push(s);

  p('\n========== ENCOUNTER DIAGNOSTIC REPORT ==========\n');

  // Encounter index
  p('--- ALL ENCOUNTERS ---');
  p(`  ${'#'.padEnd(3)} ${'Encounter'.padEnd(25)} ${'Enemies'.padEnd(42)} ${'N'.padStart(2)}  Target`);
  p(`  ${'-'.repeat(85)}`);
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const enc = ENCOUNTERS[i];
    p(`  ${String(i + 1).padEnd(3)} ${enc.name.padEnd(25)} ${enc.enemies.padEnd(42)} ${String(enc.enemyCount).padStart(2)}  ${enc.winRateMin}%-${enc.winRateMax}%`);
  }

  // Results
  p('\n--- ENCOUNTER RESULTS ---');
  for (const er of allEncounterResults) {
    const winRate = er.overallTotal > 0 ? ((er.overallPlayerWins / er.overallTotal) * 100).toFixed(1) : 'N/A';
    const totalDraws = er.compositions.reduce((s, r) => s + r.result.draws, 0);
    const drawRate = er.overallTotal > 0 ? ((totalDraws / er.overallTotal) * 100).toFixed(1) : '0';
    const totalRounds = er.compositions.reduce((s, r) => s + r.result.totalRounds, 0);
    const avgRnds = er.overallTotal > 0 ? (totalRounds / er.overallTotal).toFixed(1) : 'N/A';
    const maxReached = er.compositions.reduce((s, r) => s + r.result.maxRoundsReached, 0);

    p(`  ${er.config.name} (${er.config.playerTeamSize}P vs ${er.config.enemies}): ${winRate}% player win rate (${er.overallPlayerWins}/${er.overallTotal}), avg ${avgRnds} rounds, ${drawRate}% draws, ${maxReached} maxRounds hit`);

    const sorted = [...er.compositions]
      .map(r => ({ name: r.name, rate: (r.result.team1Wins / r.result.numSimulations) * 100 }))
      .sort((a, b) => b.rate - a.rate);
    const top3 = sorted.slice(0, 3);
    const bot3 = sorted.slice(-3).reverse();
    p(`    Best:  ${top3.map(r => `${r.name} ${r.rate.toFixed(0)}%`).join(', ')}`);
    p(`    Worst: ${bot3.map(r => `${r.name} ${r.rate.toFixed(0)}%`).join(', ')}`);
  }

  p('\n========== END ENCOUNTER REPORT ==========\n');
  console.log(lines.join('\n'));
});

// =============================================================================
// ENCOUNTER TESTS (data-driven)
// =============================================================================

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

for (const enc of ENCOUNTERS) {
  describe(enc.name, () => {
    const playerCreatorsList = getPlayerCreators();
    let encounterComps: { name: string; result: SimulationResults }[] = [];
    let overallPlayerWins = 0;
    let overallTotal = 0;

    beforeAll(async () => {
      for (let i = 0; i < enc.numComps; i++) {
        const [name, creators] = randomTeamCreators(enc.playerTeamSize, playerCreatorsList);
        const result = runEncounterMatchup(creators, enc.enemyFactory, enc.simsPerComp);
        encounterComps.push({ name, result });
        overallPlayerWins += result.team1Wins;
        overallTotal += result.numSimulations;
        if ((i + 1) % 20 === 0) await yieldToEventLoop();
      }
      allEncounterResults.push({ config: enc, compositions: encounterComps, overallPlayerWins, overallTotal });
    });

    it(`overall player win rate is between ${enc.winRateMin}% and ${enc.winRateMax}%`, () => {
      const winRate = (overallPlayerWins / overallTotal) * 100;
      expect(winRate, `Overall player win rate vs ${enc.enemies}: ${winRate.toFixed(1)}%`)
        .toBeGreaterThanOrEqual(enc.winRateMin);
      expect(winRate, `Overall player win rate vs ${enc.enemies}: ${winRate.toFixed(1)}%`)
        .toBeLessThanOrEqual(enc.winRateMax);
    });

    it('no player composition has extreme win rate', () => {
      const threshold = enc.zeroWinThreshold ?? 0;
      let zeroWinCount = 0;

      for (const { name, result } of encounterComps) {
        const winRate = (result.team1Wins / result.numSimulations) * 100;
        if (!enc.allowAutoWin) {
          expect(winRate, `${name} vs ${enc.enemies}: ${winRate.toFixed(1)}% — no composition should auto-win`)
            .toBeLessThan(100);
        }
        if (winRate === 0) zeroWinCount++;
      }

      if (threshold > 0) {
        const zeroWinRate = (zeroWinCount / encounterComps.length) * 100;
        expect(zeroWinRate, `${zeroWinCount}/${encounterComps.length} compositions have 0% win rate — too many hard losses`)
          .toBeLessThan(threshold);
      } else {
        for (const { name, result } of encounterComps) {
          const winRate = (result.team1Wins / result.numSimulations) * 100;
          expect(winRate, `${name} vs ${enc.enemies}: ${winRate.toFixed(1)}% — no composition should auto-lose`)
            .toBeGreaterThan(0);
        }
      }
    });

    it('battles finish within 30 rounds on average', () => {
      const totalRounds = encounterComps.reduce((s, r) => s + r.result.totalRounds, 0);
      const totalSims = encounterComps.reduce((s, r) => s + r.result.numSimulations, 0);
      const avgRounds = totalRounds / totalSims;
      expect(avgRounds, `${enc.name} avg combat length: ${avgRounds.toFixed(1)} rounds`)
        .toBeLessThanOrEqual(30);
    });

    it('draws are rare (< 15%)', () => {
      const totalDraws = encounterComps.reduce((s, r) => s + r.result.draws, 0);
      const drawRate = (totalDraws / overallTotal) * 100;
      expect(drawRate, `${enc.name} draw rate: ${drawRate.toFixed(1)}%`)
        .toBeLessThan(15);
    });
  });
}
