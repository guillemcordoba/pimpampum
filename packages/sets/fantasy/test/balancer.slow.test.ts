/**
 * THIS SET'S ENCOUNTERS SOLVE TO THE DIFFICULTY REQUESTED.
 *
 * The balancer's own tests check the solver on synthetic content. What only
 * this set can answer is whether it holds on THESE creatures, at the depth the
 * app solves at: every creature, solved and then replayed on an independent
 * seed with a freshly drawn party, lands near the winrate it reported; and
 * realistic parties get the difficulty they ask for — or are told why not.
 *
 * Solves run in child processes (`isolated`), four at a time: one creature's
 * solves are minutes of synchronous work.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolated, SMOKE } from '@pimpampum/bench';
import { ENEMY_DEFINITIONS, SOLVE_MISS_EPSILON, type PartySpec, type PoolSpec } from '../src/index.js';
import { bodiesFor } from '../src/bench/index.js';
import type { Checked } from './balancer.work.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'balancer.work.ts');

/**
 * Two noisy estimates compared, so the tolerance is set by sampling: a
 * 200-game estimate with a redrawn party spreads ~4.4pp, the difference of two
 * ~6.2pp, and 18pp is ~3σ — tight enough to catch a solver that lands in the
 * wrong place, loose enough not to flake.
 */
const REPLAY_TOLERANCE = 0.18;
/** Requested vs achieved: PV is an integer lever and the search sample cheap. */
const TARGET_TOLERANCE = 0.18;

async function inBatches<T>(jobs: (() => Promise<T>)[], width = 4): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += width) out.push(...await Promise.all(jobs.slice(i, i + width).map(j => j())));
  return out;
}

const DRAWN: PartySpec = { count: 4, levels: 6, armor: 1 };
const REPLAYS = ENEMY_DEFINITIONS.flatMap(e => [0.5, 0.75].map(target => ({
  label: `${e.id} @ ${target}`, pool: [{ enemyId: e.id, count: bodiesFor(e.id) }] as PoolSpec[], party: DRAWN, target,
})));
const TARGETS = ([
  ['4 players, cuir', { count: 4, levels: 6, armor: 1 }, 'goblin', 6],
  ['4 players, no armour', { count: 4, levels: 6, armor: 0 }, 'goblin', 6],
  ['4 players, ferro', { count: 4, levels: 6, armor: 2 }, 'goblin', 6],
  ['3 players', { count: 3, levels: 6, armor: 1 }, 'goblin', 5],
  ['6 players', { count: 6, levels: 6, armor: 1 }, 'goblin', 8],
  ['elite squad', { count: 4, levels: 6, armor: 1 }, 'stone-golem', 3],
  ['lone boss', { count: 4, levels: 6, armor: 1 }, 'horned-devil', 1],
] as const).map(([label, party, enemyId, count]) => ({
  label, pool: [{ enemyId, count }] as PoolSpec[], party: party as PartySpec, target: 0.65,
}));

describe('this set\'s encounters', () => {
  let replays: (Checked & { label: string })[];
  let targets: (Checked & { label: string; target: number })[];
  beforeAll(async () => {
    const run = (c: { label: string; pool: PoolSpec[]; party: PartySpec; target: number }) => async () =>
      ({ ...c, ...await isolated<Checked>(WORK, 'solveAndReplay', [c.pool, c.party, c.target]) });
    [replays, targets] = [await inBatches(REPLAYS.map(run)), await inBatches(TARGETS.map(run))];
  });

  it('every creature can be solved', () => {
    for (const r of replays) expect(r.solved, r.label).not.toBeNull();
  });

  it.skipIf(SMOKE)('hold up on an independent replay — the reported winrate is the real one', () => {
    for (const r of replays) {
      const s = r.solved!;
      expect(Math.abs(r.replay - s.predictedWinrate),
        `${r.label}: reported ${(100 * s.predictedWinrate).toFixed(0)}%, replay ${(100 * r.replay).toFixed(0)}%`)
        .toBeLessThan(REPLAY_TOLERANCE);
    }
  });

  it.skipIf(SMOKE)('realistic parties get the difficulty they ask for, or are told why not', () => {
    const asserted = targets.filter(t => !t.solved!.clamped && !t.solved!.durationCapped);
    for (const t of asserted) {
      expect(Math.abs(t.solved!.missBy), `${t.label}: asked 65%, achieved ${(100 * t.solved!.predictedWinrate).toFixed(0)}%`)
        .toBeLessThan(TARGET_TOLERANCE);
    }
    // A case that asserts nothing is not a pass: if every request came back as
    // an honest miss, this checked nothing, and that is a content signal.
    expect(asserted.length, 'every request was clamped or duration-capped').toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)('never reports a miss as a hit', () => {
    for (const t of [...replays, ...targets]) {
      const s = t.solved!;
      const off = Math.abs(s.missBy) > Math.max(SOLVE_MISS_EPSILON, 2 * s.stderr);
      expect(!off || s.clamped || s.durationCapped || s.searchMissed,
        `${t.label}: ${(100 * s.missBy).toFixed(0)}pp off target and every flag is false`).toBe(true);
    }
  });
});
