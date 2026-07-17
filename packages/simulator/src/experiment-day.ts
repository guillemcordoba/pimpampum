/**
 * Fatigue-budget sweep: does a party sustain 2-3 combats a day, and how does
 * FATIGUE_CONFIG.max shape mirror pacing? Fatigue persists across a day's
 * consecutive combats (resetForNewCombat restores PV, not fatigue).
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-day.ts
 */
import { CombatEngine, FATIGUE_CONFIG, newCombatStats, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { REGISTRY, randomTeam, runMatch, buildEncounter, getEncounter } from './tests/helpers.js';

const MIRROR_GAMES = 1500;
const DAYS = 400;
const COMBATS_PER_DAY = 3;

function mirrors(): void {
  const stats = newCombatStats();
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < MIRROR_GAMES; i++) {
    const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), stats);
    if (w === 0) a++; else if (w === 1) b++; else d++;
  }
  console.log(`  mirror: draws ${(100 * d / MIRROR_GAMES).toFixed(1)}%  avgRounds ${(stats.rounds / stats.combats).toFixed(1)}  A/B ${(100 * a / MIRROR_GAMES).toFixed(1)}/${(100 * b / MIRROR_GAMES).toFixed(1)}`);
}

function day(): void {
  const enc = getEncounter('patrulla-goblin')!;
  const winsByCombat = [0, 0, 0];
  const reached = [0, 0, 0];
  for (let dayI = 0; dayI < DAYS; dayI++) {
    const players = randomTeam('P', 4, 7);
    for (let c = 0; c < COMBATS_PER_DAY; c++) {
      reached[c]++;
      const enemies = buildEncounter(enc, 4);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 });
      const res = engine.runCombat();
      if (res.winner === 0) winsByCombat[c]++;
      else break; // party lost or drew — the day is over
    }
  }
  const cells = winsByCombat.map((w, c) => `combat${c + 1} ${(100 * w / reached[c]).toFixed(0)}% (${reached[c]})`);
  console.log(`  day (3× patrulla-goblin): ${cells.join('  ')}`);
}

for (const max of [10, 12, 15]) {
  FATIGUE_CONFIG.max = max;
  console.log(`\nmax fatigue = ${max}`);
  mirrors();
  day();
}
FATIGUE_CONFIG.max = 12;
