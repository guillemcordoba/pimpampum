/**
 * END-TO-END CONTROL — requirements 3 and 3b, measured on the whole side.
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
import { analyze, MINDLESS_MARGIN, type Subject } from '../kit-analyzer-lib.js';
import {
  flatKit, withControlKit,
} from '@pimpampum/bench';
import { CHEAP, GAMES, NEITHER } from './control-budgets.js';

describe('the SAME flat kit in every seat — now thinking cannot matter to the SIDE', () => {
  /*
   * THE CONTROL REQUIREMENTS 3 AND 3b HAVE NEVER HAD, and the reason they never
   * had one expired one commit before this was written.
   *
   * Both requirements impoverish the WHOLE SUBJECT SIDE — all four seats — so a
   * control kit sitting in one of four cannot zero their margin: the other
   * three are calibration heroes with real kits, and thinking still matters
   * enormously for them. §19.6 measured +13.5pp on a kit with exactly one
   * distinct card and concluded that controlling 3 and 3b end to end "needs a
   * party of four control kits, which the analyzer cannot field today".
   *
   * `allSeats` IS that party. It was built for requirement 2's turtle (§19.11)
   * and the note that 3 and 3b need it too was written in the same commit and
   * then not acted on.
   *
   * With four identical-card kits on the field, every policy arm plays the same
   * card every round — `atzar`, `sempre el atac més gran` and the real policy
   * are the same sequence of cards — so the margin is ZERO BY CONSTRUCTION and
   * both requirements must FIRE. A ❌ here is the instrument telling the truth:
   * a kit with no decisions in it cannot demonstrate that decisions matter.
   *
   * Sized so the verdicts are resolvable rather than merely noisy: requirement
   * 3's bar is 20pp and 3b's is 10pp, and 400 combats an arm puts 2σ at ~7pp,
   * which is inside both. (`CHEAP`'s 60 would leave 2σ ≈ 18pp, wider than 3b's
   * whole bar — the verdict would then be a report on the sample size.)
   */
  const r = withControlKit(flatKit(4), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, {
      ...CHEAP, mindlessGames: 400, allSeats: true, skip: [...NEITHER],
    }));

  /** The `→ marge ±X.Xpp` every margin verdict prints. */
  const marginOf = (detail: string): number => {
    const m = detail.match(/marge ([+-][0-9.]+)pp/);
    if (!m) throw new Error(`no margin to read in: ${detail}`);
    return Number(m[1]);
  };

  it('requirement 3 finds no margin, because there is none to find', () => {
    expect(r.spam.ok, `req 3 claimed thinking mattered to a side with one card: ${r.spam.detail}`)
      .toBe(false);
  });

  it('requirement 3b finds no margin either', () => {
    expect(
      r.strategySpace.ok,
      `req 3b claimed the strategy space mattered to a side with one card: ${r.strategySpace.detail}`,
    ).toBe(false);
  });

  it('fires for the RIGHT reason — the margin really is about zero', () => {
    // The must-FIRE assertions above are satisfied by any margin CLEARLY under
    // the bar, which a merely-bad kit would also satisfy. The construction
    // promises something much stronger: identical cards in every seat means the
    // arms play the same game, so the margin should sit on zero rather than
    // somewhere respectable below 20pp. Assert that, or this control cannot
    // tell "no decisions exist" from "the decisions are poor".
    const m = marginOf(r.spam.detail);
    expect(Math.abs(m), `req 3's margin is not near zero: ${r.spam.detail}`)
      .toBeLessThan(MINDLESS_MARGIN * 100);
  });
});
