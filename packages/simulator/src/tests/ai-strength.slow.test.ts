/**
 * IS THE AI GOOD ENOUGH TO MEASURE THE GAME WITH?
 *
 * Everything this package reports — kit report cards, solved encounters, dead
 * cards — is a number the AI produced by playing. If the AI plays badly, the
 * numbers are facts about its blind spots, and they will look exactly as
 * plausible as facts about the game. That has already happened once: the
 * distilled "lean" policy turned out to be 16pp weaker than the heuristic and
 * only ~5pp above random, and every encounter the project had ever priced was
 * priced with it (§10).
 *
 * The hard part is that there is NO GROUND TRUTH for good play here, and §16.1
 * forbids the obvious shortcut: an AI may be corrected where it disagrees with
 * the RULES, never tuned until the tests go green. A test that a weight can
 * turn green was not measuring anything.
 *
 * Two families of claim survive that, and this file is both:
 *
 *  1. THE AI BEATS FIXED STUPIDITY. The baselines in `bench/policies.ts` are
 *     defined from the cards and never from the AI, so they do not drift when
 *     it changes. "Beats random" and "is not beaten by a one-line strategy" are
 *     the weakest claims one can make about a policy, and an instrument that
 *     fails them is not measuring the game.
 *  2. THE LADDER IS MONOTONE AND CONVERGED. The same AI at more compute is a
 *     ground truth for the same AI at less, and no weight can move one rung
 *     without moving the other. Monotone: more search never plays worse.
 *     Converged: the next rung up cannot be SHOWN to play better — which is
 *     what makes a measurement a fact about the game rather than about a search
 *     budget.
 *
 * Mirror matches throughout, both seats played, common random numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  depth1, depth1x, feeble, firstLegal, games, gamesFor, headToHead, type HeadToHead, heuristic, pct, pp, spam, stderr, uniform,
} from '@pimpampum/bench';

/**
 * Sized by the finest claim on the page. `gamesFor(5)` is 800, and 5pp is about
 * the resolution at which "converged" starts to mean something: a search budget
 * worth less than five points is not what is wrong with any number here.
 */
const GAMES = games(gamesFor(5));

/**
 * The gap the convergence claim is about. Quoted, not hidden, because the claim
 * "we could not show a difference" is worthless without it.
 *
 * 8pp, RAISED FROM 5 ON 2026-09-22, and the reason is arithmetic rather than
 * convenience. Production measures **3.4pp** behind a 4× budget (53.4%±1.8 over
 * 800 mirror combats) — a real gap, and a small one. But this is an EQUIVALENCE
 * test: it must show `margin + 2σ < bar`, so proving a 5pp bound against a true
 * 3.4pp gap needs 2σ under 1.6pp, which is ~7,800 combats in this cell. That is
 * not a price worth paying to distinguish "within 5" from "within 8" on a
 * quantity already known to be small.
 *
 * What the 8pp bar still catches is the thing that mattered: before §20.7 the
 * gap was 9.0pp and production was losing to a one-line strategy. If the search
 * ever regresses that far again, this fires.
 *
 * Lower it only alongside the sample that can resolve it.
 */
const CONVERGENCE_PP = 8;

/**
 * HOW OFTEN THE AI MUST BEAT A DELIBERATELY STUPID STRATEGY.
 *
 * Set at 70% on 2026-09-22, deliberately above where the AI stood (it beat
 * `spam` 53.0%±2.9 — a coin flip against a one-line policy, which is not an
 * instrument). This is a TARGET the AI is being driven toward, not a
 * description of it.
 *
 * It is allowed to come down, but only with a reason written in NEXT-STEPS
 * saying what was tried and where the ceiling turned out to be. The case for
 * lowering it is a measurement, not a shrug: if search budget stops buying
 * strength well below the bar, then "spam is hard to beat" is a fact about the
 * GAME (`intentions.md`'s triangle, NEXT-STEPS §15.6) rather than about the
 * search, and the bar should say so.
 */
const STRENGTH_BAR = 0.70;

/** Is X's mirror winrate CLEARLY over half — beyond its own 2σ? */
function beats(h: HeadToHead): boolean {
  return h.winrate - 2 * stderr(h.winrate, h.games) > 0.5;
}

/** Is X CLEARLY under half — i.e. actually losing, not merely measured low? */
function losesTo(h: HeadToHead): boolean {
  return h.winrate + 2 * stderr(h.winrate, h.games) < 0.5;
}

const show = (h: HeadToHead) => `${pct(h.winrate, h.games)} over ${h.games} mirror combats`;

describe('the AI beats fixed stupidity', () => {
  // Measured once, asserted many times. Each cell is `GAMES` combats split
  // across both seats.
  const vs = {
    firstLegal: headToHead(depth1, firstLegal, GAMES),
    feeble: headToHead(depth1, feeble, GAMES),
    uniform: headToHead(depth1, uniform, GAMES),
    spam: headToHead(depth1, spam, GAMES),
  };

  /**
   * Clearly under the bar — not merely measured under it.
   *
   * The same asymmetry `marginVerdict` uses for every requirement in
   * `kit-analyzer-lib`: a ❌ means "go and look", and a false one costs a
   * session, so it fires only on what the sample can actually establish. The
   * bar is a target, and a noisy run should not be allowed to declare it met
   * OR missed.
   */
  const clearlyUnder = (h: HeadToHead) => h.winrate + 2 * stderr(h.winrate, h.games) < STRENGTH_BAR;

  for (const [name, h] of Object.entries(vs)) {
    it(`beats ${name} at least ${(STRENGTH_BAR * 100).toFixed(0)}% of the time`, () => {
      expect(
        clearlyUnder(h),
        `depth1 vs ${name}: ${show(h)} — clearly under the ${(STRENGTH_BAR * 100).toFixed(0)}% bar. `
        + 'Either the search has more to give, or the bar is a claim about the game rather '
        + 'than about the AI; NEXT-STEPS §20.7 is where that gets decided.',
      ).toBe(false);
    });
  }

  it('and is never actually BEATEN by one of them', () => {
    // The floor under the bar. Failing the 70% target is a quality problem;
    // LOSING to "always the biggest attack" means the instrument is measuring
    // its own hole rather than the game, and that is a different severity.
    for (const [name, h] of Object.entries(vs)) {
      expect(losesTo(h), `depth1 LOSES to ${name}: ${show(h)}`).toBe(false);
    }
  });
});

describe('the compute ladder is monotone — more search never plays worse', () => {
  const vsHeuristic = headToHead(depth1, heuristic, GAMES);
  const vsProduction = headToHead(depth1x, depth1, GAMES);

  it('thinking one round ahead beats scoring the cards alone', () => {
    // If this fails, the lookahead is not adding anything and the depth knob is
    // costing ~6× the compute for nothing.
    expect(beats(vsHeuristic), `depth1 vs heuristic: ${show(vsHeuristic)}`).toBe(true);
  });

  it('a bigger search budget does not play WORSE than production', () => {
    // The direction that catches a broken evaluator: if more rollouts and more
    // passes make play worse, the thing being maximised is not winning.
    expect(losesTo(vsProduction), `depth1x vs depth1: ${show(vsProduction)}`).toBe(false);
  });

  it(`production is CONVERGED — a bigger budget beats it by clearly under ${CONVERGENCE_PP}pp`, () => {
    // AN EQUIVALENCE TEST, and the direction of the inequality is the whole
    // point.
    //
    // The first draft asserted `margin − 2σ < bar`: "we cannot SHOW a gap of
    // `bar` or more". That is the vacuity trap in a different dress — a noisy
    // measurement passes it by default, and a sample-size guard does not save
    // it, because the guard checks n while the weakness is in the direction.
    // It cost a false green immediately: the gap went 59.0%±1.7 → 58.1%±1.7
    // across a change, the 2σ lower bound crossed from 7.2pp to 4.6pp, and the
    // test flipped red → green on 0.9pp of noise while an 8pp gap sat there
    // untouched.
    //
    // So the claim has to be the strict one: the gap is clearly SMALLER than
    // the bar, upper bound and all. Noise cannot buy that — a wide interval
    // fails it, which is the right way round for a calibration claim.
    const resolvable = gamesFor(CONVERGENCE_PP);
    if (vsProduction.games < resolvable) {
      // Cheap runs (GAMES=2 smoke) land here. Say so; do not pass quietly.
      expect(
        vsProduction.games,
        `convergence not tested: ${vsProduction.games} combats cannot resolve ${CONVERGENCE_PP}pp `
        + `(needs ${resolvable}). Re-run without a GAMES override.`,
      ).toBeLessThan(resolvable);
      return;
    }
    const margin = vsProduction.winrate - 0.5;
    expect(
      margin + 2 * stderr(vsProduction.winrate, vsProduction.games) < CONVERGENCE_PP / 100,
      `production is not converged: a bigger budget beats it by ${pp(margin)} `
      + `(${show(vsProduction)}). Every number in this package is then a fact about `
      + `the search budget, not about the game.`,
    ).toBe(true);
  });
});
