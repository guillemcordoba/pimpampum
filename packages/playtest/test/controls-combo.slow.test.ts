/**
 * A TWO-CARD COMBO — requirement 3's must-PASS control: each card is right at
 * its own moment and the wrong one throws the shot away, so neither card is
 * dead or automatic and choosing clearly matters.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { MIN_CHOICE_COST, type KitReport } from '../src/index.js';
import { expectWellFormed, FOR_CARDS, GAMES, run, SMOKE } from './budgets.js';

describe('a two-card COMBO — each card right at its own moment', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('comboKit', [], GAMES, FOR_CARDS); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('passes requirement 3 — neither card is never right', () => {
    expect(r.choices.ok, r.choices.detail).toBe(true);
    expect(r.choices.neverRight, r.choices.detail).toEqual([]);
  });

  it.skipIf(SMOKE)('passes for the RIGHT reason — choosing clearly matters, not a wide error bar', () => {
    const c = r.choiceCost!;
    expect(c.mean - 2 * c.stderr, r.choices.detail).toBeGreaterThan(MIN_CHOICE_COST);
  });
});
