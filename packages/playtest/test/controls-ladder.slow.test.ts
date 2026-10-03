/**
 * REQUIREMENT 1 — a kit that only improves, and one that improves alarmingly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, run, SMOKE } from './budgets.js';

describe('a LADDER kit — each card strictly bigger than the last', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('ladderKit', [4]); });

  it('produces a whole report', () => expectWellFormed(r, 4));

  it.skipIf(SMOKE)('requirement 1 finds the gain, and no regression', () => {
    expect(r.monotonicity.ok, r.monotonicity.detail).toBe(true);
    expect(r.monotonicity.regressions).toEqual([]);
    expect(r.monotonicity.gain!.value).toBeGreaterThan(2 * r.monotonicity.gain!.stderr);
  });
});

describe('a kit whose second card costs its user dearly', () => {
  /*
   * REQUIREMENT 1'S REGRESSION BRANCH CANNOT BE CONTROLLED END TO END. A level
   * adds an option and +1 on every roll — both pure gain — so under any sound
   * policy level N+1 is at least level N; the branch only fires on POLICY ERROR.
   * It is controlled at the RULE level (`rules.test.ts`). What is controlled
   * here is the other direction: requirement 1 stays SILENT when a kit gets
   * better in a way that looks alarming.
   */
  let r: KitReport;
  beforeAll(async () => { r = await run('trapKit'); });

  it('produces a whole report', () => expectWellFormed(r, 2));

  it.skipIf(SMOKE)('does not invent a regression from a card that merely looks suicidal', () => {
    expect(r.monotonicity.regressions, r.monotonicity.detail).toEqual([]);
  });
});
