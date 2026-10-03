/**
 * REQUIREMENT 1 — a fight that cannot end, and one that ends on round one.
 * Both need the kit in every seat: duration is a property of the whole fight.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { games } from '@pimpampum/bench';
import type { KitReport } from '../src/index.js';
import { CHEAP, expectWellFormed, NO_CARDS, run, SMOKE } from './budgets.js';

describe('requirement 1 — a fight that CANNOT end', () => {
  // Four seats of nothing but a fast 10d6 wall: the party can never kill and
  // nothing penetrates, so every fight runs to the round cap.
  let r: KitReport;
  beforeAll(async () => { r = await run('defenceOnlyKit', [], games(60), { ...CHEAP, allSeats: true, skip: [...NO_CARDS] }); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('fails requirement 1, naming the stall rate — "never ends", not merely "drags"', () => {
    expect(r.duration.ok, r.duration.detail).toBe(false);
    expect(r.duration.reasons!.some(x => x.startsWith('encallats')), r.duration.detail).toBe(true);
  });
});

describe('requirement 1 — a fight that ends on round one', () => {
  // The other direction: catches a bar set so tight that nothing could pass it.
  let r: KitReport;
  beforeAll(async () => { r = await run('blitzKit', [], games(60), { ...CHEAP, allSeats: true, skip: [...NO_CARDS] }); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('passes requirement 1', () => {
    expect(r.duration.ok, r.duration.detail).toBe(true);
    expect(r.duration.reasons).toEqual([]);
  });
});
