/**
 * THE SOLVER'S CONTRACT — what it promises about inputs, flags and error bars,
 * checked on tiny content where a solve costs a second.
 *
 * Whether solved encounters land where they were asked to, re-measured on
 * dice the solver never saw, is the slow file's question.
 */
import { describe, it, expect } from 'vitest';
import {
  chunkJobs, type ChunkJob, playChunk, PV_MAX, PV_MIN, simulateEncounter, solveEncounter, solveEncounterAsync,
  SOLVE_MISS_EPSILON, TARGET_WINRATES,
} from '../src/index.js';
import { CONTENT, FAST, type TestParty } from './content.js';

const FOUR: TestParty = { heroes: 4 };

describe('simulateEncounter', () => {
  it('an empty encounter is a certain win and costs nothing', () => {
    expect(simulateEncounter(CONTENT, [], FOUR, FAST)).toEqual({ winrate: 1, games: 0, avgRounds: 0, roundsStderr: 0, stderr: 0 });
  });

  it('is deterministic for a seed', () => {
    const g = [{ enemyId: 'rat', count: 3, pv: 10 }];
    expect(simulateEncounter(CONTENT, g, FOUR, { ...FAST, seed: 7 }))
      .toEqual(simulateEncounter(CONTENT, g, FOUR, { ...FAST, seed: 7 }));
  });

  it('quotes a binomial error for a fixed party and a wider one for a drawn party', () => {
    const g = [{ enemyId: 'rat', count: 3, pv: 10 }];
    const fixed = simulateEncounter(CONTENT, g, FOUR, FAST);
    const drawn = simulateEncounter(CONTENT, g, { heroes: 4, fixed: false }, FAST);
    const binomial = Math.sqrt(Math.max(0.0001, fixed.winrate * (1 - fixed.winrate)) / fixed.games);
    expect(fixed.stderr).toBeCloseTo(binomial, 12);
    expect(drawn.stderr / Math.sqrt(Math.max(0.0001, drawn.winrate * (1 - drawn.winrate)) / drawn.games)).toBeCloseTo(1.25, 12);
  });

  it('tougher creatures are harder to beat', () => {
    const at = (pv: number) => simulateEncounter(CONTENT, [{ enemyId: 'rat', count: 3, pv }], FOUR, FAST).winrate;
    expect(at(3)).toBeGreaterThan(at(15));
    expect(at(15)).toBeGreaterThan(at(60));
  });
});

describe('solveEncounter — inputs', () => {
  it('returns nothing to solve for an empty pool, unknown creatures or zero counts', () => {
    expect(solveEncounter(CONTENT, [], FOUR, 0.5, FAST)).toBeNull();
    expect(solveEncounter(CONTENT, [{ enemyId: 'dragon', count: 1 }], FOUR, 0.5, FAST)).toBeNull();
    expect(solveEncounter(CONTENT, [{ enemyId: 'rat', count: 0 }], FOUR, 0.5, FAST)).toBeNull();
  });

  it('honours a group\'s fixed PV and level, and shares the rest out by bulk', () => {
    const r = solveEncounter(CONTENT, [
      { enemyId: 'rat', count: 2 }, { enemyId: 'ogre', count: 1 }, { enemyId: 'rat', count: 1, pv: 77, level: 3 },
    ], FOUR, 0.6, FAST)!;
    const [rats, ogre, pinned] = r.groups;
    expect(pinned).toEqual({ enemyId: 'rat', count: 1, level: 3, pv: 77 });
    // A body gets scale × bulk, rounded: the ogre (bulk 2) is twice a rat.
    expect(Math.abs(ogre.pv - 2 * rats.pv)).toBeLessThanOrEqual(1);
    expect(rats.level).toBe(1);
  });

  it('keeps every body inside the PV bounds', () => {
    for (const target of [0.02, 0.98]) {
      const r = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 3 }], FOUR, target, FAST)!;
      for (const g of r.groups) {
        expect(g.pv).toBeGreaterThanOrEqual(PV_MIN);
        expect(g.pv).toBeLessThanOrEqual(PV_MAX);
      }
    }
  });
});

describe('solveEncounter — what it reports', () => {
  it('flags an unreachable target as clamped rather than pretending', () => {
    // A mouse cannot win: at the toughest PV the bounds allow, the best it gets
    // is a draw at the round cap. A 5% party winrate is out of reach, and the
    // solver must say so rather than report a miss or a false hit.
    const r = solveEncounter(CONTENT, [{ enemyId: 'mouse', count: 1 }], FOUR, 0.05, { ...FAST, maxAvgRounds: Infinity })!;
    expect(r.clamped, JSON.stringify(r)).toBe(true);
    expect(r.searchMissed).toBe(false);
    expect(r.groups[0].pv).toBe(PV_MAX);
  });

  it('holds the fight inside the round budget, and says when that cost it the target', () => {
    const r = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 2 }], FOUR, TARGET_WINRATES.boss, { ...FAST, maxAvgRounds: 3 })!;
    expect(r.maxAvgRounds).toBe(3);
    if (r.durationCapped) expect(r.predictedWinrate).toBeGreaterThan(r.targetWinrate);
    expect(r.avgRounds).toBeLessThan(3 + 1);
  });

  it('searchMissed is exactly "off target beyond noise, for no declared reason"', () => {
    for (const target of [0.3, 0.6, 0.9]) {
      const r = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 3 }], FOUR, target, FAST)!;
      expect(r.missBy).toBeCloseTo(r.predictedWinrate - r.targetWinrate, 12);
      const beyond = Math.abs(r.missBy) > Math.max(SOLVE_MISS_EPSILON, 2 * r.stderr);
      expect(r.searchMissed).toBe(!r.clamped && !r.durationCapped && beyond);
    }
  });

  it('reports a winrate measured on its own sample, not the one it steered by', () => {
    const r = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 3 }], FOUR, 0.6, FAST)!;
    expect(r.games).toBe(FAST.games);
    const replay = simulateEncounter(CONTENT, r.groups, FOUR, { ...FAST, seed: 20260801 + 977 });
    expect(r.predictedWinrate).toBe(replay.winrate);
  });
});

describe('the parallel solve', () => {
  it('chunks a simulation into seeded pieces whose sum is the whole', () => {
    const jobs = chunkJobs([{ enemyId: 'rat', count: 3, pv: 10 }], { ...FAST, games: 23, seed: 5 });
    expect(jobs.reduce((n, j) => n + j.games, 0)).toBe(23);
    expect(new Set(jobs.map(j => j.seed)).size).toBe(jobs.length);
  });

  it('gives exactly the synchronous answer, whatever order the chunks come back in', async () => {
    const pool = [{ enemyId: 'rat', count: 3 }];
    const backwards = async (jobs: ChunkJob[]) =>
      [...jobs].reverse().map(job => playChunk(CONTENT, FOUR, job)).reverse();
    const sync = solveEncounter(CONTENT, pool, FOUR, 0.6, { searchGames: 20, steps: 4, games: 40 });
    const parallel = await solveEncounterAsync(CONTENT, pool, FOUR, 0.6, { searchGames: 20, steps: 4, games: 40 }, backwards);
    expect(parallel).toEqual(sync);
  });

  it('stops when cancelled', async () => {
    let calls = 0;
    const run = async (jobs: ChunkJob[]) => { calls++; return jobs.map(job => playChunk(CONTENT, FOUR, job)); };
    const out = await solveEncounterAsync(CONTENT, [{ enemyId: 'rat', count: 3 }], FOUR, 0.6, { searchGames: 20 }, run, () => calls >= 1);
    expect(out).toBeNull();
    expect(calls).toBe(1);
  });
});
