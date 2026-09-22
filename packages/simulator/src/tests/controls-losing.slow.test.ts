/**
 * END-TO-END CONTROL — requirement 7, the win-correlation flag.
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
  losingOnlyKit, withControlKit,
} from '@pimpampum/bench';
import { CHEAP, NEITHER } from './control-budgets.js';

describe('requirement 7 — a card only legal once its holder is nearly dead', () => {
  /*
   * Requirement 7 is CONFOUNDED by design — a card played only in trouble
   * correlates with losing however good it is — and that confound is exactly
   * what makes it controllable. `Desperate` is a perfectly good 3d6 attack
   * gated on the holder being down to a third of their PV, so it can only ever
   * be played from a losing position.
   *
   * A ❌ here is the harness working. §7.1 calls this a flag to investigate,
   * never a verdict, and this control is why that wording has to stay.
   */
  // More fights than the other controls: the gated card is only legal from a
  // losing position, so it appears in roughly a fifth of them, and requirement
  // 7 will not judge a card on fewer than 60 PLAYS. (That gate used to scale
  // with the sample — see MIN_PLAYS_JUDGED — which made a rare card
  // unjudgeable at ANY sample size.)
  // 800, not 400: the gate tightened to a FIFTH of PV (see `control-kits.ts`)
  // once a stronger AI stopped losing the fights a third-of-PV hero was in, so
  // the card is legal in fewer positions and needs more fights to clear
  // requirement 7's absolute 60-play floor.
  const r = withControlKit(losingOnlyKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, 800, { ...CHEAP, skip: [...NEITHER] }));

  it('flags the card that only ever appears when losing', () => {
    expect(
      r.correlation.ok,
      `req 7 missed a card that is only legal when losing: ${r.correlation.detail}`,
    ).toBe(false);
    expect(r.correlation.detail).toMatch(/Desperate/);
  });

  it('does NOT flag the ungated card beside it', () => {
    // The other half, and the half usually skipped: a flag that fires on
    // everything is as useless as one that never fires.
    expect(
      r.correlation.detail.includes('Normal'),
      `req 7 flagged the healthy card too: ${r.correlation.detail}`,
    ).toBe(false);
  });
});
