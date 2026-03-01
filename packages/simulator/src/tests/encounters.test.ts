import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ALL_ENCOUNTERS,
  ALL_CHARACTER_TEMPLATES,
  createCharacterForPlayerCount,
} from '@pimpampum/engine';
import type { Character, EncounterDefinition } from '@pimpampum/engine';
import {
  runEncounterMatchup,
  randomTeamCreators,
  getPlayerCreators,
} from './helpers.js';
import type { SimulationResults } from './helpers.js';

// =============================================================================
// WIN RATE TARGETS PER ENCOUNTER
// =============================================================================

interface EncounterTargets {
  winRateMin: number;
  winRateMax: number;
  allowAutoWin?: boolean;
  zeroWinThreshold?: number;
}

const ENCOUNTER_TARGETS: Record<string, EncounterTargets> = {
  'wolf-pack': { winRateMin: 90, winRateMax: 100, allowAutoWin: true },
  'goblin-horde': { winRateMin: 55, winRateMax: 78 },
  'basilisk': { winRateMin: 52, winRateMax: 78, zeroWinThreshold: 15 },
  'devil-encounter': { winRateMin: 52, winRateMax: 78 },
  'stone-golem': { winRateMin: 50, winRateMax: 75 },
  'horned-devil': { winRateMin: 45, winRateMax: 65 },
};

const PLAYER_COUNTS = [3, 4, 5, 6];
const NUM_COMPS = 100;
const SIMS_PER_COMP = 100;

// =============================================================================
// HELPER: Build enemy team from encounter definition
// =============================================================================

function buildEnemyFactory(encounter: EncounterDefinition, playerCount: number): (si: number) => Character[] {
  const groups = encounter.compositions[playerCount];
  if (!groups) throw new Error(`No composition for ${encounter.id} at ${playerCount}P`);

  return (si: number) => {
    const enemies: Character[] = [];
    for (const group of groups) {
      const template = ALL_CHARACTER_TEMPLATES.find(t => t.id === group.templateId);
      if (!template) throw new Error(`Unknown template: ${group.templateId}`);
      for (let j = 0; j < group.count; j++) {
        enemies.push(createCharacterForPlayerCount(template, `${template.id}_${j}_${si}`, playerCount));
      }
    }
    return enemies;
  };
}

// =============================================================================
// SHARED STATE & DIAGNOSTIC DUMP
// =============================================================================

interface EncounterResults {
  encounterId: string;
  playerCount: number;
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
  p(`  ${'Encounter'.padEnd(25)} ${'Diff'.padEnd(10)} Player Counts`);
  p(`  ${'-'.repeat(65)}`);
  for (const enc of ALL_ENCOUNTERS) {
    const pcs = Object.keys(enc.compositions).join(', ');
    p(`  ${enc.name.padEnd(25)} ${enc.difficulty.padEnd(10)} ${pcs}`);
  }

  // Results by encounter
  p('\n--- ENCOUNTER RESULTS ---');
  for (const enc of ALL_ENCOUNTERS) {
    p(`\n  ${enc.name} (${enc.difficulty}):`);
    for (const pc of PLAYER_COUNTS) {
      const er = allEncounterResults.find(r => r.encounterId === enc.id && r.playerCount === pc);
      if (!er) continue;
      const winRate = er.overallTotal > 0 ? ((er.overallPlayerWins / er.overallTotal) * 100).toFixed(1) : 'N/A';
      const totalDraws = er.compositions.reduce((s, r) => s + r.result.draws, 0);
      const drawRate = er.overallTotal > 0 ? ((totalDraws / er.overallTotal) * 100).toFixed(1) : '0';
      const totalRounds = er.compositions.reduce((s, r) => s + r.result.totalRounds, 0);
      const avgRnds = er.overallTotal > 0 ? (totalRounds / er.overallTotal).toFixed(1) : 'N/A';

      const sorted = [...er.compositions]
        .map(r => ({ name: r.name, rate: (r.result.team1Wins / r.result.numSimulations) * 100 }))
        .sort((a, b) => b.rate - a.rate);
      const top2 = sorted.slice(0, 2);
      const bot2 = sorted.slice(-2).reverse();

      p(`    ${pc}P: ${winRate}% win (${er.overallPlayerWins}/${er.overallTotal}), avg ${avgRnds} rnds, ${drawRate}% draws`);
      p(`      Best:  ${top2.map(r => `${r.name} ${r.rate.toFixed(0)}%`).join(', ')}`);
      p(`      Worst: ${bot2.map(r => `${r.name} ${r.rate.toFixed(0)}%`).join(', ')}`);
    }
  }

  p('\n========== END ENCOUNTER REPORT ==========\n');
  console.log(lines.join('\n'));
});

// =============================================================================
// ENCOUNTER TESTS (parametric: encounter x playerCount)
// =============================================================================

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

for (const encounter of ALL_ENCOUNTERS) {
  const targets = ENCOUNTER_TARGETS[encounter.id];
  if (!targets) continue;

  describe(encounter.name, () => {
    for (const playerCount of PLAYER_COUNTS) {
      if (!encounter.compositions[playerCount]) continue;

      describe(`${playerCount} jugadors`, () => {
        const playerCreatorsList = getPlayerCreators();
        let encounterComps: { name: string; result: SimulationResults }[] = [];
        let overallPlayerWins = 0;
        let overallTotal = 0;

        beforeAll(async () => {
          const enemyFactory = buildEnemyFactory(encounter, playerCount);
          for (let i = 0; i < NUM_COMPS; i++) {
            const [name, creators] = randomTeamCreators(playerCount, playerCreatorsList);
            const result = runEncounterMatchup(creators, enemyFactory, SIMS_PER_COMP);
            encounterComps.push({ name, result });
            overallPlayerWins += result.team1Wins;
            overallTotal += result.numSimulations;
            if ((i + 1) % 20 === 0) await yieldToEventLoop();
          }
          allEncounterResults.push({
            encounterId: encounter.id,
            playerCount,
            compositions: encounterComps,
            overallPlayerWins,
            overallTotal,
          });
        });

        it(`player win rate is between ${targets.winRateMin}% and ${targets.winRateMax}%`, () => {
          const winRate = (overallPlayerWins / overallTotal) * 100;
          expect(winRate, `${encounter.name} ${playerCount}P: ${winRate.toFixed(1)}%`)
            .toBeGreaterThanOrEqual(targets.winRateMin);
          expect(winRate, `${encounter.name} ${playerCount}P: ${winRate.toFixed(1)}%`)
            .toBeLessThanOrEqual(targets.winRateMax);
        });

        it('no player composition has extreme win rate', () => {
          const threshold = targets.zeroWinThreshold ?? 0;
          let zeroWinCount = 0;

          for (const { name, result } of encounterComps) {
            const winRate = (result.team1Wins / result.numSimulations) * 100;
            if (!targets.allowAutoWin) {
              expect(winRate, `${name} vs ${encounter.name} ${playerCount}P: ${winRate.toFixed(1)}% — no auto-win`)
                .toBeLessThan(100);
            }
            if (winRate === 0) zeroWinCount++;
          }

          if (threshold > 0) {
            const zeroWinRate = (zeroWinCount / encounterComps.length) * 100;
            expect(zeroWinRate, `${zeroWinCount}/${encounterComps.length} comps have 0% win rate`)
              .toBeLessThan(threshold);
          } else {
            for (const { name, result } of encounterComps) {
              const winRate = (result.team1Wins / result.numSimulations) * 100;
              expect(winRate, `${name} vs ${encounter.name} ${playerCount}P: ${winRate.toFixed(1)}% — no auto-lose`)
                .toBeGreaterThan(0);
            }
          }
        });

        it('battles finish within 30 rounds on average', () => {
          const totalRounds = encounterComps.reduce((s, r) => s + r.result.totalRounds, 0);
          const totalSims = encounterComps.reduce((s, r) => s + r.result.numSimulations, 0);
          const avgRounds = totalRounds / totalSims;
          expect(avgRounds, `${encounter.name} ${playerCount}P avg: ${avgRounds.toFixed(1)} rounds`)
            .toBeLessThanOrEqual(30);
        });

        it('draws are rare (< 15%)', () => {
          const totalDraws = encounterComps.reduce((s, r) => s + r.result.draws, 0);
          const drawRate = (totalDraws / overallTotal) * 100;
          expect(drawRate, `${encounter.name} ${playerCount}P draw rate: ${drawRate.toFixed(1)}%`)
            .toBeLessThan(15);
        });
      });
    }
  });
}
