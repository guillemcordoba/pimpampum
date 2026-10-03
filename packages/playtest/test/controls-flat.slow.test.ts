/**
 * A KIT OF IDENTICAL CARDS, in one seat of four.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, FOR_3C, GAMES, run, SMOKE } from './budgets.js';

describe('a kit of IDENTICAL cards — one card repeated is not a strategy', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('flatKit', [4], GAMES, FOR_3C); });

  it('produces a whole report', () => expectWellFormed(r, 4));

  it.skipIf(SMOKE)('requirement 1 reports the gain a level really does buy — a LIMIT of requirement 1', () => {
    // A roll is the card's dice PLUS the level (resolution.ts), so four
    // identical cards hit harder at level 4 than at level 1 whatever the hand
    // looks like. Requirement 1 cannot separate "the cards get better" from
    // "every roll gets +1": a ✅ on it does not show a kit's levels buy VARIETY.
    expect(r.monotonicity.ok, r.monotonicity.detail).toBe(true);
  });

  it.skipIf(SMOKE)('requirement 3c does not claim the kit beats its own one-trick', () => {
    // Repeating one card IS playing this kit, exactly.
    expect(r.oneTrick.ok, r.oneTrick.detail).toBe(false);
    expect(r.oneTrick.margin!.armWins).toBe(false);
  });
});
