/**
 * THE SAME FLAT KIT IN EVERY SEAT — the control requirements 3 and 3b need.
 *
 * Both impoverish the WHOLE subject side, so a control in one seat of four
 * cannot zero their margin: the other three still think. With four
 * identical-card kits on the field every arm plays the same card every round,
 * so the margin is ZERO BY CONSTRUCTION and both requirements must fire.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { games } from '@pimpampum/bench';
import { MINDLESS_MARGIN, STRATEGY_SPACE_MARGIN, type KitReport } from '../src/index.js';
import { CHEAP, expectWellFormed, GAMES, NEITHER, run, SMOKE } from './budgets.js';

describe('the SAME flat kit in every seat — thinking cannot matter to the side', () => {
  let r: KitReport;
  // 400 combats an arm puts 2σ of a margin near 7pp: inside both bars, so the
  // verdicts are about the kit rather than about the sample.
  beforeAll(async () => {
    r = await run('flatKit', [4], GAMES, { ...CHEAP, mindlessGames: games(400), allSeats: true, skip: [...NEITHER] });
  });

  it('produces a whole report', () => expectWellFormed(r, 4));

  it.skipIf(SMOKE)('requirement 3 finds no margin, because there is none to find', () => {
    expect(r.spam.ok, r.spam.detail).toBe(false);
  });

  it.skipIf(SMOKE)('requirement 3b finds no margin either', () => {
    expect(r.strategySpace.ok, r.strategySpace.detail).toBe(false);
  });

  it.skipIf(SMOKE)('fires for the RIGHT reason — the margin really is about zero, and resolvably so', () => {
    for (const v of [r.spam, r.strategySpace]) {
      const m = v.margin!;
      expect(Math.abs(m.margin), v.detail).toBeLessThan(3 * m.stderr + 0.02);
      expect(2 * m.stderr, 'the sample cannot resolve the bar').toBeLessThan(Math.min(MINDLESS_MARGIN, STRATEGY_SPACE_MARGIN));
    }
  });
});
