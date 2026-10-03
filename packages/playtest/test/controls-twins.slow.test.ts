/**
 * NOISY TWINS — requirement 3's must-FAIL control for noise: two attacks
 * identical in effect whose dice drift apart. The rollouts differ, but by
 * noise alone, so the cost of a random pick must be indistinguishable from
 * zero and choosing must not be called meaningful.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, FOR_CARDS, GAMES, run, SMOKE } from './budgets.js';

describe('two attacks identical in effect, one burning a random draw', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('noisyTwinKit', [], GAMES, FOR_CARDS); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('a random pick costs nothing distinguishable from zero', () => {
    const c = r.choiceCost!;
    expect(c.decisions, 'the twins must actually be valued').toBeGreaterThan(50);
    expect(Math.abs(c.mean), `${c.mean.toFixed(2)}±${c.stderr.toFixed(2)} — ${r.choices.detail}`)
      .toBeLessThan(3 * c.stderr + 0.1);
  });

  it.skipIf(SMOKE)('calls NEITHER twin never right — each is the other\'s runner-up, a tie', () => {
    expect(r.choices.neverRight, r.choices.detail).toEqual([]);
  });

  it.skipIf(SMOKE)('fails requirement 3 on choosing mattering', () => {
    expect(r.choices.ok, r.choices.detail).toBe(false);
  });
});
