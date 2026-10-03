/**
 * DOES A SOLVED ENCOUNTER LAND WHERE IT WAS ASKED TO?
 *
 * The number the GM reads is "this fight is 65%". The only honest check is the
 * one a sampler's calibration test makes: ask for X, then MEASURE what was
 * delivered on dice the solver never saw — never on the sample it steered by,
 * which is winner's curse — across many requests, so a systematic lean shows
 * as a pattern rather than hiding inside one noisy solve.
 *
 * Tolerance: the achieved rate carries its own sampling error, and PV is an
 * integer lever (one point can be worth several winrate points on small
 * bodies), so a request is met when it lands within 3σ plus a few points —
 * unless the solver SAID it could not (clamped, duration-capped, missed).
 */
import { describe, it, expect } from 'vitest';
import { simulateEncounter, solveEncounter, type PoolSpec } from '../src/index.js';
import { CONTENT, FAST, type TestParty } from './content.js';

declare const process: { env: Record<string, string | undefined> };
const SMOKE = process.env.BENCH_SMOKE === '1';
const HELD_OUT_GAMES = SMOKE ? 20 : 2000;

const REQUESTS: { pool: PoolSpec[]; party: TestParty }[] = [
  { pool: [{ enemyId: 'rat', count: 3 }], party: { heroes: 4 } },
  { pool: [{ enemyId: 'rat', count: 6 }], party: { heroes: 4, armour: 1 } },
  { pool: [{ enemyId: 'ogre', count: 1 }], party: { heroes: 3 } },
  { pool: [{ enemyId: 'rat', count: 2 }, { enemyId: 'ogre', count: 1 }], party: { heroes: 4 } },
];
const TARGETS = [0.5, 0.65, 0.8, 0.9];

describe('solved encounters, re-measured on held-out dice', () => {
  const results = REQUESTS.flatMap(req => TARGETS.map(target => {
    const solved = solveEncounter(CONTENT, req.pool, req.party, target, { ...FAST, maxAvgRounds: Infinity })!;
    const replay = simulateEncounter(CONTENT, solved.groups, req.party, { ...FAST, games: HELD_OUT_GAMES, seed: 99_000 + Math.round(target * 100) });
    return { req, target, solved, replay };
  }));

  it.skipIf(SMOKE)('each lands on its target — or says why not', () => {
    for (const { req, target, solved, replay } of results) {
      if (solved.clamped || solved.searchMissed) continue;
      const tolerance = 3 * replay.stderr + 0.04;
      expect(Math.abs(replay.winrate - target),
        `${JSON.stringify(req.pool)} asked ${target}, delivered ${replay.winrate.toFixed(3)}±${replay.stderr.toFixed(3)}`)
        .toBeLessThan(tolerance);
    }
  });

  it.skipIf(SMOKE)('and does not lean: across all requests, the mean miss is near zero', () => {
    const misses = results.filter(r => !r.solved.clamped && !r.solved.searchMissed).map(r => r.replay.winrate - r.target);
    expect(misses.length).toBeGreaterThan(TARGETS.length);
    const mean = misses.reduce((a, b) => a + b, 0) / misses.length;
    expect(Math.abs(mean), `mean miss ${(mean * 100).toFixed(1)}pp over ${misses.length} solves`).toBeLessThan(0.03);
  });

  it.skipIf(SMOKE)('what it reports about itself agrees with the held-out replay', () => {
    // The GM trusts `predictedWinrate`. It is measured on its own fresh seed, so
    // it must agree with a second fresh seed within their combined error.
    for (const { solved, replay } of results) {
      const se = Math.hypot(solved.stderr, replay.stderr);
      expect(Math.abs(solved.predictedWinrate - replay.winrate)).toBeLessThan(4 * se + 0.01);
    }
  });
});

describe('metamorphic relations of the solver', () => {
  it.skipIf(SMOKE)('a harder request never gets weaker creatures', () => {
    const pv = (t: number) => solveEncounter(CONTENT, [{ enemyId: 'rat', count: 3 }], { heroes: 4 }, t, { ...FAST, maxAvgRounds: Infinity })!.groups[0].pv;
    const ladder = [0.9, 0.75, 0.6, 0.45].map(pv);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i], `PV by target: ${ladder}`).toBeGreaterThanOrEqual(ladder[i - 1]);
  });

  it.skipIf(SMOKE)('a stronger party gets tougher creatures for the same target', () => {
    const pv = (party: TestParty) => solveEncounter(CONTENT, [{ enemyId: 'rat', count: 3 }], party, 0.65, { ...FAST, maxAvgRounds: Infinity })!.groups[0].pv;
    expect(pv({ heroes: 4, armour: 2 })).toBeGreaterThan(pv({ heroes: 4 }));
    expect(pv({ heroes: 5 })).toBeGreaterThan(pv({ heroes: 3 }));
  });
});

describe('at the depth the app solves at', () => {
  it.skipIf(SMOKE)('a default solve (depth-1 verification) lands on its target at depth 1', () => {
    const party: TestParty = { heroes: 4 };
    const solved = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 4 }], party, 0.65, { searchGames: 80, maxAvgRounds: Infinity })!;
    const replay = simulateEncounter(CONTENT, solved.groups, party, { games: SMOKE ? 20 : 800, seed: 4242 });
    if (!solved.clamped && !solved.searchMissed) {
      expect(Math.abs(replay.winrate - 0.65), `delivered ${replay.winrate.toFixed(3)}`).toBeLessThan(3 * replay.stderr + 0.04);
    }
  });
});
