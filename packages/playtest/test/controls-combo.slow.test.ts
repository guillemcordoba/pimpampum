/**
 * A TWO-CARD COMBO — requirement 3c's must-PASS control: no single card is
 * right every turn, so repeating either loses to playing the kit.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, FOR_3C, GAMES, run, SMOKE } from './budgets.js';

describe('a two-card COMBO — no single card is right every turn', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('comboKit', [], GAMES, FOR_3C); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('requirement 3c passes a kit no one card can carry', () => {
    expect(r.oneTrick.ok, r.oneTrick.detail).toBe(true);
  });

  it.skipIf(SMOKE)('passes for the RIGHT reason — a real margin, not a wide error bar', () => {
    const m = r.oneTrick.margin!;
    expect(m.margin, r.oneTrick.detail).toBeGreaterThan(2 * m.stderr);
    expect(m.borderline).toBe(false);
  });
});
