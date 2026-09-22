/**
 * END-TO-END CONTROL — the controls that need no large sample.
 *
 * `requirements.test.ts` controls the DECISION RULES on synthetic numbers.
 * These files control the whole pipeline — build a subject, solve its cells,
 * play the fights, aggregate, judge — on subjects whose verdict follows from
 * their CONSTRUCTION (`bench/control-kits.ts`), not from any measurement.
 *
 * That gap matters. A rule can be perfect and still be fed the wrong number:
 * the wiring between "what was measured" and "what was judged" is where
 * requirement 3c lost its error bar and where `heroWithout` once silently
 * ablated nothing at all. Neither would have been caught by testing the rule.
 *
 * ONE ANALYSIS PER FILE, because vitest parallelises by file and each of these
 * runs its own `analyze()`. Budgets are shared from `control-budgets.ts`.
 */
import { describe, it, expect } from 'vitest';
import { analyze, type Subject } from '../kit-analyzer-lib.js';
import {
  blitzKit, defenceOnlyKit, ladderKit, trapKit, withControlKit,
} from '@pimpampum/bench';
import { CHEAP, NEITHER, run } from './control-budgets.js';

describe('a LADDER kit — each card strictly bigger than the last', () => {
  const r = withControlKit(ladderKit(4), run);

  it('requirement 1 finds the gain', () => {
    // 1d6 → 3d6 → 5d6 → 7d6. If a monotone ramp this steep does not register,
    // requirement 1 cannot detect a level being worth anything at all.
    expect(r.monotonicity.ok, `req 1 missed an obvious ramp: ${r.monotonicity.detail}`).toBe(true);
  });

  it('reports no regression on a kit that only improves', () => {
    expect(r.monotonicity.detail).not.toMatch(/regressions:/);
  });
});

describe('a kit whose second card costs its user dearly', () => {
  const r = withControlKit(trapKit(), run);

  /*
   * REQUIREMENT 1'S REGRESSION BRANCH CANNOT BE CONTROLLED END TO END, and the
   * reason is worth more than the control would have been.
   *
   * A level adds an OPTION and a +1 on every roll. Both are pure gain, so under
   * any reasonable policy level N+1 is at least level N: a regression is not
   * something a kit can be built to have. Two attempts here, both instructive:
   *
   *   4d6 costing 6 PV   → level 2 measured +8.7pp BETTER. Against a 41-PV
   *                        basilisk the damage outweighs the blood.
   *   8d6 costing 20 PV  → +10.4pp better still, and the AI plays it 37% of the
   *                        time. Trading a 12-PV hero for 28 damage to a boss
   *                        beats plinking 2d6 for the whole fight. It is a
   *                        kamikaze, not a trap.
   *
   * So the branch only ever fires on POLICY ERROR, and manufacturing a reliable
   * one needs a cost the depth-1 lookahead cannot see — damage arriving two or
   * more rounds later. That retro-explains the project's own history: every
   * level regression this harness ever found (§5.1, §15.4) was closed by fixing
   * the ROLL RULES or the AI, never by changing a card.
   *
   * The regression branch is controlled at the RULE level in
   * requirements.test.ts. What is controlled here is the other direction, which
   * matters just as much: that requirement 1 stays SILENT when a kit improves
   * in a way that looks alarming.
   */
  it('does not invent a regression from a card that merely looks suicidal', () => {
    expect(
      r.monotonicity.detail,
      `req 1 reported a regression on a kit that got better: ${r.monotonicity.detail}`,
    ).not.toMatch(/regressions:/);
  });
});

describe('requirement 2 — a fight that CANNOT end', () => {
  /*
   * Four seats of nothing-but-defence, with a 10d6 wall. The party can never
   * kill (no attack card, and Cop desesperat is lastResort so it never becomes
   * legal while a defence is), and nothing penetrates the wall. Both sides
   * survive to the 40-round cap every time.
   *
   * This needs `allSeats`, and that is the point: requirement 2 is a property
   * of the whole FIGHT, so a control kit in one seat of four cannot move it —
   * the other three would go on killing things. Same limit that blocks the
   * requirement 3 / 3b controls (§19.6); this is the seam that lifts it.
   */
  const r = withControlKit(defenceOnlyKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, 60, { ...CHEAP, allSeats: true, skip: [...NEITHER] }));

  it('fails requirement 2', () => {
    expect(r.duration.ok, `req 2 passed a fight nobody can win: ${r.duration.detail}`).toBe(false);
  });

  it('fails for the RIGHT reason — the draw rate is among the named reasons', () => {
    // "Drags" and "never ends" are different problems with different fixes.
    // Before `durationVerdict` named them separately, every reader of a ❌ went
    // to look at the median, which was fine.
    //
    // READ THE REASONS, NOT THE WHOLE DETAIL. `duration.detail` always opens
    // with `mediana N · p90 N · taules N%`, so matching /taules/ against the
    // whole string asserted nothing whatsoever — it was true on every kit that
    // has ever been measured, passing or failing, and this control was green
    // for that reason rather than for the draw rate. Same shape as the
    // duration guard in balance.test.ts that could not fail (§12).
    //
    // Only the section after `falla per:` names what actually tripped.
    const reasons = r.duration.detail.split('falla per:')[1] ?? '';
    expect(reasons, `req 2 named no reason at all: ${r.duration.detail}`).not.toBe('');
    expect(reasons, `req 2 blamed the wrong thing: ${r.duration.detail}`).toMatch(/taules ≥/);
    // NOT asserted: that the length bars stayed silent. A fight that runs to
    // the 40-round cap every time is also, truthfully, the longest fight the
    // harness can measure, so the median and p90 bars fire too. The draw rate
    // is the reason that DISTINGUISHES "never ends" from "drags", which is all
    // this control needs to show.
  });
});

describe('requirement 2 — a fight that ends on round one', () => {
  // The other direction, and the one that catches a bar set so tight nothing
  // could ever pass it: 20d6 at every enemy, fastest on the field.
  const r = withControlKit(blitzKit(), run);

  it('passes requirement 2', () => {
    expect(r.duration.ok, `req 2 failed an instant win: ${r.duration.detail}`).toBe(true);
  });
});
