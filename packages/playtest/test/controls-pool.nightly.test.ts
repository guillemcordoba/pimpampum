/**
 * THE REQUIREMENT "the best strategy is not a dumb one" (`poolVerdict`), on
 * control kits whose answer follows from their construction
 * (`control-kits.ts`), on the real engine: every hero on both sides holds the
 * kit and the pool is grown by the real double oracle. Where attacking simply
 * wins, always-attack is the best strategy there is, so the requirement must
 * be red on it; on a kit built as the triangle, a strategy that reads the
 * opponent beats every fixed one, so it must be green. The same requirement
 * on mock games, with no fight played, is `pool.test.ts`; on the sets' kits,
 * each set's `pool.nightly.test.ts`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { games } from '@pimpampum/bench';
import { describeStrategy, measurePool, type PoolReading } from '../src/index.js';
import { SMOKE, SYNTHETIC_MODULE } from './budgets.js';

const SET = { module: SYNTHETIC_MODULE, export: 'SYNTHETIC' };
const FIGHTS = games(100);
const MEMBERS = SMOKE ? 4 : 8;
const show = (p: PoolReading) => `${p.verdict.why.join('; ') || 'green'} · the mix: ${p.result.members.map((m, i) => ({ m, share: p.result.mix[i] })).filter(x => x.share >= 0.05).map(x => `${describeStrategy(x.m)} ${Math.round(100 * x.share)}%`).join('; ')}`;

describe('the strategy pool on control kits', () => {
  let attack: PoolReading, triangle: PoolReading;
  beforeAll(async () => {
    [attack, triangle] = await Promise.all([
      measurePool({ set: SET, level: 3, games: FIGHTS, control: 'attackWinsKit', maxMembers: MEMBERS }),
      measurePool({ set: SET, level: 3, games: FIGHTS, control: 'triangleKit', maxMembers: MEMBERS }),
    ]);
  });

  it('grew both pools from the three dumbest', () => {
    for (const p of [attack, triangle]) expect(p.result.members.slice(0, 3).map(describeStrategy)).toEqual(['always AA', 'always DD', 'always FF']);
  });

  it.skipIf(SMOKE)('is red where attacking simply wins: always-attack does not clearly lose to the mix', () => {
    expect(attack.verdict.ok, show(attack)).toBe(false);
    expect(attack.verdict.why.join(' '), show(attack)).toContain('always AA does not clearly lose to the mix');
  });

  it.skipIf(SMOKE)('is green on a kit built as the triangle', () => {
    expect(triangle.verdict.why, show(triangle)).toEqual([]);
  });
});
