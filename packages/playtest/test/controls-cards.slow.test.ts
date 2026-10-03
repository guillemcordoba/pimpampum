/**
 * A KIT WITH A CARD THAT DOES NOTHING — requirement 4/5's positive control,
 * and its negative one in the same kit: the real attacks beside it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { cardId, expectWellFormed, FOR_CARDS, GAMES, run, SMOKE } from './budgets.js';

describe('a kit with a card that does NOTHING', () => {
  let r: KitReport, noop: string, real: string[];
  beforeAll(async () => {
    r = await run('deadCardKit', [], GAMES, FOR_CARDS);
    noop = cardId(r, 'NoOp');
    real = [cardId(r, 'Real'), cardId(r, 'Real2')];
  });

  it('produces a whole report', () => expectWellFormed(r, 3));

  it.skipIf(SMOKE)('requirement 4/5 fails the kit, naming the no-op dead under EVERY opponent model', () => {
    // Not merely "sensitive": a card that does literally nothing has to clear
    // the strict bar, or the robustness check has made 4/5 unable to fail.
    expect(r.cardUse.ok, r.cardUse.detail).toBe(false);
    expect(r.cardUse.cards, r.cardUse.detail).toContain(noop);
  });

  it.skipIf(SMOKE)('does NOT name the real attacks — a rule that flags everything is as useless as one that flags nothing', () => {
    for (const id of real) {
      expect(r.cardUse.cards, r.cardUse.detail).not.toContain(id);
      expect(r.cardUse.sensitive, r.cardUse.detail).not.toContain(id);
    }
  });

  it.skipIf(SMOKE)('values the no-op below every real card', () => {
    const value = new Map(r.cardValues.map(v => [v.id, v.value]));
    expect(value.has(noop), 'the no-op was never priced').toBe(true);
    for (const id of real) expect(value.get(noop)!).toBeLessThan(value.get(id)!);
  });
});
