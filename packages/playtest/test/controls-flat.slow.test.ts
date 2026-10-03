/**
 * A KIT OF IDENTICAL CARDS — requirement 3's must-FAIL control for "choosing
 * matters": every choice is the same choice, so a random pick costs exactly
 * nothing. Every position ties and none can separate the cards, which is also
 * the "no decisions at all" path: it must fail, not pass vacuously.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, FOR_CARDS, GAMES, run, SMOKE } from './budgets.js';

describe('a kit of IDENTICAL cards — choosing cannot matter', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('flatKit', [4], GAMES, FOR_CARDS); });

  it('produces a whole report', () => expectWellFormed(r, 4));

  it.skipIf(SMOKE)('fails requirement 3 on the cost of a random pick, which is exactly zero', () => {
    expect(r.choices.ok, r.choices.detail).toBe(false);
    expect(r.choiceCost!.mean).toBe(0);
  });
});
