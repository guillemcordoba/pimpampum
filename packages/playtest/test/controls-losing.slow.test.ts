/**
 * REQUIREMENT 7 — a card only legal once its holder is nearly dead.
 *
 * Requirement 7 is confounded by design — a card played only in trouble
 * correlates with losing however good it is — and that confound is what makes
 * it controllable. A ❌ here is the harness working; §7.1 calls it a flag to
 * investigate, never a verdict.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { games } from '@pimpampum/bench';
import type { KitReport } from '../src/index.js';
import { CHEAP, cardId, expectWellFormed, NEITHER, run, SMOKE } from './budgets.js';

describe('requirement 7 — a card only legal once its holder is nearly dead', () => {
  let r: KitReport;
  // The gated card is legal in few fights, and requirement 7 will not judge a
  // card on fewer than 60 PLAYS, so this sweep needs more fights than the rest.
  beforeAll(async () => { r = await run('losingOnlyKit', [], games(800), { ...CHEAP, skip: [...NEITHER] }); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('flags the card that only ever appears when losing', () => {
    expect(r.correlation.ok, r.correlation.detail).toBe(false);
    expect(r.correlation.cards, r.correlation.detail).toContain(cardId(r, 'Desperate'));
  });

  it.skipIf(SMOKE)('does NOT flag the ungated card beside it', () => {
    expect(r.correlation.cards, r.correlation.detail).not.toContain(cardId(r, 'Normal'));
  });
});
