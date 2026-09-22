/**
 * BUDGETS FOR THE PIPELINE CONTROLS, shared by every `controls-*` file.
 *
 * These were one file until 2026-09-22. They are several now for one reason:
 * each control runs its own independent `analyze()`, vitest parallelises by
 * FILE, and nine analyses in one file therefore ran on one core while the rest
 * of the machine idled. Split, the wall time is the slowest single control
 * rather than the sum of all nine.
 *
 * Splitting only works because the budgets live here. A control that quietly
 * used a different sample than its neighbours would be a different experiment
 * wearing the same name.
 */
/**
 * (Doc moved to the controls-*.slow.test.ts files.)
 * ORIGINAL HEADER — END-TO-END CONTROLS FOR THE REQUIREMENTS THEMSELVES.
 *
 * `requirements.test.ts` controls the DECISION RULES on synthetic numbers.
 * This controls the whole pipeline — build a subject, solve its cells, play the
 * fights, aggregate, judge — on subjects whose verdict follows from their
 * CONSTRUCTION (`bench/control-kits.ts`), not from any measurement.
 *
 * That gap matters. A rule can be perfect and still be fed the wrong number:
 * the wiring between "what was measured" and "what was judged" is where
 * requirement 3c lost its error bar and where `heroWithout` once silently
 * ablated nothing at all. Neither would have been caught by testing the rule.
 *
 * These are slower than a unit test and far cheaper than a sweep, because the
 * effects being asserted are enormous by construction: a kit of identical cards
 * has a margin of exactly zero, so distinguishing it from a 20pp bar takes very
 * few combats.
 */
import { analyze, MINDLESS_MARGIN, type Subject } from '../kit-analyzer-lib.js';
import {
  blitzKit, deadCardKit, defenceOnlyKit, flatKit, ladderKit, losingOnlyKit,
  situationalKit, trapKit, withControlKit,
} from '@pimpampum/bench';

/** Small, because every effect asserted here is huge by construction. */
/**
 * EVERY BLOCK PAYS ONLY FOR THE REQUIREMENT IT ASSERTS.
 *
 * `analyze` measures all seven requirements whatever you are checking, so a
 * single shared budget makes every control pay 3c's bill — and 3c's bar is
 * 5pp, which `gamesFor` prices at 800 combats an arm (§19.1). Handing that to
 * the requirement-1 and requirement-2 controls took the file past half an hour
 * and it was killed. A control suite nobody can afford to run is a control
 * suite nobody runs.
 *
 * So: a floor cheap enough to be irrelevant, and each block raises the one
 * number its own assertion depends on.
 */
export const CHEAP = { mindlessGames: 60, oneTrickGames: 60, cardValueGames: 40 };
/**
 * AND EVERY BLOCK SKIPS WHAT IT DOES NOT ASSERT.
 *
 * Per-block budgets fixed the SAMPLE SIZES, but `analyze` still MEASURED all
 * seven requirements for every control, and two of them are most of the bill:
 * 4/5 plays a fight per candidate card per decision, 3c re-measures two arms at
 * a four-times-finer bar. A block asserting one verdict was paying for seven,
 * and this file reached forty minutes on its own. `skip` makes the saving
 * structural rather than a matter of turning samples down.
 */
export const NO_CARDS = ['cardValue'] as const;
export const NO_TRICK = ['oneTrick'] as const;
export const NEITHER = ['cardValue', 'oneTrick'] as const;
/** 3c's bar needs its own sample or the control fails for §19.1's reason
 *  rather than for the reason it is testing. */
export const FOR_3C = { ...CHEAP, oneTrickGames: 800, skip: [...NO_CARDS] };
/** 4/5 is per-DECISION, so it needs fights, not verify passes. */
export const FOR_CARDS = { ...CHEAP, cardValueGames: 240, skip: [...NO_TRICK] };
export const GAMES = 120;

export const run = (def: { id: string }) => analyze({ mode: 'player', id: def.id } as Subject, GAMES, { ...CHEAP, skip: [...NEITHER] });

