/**
 * END-TO-END CONTROLS FOR THE REQUIREMENTS THEMSELVES.
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
import { describe, it, expect } from 'vitest';
import { analyze, type Subject } from '../kit-analyzer-lib.js';
import { deadCardKit, flatKit, ladderKit, withControlKit } from '../bench/control-kits.js';

/** Small, because every effect asserted here is huge by construction. */
/**
 * Small, because every effect asserted here is huge by construction — EXCEPT
 * 3c, whose 5pp bar needs `gamesFor(5)` = 800 combats an arm however large the
 * true effect is. Handing it less would make this control fail for the reason
 * §19.1 documents rather than for the reason it is testing.
 */
const BUDGET = { mindlessGames: 200, oneTrickGames: 800, cardValueGames: 240 };
const GAMES = 120;

const run = (def: { id: string }) => analyze({ mode: 'player', id: def.id } as Subject, GAMES, BUDGET);

describe('a kit of IDENTICAL cards — levels and thinking cannot matter', () => {
  const r = withControlKit(flatKit(4), run);

  it('requirement 1 does not report a gain the kit cannot have', () => {
    // Every card is the same card. A level adds an option identical to the one
    // already held, so the only thing a level buys is the +1 roll bonus that
    // comes with it — and requirement 1 asks for more than that.
    expect(r.monotonicity.ok, `req 1 claimed a gain: ${r.monotonicity.detail}`).toBe(false);
  });

  // NO END-TO-END CONTROL FOR 3 AND 3b HERE, and the reason is a finding.
  //
  // Both impoverish the WHOLE SUBJECT SIDE — all four seats — while a control
  // kit occupies one. The other three are calibration heroes with real kits,
  // so thinking still matters enormously for them and the margin stays large
  // however flat the subject is: measured +13.5pp on a kit with exactly one
  // distinct card, against a 20pp bar.
  //
  // That is not a bug. `cells.ts` documents the side-wide scope and it is the
  // only fair form of "does thinking matter". But it does mean 3 and 3b are
  // largely measuring the FIXED COMPANY, identical for every subject, which is
  // why their verdicts cluster across kits. Controlling them end-to-end needs a
  // party of four control kits, which the analyzer cannot field today. The
  // decision RULE they share is controlled in requirements.test.ts; the gap is
  // recorded in NEXT-STEPS §19.6.
  it('3 and 3b measure the SIDE, so a flat subject does not zero their margin', () => {
    expect(r.spam.detail).toMatch(/COSTAT SENCER/);
  });

  it('requirement 3c does not claim the kit beats its own one-trick', () => {
    // Repeating one card IS playing the kit, exactly.
    expect(r.oneTrick.ok, `req 3c claimed a margin: ${r.oneTrick.detail}`).toBe(false);
  });
});

describe('a kit with a card that does NOTHING', () => {
  const r = withControlKit(deadCardKit(), run);
  const named = (name: string): boolean => r.cardUse.detail.includes(name);

  it('requirement 4/5 fails the kit', () => {
    expect(r.cardUse.ok, `req 4/5 passed a kit holding a no-op: ${r.cardUse.detail}`).toBe(false);
  });

  it('names the no-op as dead', () => {
    expect(named('NoOp'), `req 4/5 did not name the no-op: ${r.cardUse.detail}`).toBe(true);
  });

  it('does NOT name the real attacks as dead', () => {
    // The other half of a control, and the half that is usually skipped: a rule
    // that flags everything is as useless as one that flags nothing.
    const dead = r.cardUse.detail.slice(0, r.cardUse.detail.indexOf('·') + 1);
    expect(dead.includes('Real'), `req 4/5 called a working attack dead: ${r.cardUse.detail}`).toBe(false);
  });

  it('values the no-op below the real cards', () => {
    const byId = new Map(r.cardValues.map(v => [v.id, v.value]));
    const noop = [...byId.entries()].find(([id]) => id.endsWith('c3'))?.[1];
    const real = [...byId.entries()].filter(([id]) => !id.endsWith('c3')).map(([, v]) => v);
    expect(noop, 'the no-op was never priced').toBeDefined();
    expect(noop!, `no-op ${noop} vs real ${real.join(', ')}`).toBeLessThan(Math.min(...real));
  });
});

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
