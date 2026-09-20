/**
 * CONTROL EXPERIMENTS FOR EVERY REQUIREMENT'S DECISION RULE.
 *
 * A verdict rule that is only ever exercised by real data is a rule nobody has
 * checked. Real data never tells you whether a ❌ fired because the kit is
 * broken or because the rule is — the numbers look equally plausible either
 * way, which is how requirement 3c spent a session reporting which seed it had
 * been given (NEXT-STEPS §19.1) and how `DEAD_VALUE` spent one flagging cards
 * against a floor nobody had measured (§17.5).
 *
 * So each rule is fed inputs whose answer is known WITHOUT measuring anything:
 *
 *   - a case that must PASS,
 *   - a case that must FAIL,
 *   - the NULL: no effect at all, where the rule must stay silent,
 *   - the UNDER-POWERED case, where the rule must not pretend to know.
 *
 * The null and the under-powered case are the ones that matter. Every mistake
 * this harness has made was a rule confidently answering a question its sample
 * could not resolve.
 */
import { describe, it, expect } from 'vitest';
import {
  marginVerdict, classifyStep, durationVerdict,
  MINDLESS_MARGIN, STRATEGY_SPACE_MARGIN, ONE_TRICK_MARGIN, REGRESSION_PP,
} from '../kit-analyzer-lib.js';
import { gamesFor } from '../bench/report.js';

/** A sample big enough that a 1pp effect is resolvable — so these tests are
 *  about the RULE, not about noise. */
const BIG = 100_000;

describe('requirement 3 / 3b / 3c — the margin rule', () => {
  it('passes a margin clearly above the bar', () => {
    // 60% vs 20% is a 40pp margin against a 20pp bar, with n large.
    const v = marginVerdict(0.6, BIG, 0.2, BIG, MINDLESS_MARGIN);
    expect(v.ok).toBe(true);
    expect(v.borderline).toBe(false);
    expect(v.armWins).toBe(false);
  });

  it('fails a margin clearly below the bar', () => {
    // 5pp against a 20pp bar, resolved to well under a point.
    const v = marginVerdict(0.55, BIG, 0.50, BIG, MINDLESS_MARGIN);
    expect(v.ok).toBe(false);
    expect(v.armWins).toBe(false);
  });

  it('THE NULL: two identical arms do not clear a positive bar', () => {
    // The rule must not manufacture a margin out of nothing. This is the case
    // a bare `margin >= bar` also gets right — it is the next one it does not.
    const v = marginVerdict(0.5, BIG, 0.5, BIG, MINDLESS_MARGIN);
    expect(v.ok).toBe(false);
    expect(v.margin).toBe(0);
    expect(v.armWins).toBe(false);
  });

  it('does NOT fail a margin that misses only inside its own noise', () => {
    // 4pp measured against a 5pp bar on a SMALL sample: the interval reaches
    // the bar, so the honest verdict is "not shown", not "broken". A ❌ here
    // means go look, and a false one costs a session. This is exactly what 3c
    // got wrong: `trickMargin >= ONE_TRICK_MARGIN` with no error term.
    const v = marginVerdict(0.54, 300, 0.50, 300, ONE_TRICK_MARGIN);
    expect(v.ok).toBe(true);
    expect(v.borderline).toBe(true);
  });

  it('reports when the arm BEATS the policy, which is not a content finding', () => {
    // An impoverished side outplaying the real one says something about the
    // POLICY. Reporting it as a kit failure sends the reader to the wrong file.
    const v = marginVerdict(0.45, BIG, 0.55, BIG, ONE_TRICK_MARGIN);
    expect(v.armWins).toBe(true);
    expect(v.ok).toBe(false);
  });

  it('knows when its own sample cannot resolve its own bar', () => {
    // The §19.1 bug, as a rule-level check: 300 combats against a 5pp bar.
    expect(marginVerdict(0.5, 300, 0.5, 300, ONE_TRICK_MARGIN).resolvable).toBe(false);
    expect(marginVerdict(0.5, gamesFor(ONE_TRICK_MARGIN * 100), 0.5, gamesFor(ONE_TRICK_MARGIN * 100), ONE_TRICK_MARGIN).resolvable).toBe(true);
    // ...and that a 20pp bar IS resolvable at the same sample, which is why the
    // three requirements cannot share one budget.
    expect(marginVerdict(0.5, 300, 0.5, 300, MINDLESS_MARGIN).resolvable).toBe(true);
  });

  it('is monotone in the bar: one rule, three thresholds', () => {
    // 3, 3b and 3c differ ONLY in their bar. If a margin clears the strictest,
    // it clears the others — and the day that stops being true, the rules have
    // drifted apart again.
    const near = (bar: number): boolean => marginVerdict(0.62, BIG, 0.40, BIG, bar).ok;
    expect(near(MINDLESS_MARGIN)).toBe(true);
    expect(near(STRATEGY_SPACE_MARGIN)).toBe(true);
    expect(near(ONE_TRICK_MARGIN)).toBe(true);
    expect(MINDLESS_MARGIN).toBeGreaterThan(STRATEGY_SPACE_MARGIN);
    expect(STRATEGY_SPACE_MARGIN).toBeGreaterThan(ONE_TRICK_MARGIN);
  });
});

describe('requirement 1 — the level-step rule', () => {
  const TIGHT = 0.005;   // 0.5pp of error: a 3pp step is far outside it

  it('calls a clear gain a gain', () => {
    expect(classifyStep(+0.10, TIGHT, REGRESSION_PP)).toBe('gain');
  });

  it('calls a clear drop a regression', () => {
    expect(classifyStep(-0.10, TIGHT, REGRESSION_PP)).toBe('regression');
  });

  it('THE NULL: a step of exactly zero is FLAT, never a regression', () => {
    // A level that buys nothing is a finding worth printing, and it is not the
    // same finding as a level that makes the kit worse.
    expect(classifyStep(0, TIGHT, REGRESSION_PP)).toBe('flat');
  });

  it('does NOT call a drop inside the noise a regression', () => {
    // At the old default a genuinely flat level read as a regression about one
    // time in four, and over four steps most kits printed a false ❌. A drop
    // bigger than the bar but smaller than its own error bar is 'noisy'.
    const WIDE = 0.05;
    expect(classifyStep(-0.04, WIDE, REGRESSION_PP)).toBe('noisy');
  });

  it('needs the drop to beat BOTH the bar and the noise', () => {
    // Big error bar, big drop: still not a regression until the drop clears the
    // bar by more than 2σ.
    expect(classifyStep(-0.09, 0.05, REGRESSION_PP)).toBe('noisy');
    expect(classifyStep(-0.11, 0.05, REGRESSION_PP)).toBe('regression');
  });
});

describe('requirement 2 — the duration rule', () => {
  const OK = { median: 3, p90: 6, draws: 0.01 };
  const BARS = [5, 8, 0.02] as const;
  const check = (m: number, p: number, d: number) => durationVerdict(m, p, d, ...BARS);

  it('passes a fight that ends promptly', () => {
    const v = check(OK.median, OK.p90, OK.draws);
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('names WHICH of the three failed, not just that something did', () => {
    // These are three different problems with three different fixes. Collapsing
    // them into one boolean sent every reader of a ❌ to the wrong number:
    // measured 2026-09-20, all six kits failed on the DRAW RATE while median
    // (3) and p90 (6) sat comfortably inside their bars.
    const draws = check(3, 6, 0.04);
    expect(draws.ok).toBe(false);
    expect(draws.reasons).toHaveLength(1);
    expect(draws.reasons[0]).toMatch(/taules/);

    const slow = check(9, 6, 0.01);
    expect(slow.reasons).toHaveLength(1);
    expect(slow.reasons[0]).toMatch(/mediana/);

    const tail = check(3, 20, 0.01);
    expect(tail.reasons).toHaveLength(1);
    expect(tail.reasons[0]).toMatch(/p90/);
  });

  it('reports every failing condition at once', () => {
    expect(check(9, 20, 0.5).reasons).toHaveLength(3);
  });

  it('THE NULL: a fight at exactly the bars passes', () => {
    // The bars are inclusive for length and exclusive for draws — a stalemate
    // rate AT the bar is already too many fights that never end.
    expect(check(5, 8, 0.019).ok).toBe(true);
    expect(check(5, 8, 0.02).ok).toBe(false);
  });
});
