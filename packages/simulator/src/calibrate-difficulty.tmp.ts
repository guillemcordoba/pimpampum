/** Calibration: per-species, does the solver's promised winrate match reality?
 *  Prints a suggested `difficulty` correction per species.
 *  Run: npx tsx src/calibrate-difficulty.tmp.ts */
import { CombatEngine, assignStrategies, AIStrategy, Character } from '@pimpampum/engine';
import {
  ENEMY_TEMPLATES, createEnemyFromTemplate, solveEncounter, winrateForRatio, WINRATE_K,
} from '@pimpampum/enemies';
import { REGISTRY, randomTeam, shuffle, randInt } from './tests/helpers.js';

const STRATS = [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect];
const CONFIGS = 30;       // random configurations per species × target
const GAMES = 14;         // games per configuration
const TARGETS = [0.3, 0.5, 0.7, 0.85];

function topLevel(c: Character): number {
  return Math.max(...c.skills.values());
}

function randomCount(role: string): number {
  if (role === 'solitari') return 1;
  if (role === 'horda') return randInt(3, 8);
  return randInt(2, 5);
}

const logit = (p: number) => Math.log(p / (1 - p));

for (const t of ENEMY_TEMPLATES) {
  let sumClaim = 0, sumActual = 0, n = 0;
  const perTarget: string[] = [];
  for (const target of TARGETS) {
    let claimAcc = 0, winAcc = 0, games = 0;
    for (let cfg = 0; cfg < CONFIGS; cfg++) {
      const playerCount = randInt(3, 5);
      const budget = randInt(35, 55);
      const count = randomCount(t.role);
      // One reference party build per config to define tops (players are
      // re-rolled per game with the same budget, so tops stay comparable).
      const ref = randomTeam('R', playerCount, budget);
      const tops = ref.map(topLevel);
      const solved = solveEncounter([{ template: t, count }], tops, target);
      if (solved.groups.length === 0) continue;
      const g = solved.groups[0];
      const claim = winrateForRatio(solved.ratio); // model's own promise (post-clamp)
      for (let i = 0; i < GAMES; i++) {
        const players = randomTeam('P', playerCount, budget);
        const enemies = Array.from({ length: g.count }, (_, k) =>
          createEnemyFromTemplate(t, Object.fromEntries(t.skills.map(s => [s, g.level])), `${t.displayName} ${k}`));
        assignStrategies(players, shuffle(STRATS));
        const w = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
        claimAcc += claim;
        winAcc += w === 0 ? 1 : 0;
        games++;
      }
    }
    const claimAvg = claimAcc / games, winAvg = winAcc / games;
    sumClaim += claimAcc; sumActual += winAcc; n += games;
    perTarget.push(`t${(100 * target).toFixed(0)}: claim ${(100 * claimAvg).toFixed(0)} real ${(100 * winAvg).toFixed(0)}`);
  }
  const claim = sumClaim / n, actual = Math.min(0.97, Math.max(0.03, sumActual / n));
  // If players win MORE than claimed, the species is weaker than scored →
  // its effective ratio is lower than intended. Infer the implied ratio from
  // the observed winrate and correct difficulty by the ratio of ratios.
  const rIntended = 1 - logit(Math.min(0.95, Math.max(0.05, claim))) / WINRATE_K;
  const rImplied = 1 - logit(actual) / WINRATE_K;
  const correction = rImplied / rIntended;
  const suggested = (t.difficulty * correction);
  console.log(
    `${t.id.padEnd(14)} d=${t.difficulty.toFixed(2)}  claim ${(100 * claim).toFixed(0)}%  real ${(100 * actual).toFixed(0)}%  ` +
    `→ suggested d ≈ ${suggested.toFixed(2)}   | ${perTarget.join(' · ')}`);
}
