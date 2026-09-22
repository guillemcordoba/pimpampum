/**
 * END-TO-END CONTROL — requirement 1 and 3c on a kit of identical cards.
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
  flatKit, withControlKit,
} from '@pimpampum/bench';
import { FOR_3C, GAMES } from './control-budgets.js';

describe('a kit of IDENTICAL cards — one card repeated is not a strategy', () => {
  const r = withControlKit(flatKit(4), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, FOR_3C));

  it('requirement 1 reports the gain a level really does buy — and that is a LIMIT of requirement 1', () => {
    /*
     * THIS ASSERTION USED TO RUN THE OTHER WAY, and the flip is the finding.
     *
     * It asserted requirement 1 must find NO gain here: every card is the same
     * card, so a level adds an option identical to one already held. That
     * reasoning quietly forgot the other half of what a level is. `resolution.ts`
     * is explicit — a roll is the card's dice PLUS your level in its skill — so
     * four identical cards at level 4 hit substantially harder than at level 1
     * whatever the hand looks like.
     *
     * The old assertion passed only because the AI was too weak to convert the
     * bonus into wins. Once it could (2026-09-22, §20.7), the kit measured
     * +13.8pp±6.2 and the "control" failed — for the best possible reason.
     *
     * The honest statement is therefore a LIMITATION, asserted so it cannot be
     * forgotten: requirement 1 cannot separate "the cards get better" from
     * "every roll gets +1", and a kit of four identical cards passes it. A kit
     * that reads ✅ on requirement 1 has not thereby shown its levels buy any
     * VARIETY.
     */
    expect(
      r.monotonicity.ok,
      `req 1 missed the roll-bonus gain a level always buys: ${r.monotonicity.detail}`,
    ).toBe(true);
  });

  // The 3 / 3b controls live in their own block below, because they need the
  // kit in ALL FOUR SEATS. What this ONE-SEAT measurement is for now is the
  // other half of that control — see 'the same kit in one seat of four'.

  it('requirement 3c does not claim the kit beats its own one-trick', () => {
    // Repeating one card IS playing the kit, exactly.
    expect(r.oneTrick.ok, `req 3c claimed a margin: ${r.oneTrick.detail}`).toBe(false);
  });
});
