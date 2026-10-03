/**
 * HOW THE ANALYZER IS BUILT, asserted on its source — the shapes a verdict must
 * have that no control kit can see from outside (what statistic a rule reads,
 * what the null is, whether errors are clustered). Every one of these was once
 * wrong, silently, with plausible numbers.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gamesFor } from '@pimpampum/bench';
import {
  MINDLESS_GAMES, MINDLESS_MARGIN, ONE_TRICK_GAMES, ONE_TRICK_MARGIN, STRATEGY_SPACE_MARGIN,
} from '../src/index.js';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * WHAT A CARD IS WORTH IS NOT WHAT THE AI THINKS OF IT.
 *
 * Requirement 4/5 spent three sessions as a PLAY RATE — "how often did the AI
 * choose this card out of the turns it was legal" — and in that form it made a
 * hand-written evaluator the judge of the content the evaluator exists to
 * serve. The same eleven cards read DEAD, then ALIVE, then dead again while not
 * one die changed; what moved was a weight in `ai.ts`.
 *
 * It then spent a session as a LEAVE-ONE-OUT ABLATION, honest but underpowered
 * by construction (NEXT-STEPS §17.5): a whole kit in one seat is worth ~11pp
 * against a ~3pp noise floor, so an evenly balanced 5-card kit has every card
 * under the floor. That machinery is deleted; §17.5 and §17.6 keep the finding.
 *
 * It is now measured AT THE DECISION (§18): force each legal card from a
 * position both branches share exactly, play the fight out, subtract. These
 * guards exist because the play-rate version is the easy thing to write, and
 * because the verdict has a shape that is easy to get subtly wrong.
 */
describe('a card is judged by what it does, not by the AI picking it', () => {
  const lib = fs.readFileSync(path.join(PKG, 'src', 'analyze.ts'), 'utf8');
  const regret = fs.readFileSync(path.join(PKG, '..', 'bench', 'src', 'regret.ts'), 'utf8');
  const block = (): string => lib.slice(lib.indexOf('// 4/5.'), lib.indexOf('// 7.'));

  it('the 4/5 verdict is computed from per-decision counterfactuals', () => {
    expect(block().length, 'could not find the 4/5 block — did the markers move?').toBeGreaterThan(200);
    expect(
      block().includes('measureKit') && block().includes('scoreCards'),
      'requirement 4/5 no longer reads bench/regret.ts. Whatever it measures now, it is not what '
      + 'the game loses by never playing the card.',
    ).toBe(true);
  });

  it('play rate never decides the verdict', () => {
    // Counting how often the AI picked a card measures the AI. The counters may
    // be READ as an explanation; they must not be compared to a threshold.
    expect(
      /(played\s*\/\s*legal|counters\.(played|legal))[^;]*[<>]/.test(block()),
      'a play rate is being compared against a threshold inside requirement 4/5.',
    ).toBe(false);
  });

  it('fails on the ABSOLUTE statistic, never on the ranking', () => {
    // `value` is a card's score minus the mean of its alternatives, so across a
    // hand the values SUM TO ~ZERO by arithmetic: failing on it would flag half
    // of every kit however well designed. `bestShare` against the card's own
    // chance null has no such problem.
    const cond = block().match(/if \(([^)]*)\) \{? ?dead\.push/);
    expect(cond, 'no dead.push(...) guarded by a condition in the 4/5 block').not.toBeNull();
    // FOLLOW ONE LEVEL OF INDIRECTION.
    //
    // The guard is allowed to read `if (deadIn === seen.length)`: since the
    // robustness check (§20.11) it has to name the MODELS a card died under,
    // and the statistic lives one line up in `deadIn`'s definition. Demanding
    // the literal expression here made this fail on a refactor that preserved
    // the property exactly — a test asserting code SHAPE rather than
    // behaviour. Expanding the identifiers keeps it honest without freezing
    // the code.
    let expr = cond![1];
    for (const name of cond![1].match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const def = block().match(new RegExp(`const ${name} = ([^;]*);`));
      if (def) expr += ` ${def[1]}`;
    }
    expect(
      expr.includes('bestShare') && expr.includes('nullShare'),
      `4/5 fails on "${cond![1]}", which does not trace to the absolute statistic. The verdict `
      + 'must be "was it ever the best play, against the share chance alone would give it".',
    ).toBe(true);
    // The other half, and what the comment above is really guarding.
    expect(
      /\.value\b/.test(expr),
      `4/5 reaches the value column in "${cond![1]}". Values are a within-hand ranking summing to `
      + '~zero by arithmetic, so failing on them would flag half of every kit however good it is.',
    ).toBe(false);
  });

  it("the null is each card's own, and self-calibrating", () => {
    // k is how many cards were on offer AT THAT POSITION, and it moves as cards
    // gate on targets, statuses and resources. A flat kit-wide 1/k averages a
    // quantity that is never the same twice — and it is also WRONG whenever
    // more than one card can reach the top: ties are credited in full, so with
    // 1.5 cards tying on a four-card hand, 1/k understates what chance hands
    // out by half again and the line is too low to catch anything.
    expect(
      /o\.topCount \/ o\.candidates/.test(regret),
      'the chance null must be summed per observation as topCount/candidates: if m of k cards '
      + 'reach the top, a card picked at random is among them with probability m/k.',
    ).toBe(true);
  });

  it('drops positions where every card scores the same', () => {
    // Once the outcome is settled every branch plays to the same board and all
    // candidates tie, so each would collect 1/k from a position that said
    // nothing — and 1/k is exactly the chance null every card is tested
    // against. Decided positions drag every card toward the line.
    expect(
      /top === bottom/.test(regret),
      'positions where all candidates score identically must be dropped: they are not decisions, '
      + 'and they pull every best-share toward its own null.',
    ).toBe(true);
  });

  it('errors are clustered by fight, not by position', () => {
    expect(
      regret.includes('clusteredStderr') && /byFight/.test(regret),
      'positions inside one combat share its dice, its seating and its whole history. Treating '
      + 'them as independent divides the error by the root of a number far larger than the real '
      + 'one, and every card would read significant.',
    ).toBe(true);
  });

  it('the counterfactual branches share a position, not merely a seed', () => {
    expect(
      regret.includes('engine.clone()'),
      'the branches must fork from ONE position. Re-running whole fights from a shared seed is '
      + 'the ablation again: the arms diverge at the first play and are independent games by '
      + 'round 2, which is why it could not resolve 22 of 29 cards.',
    ).toBe(true);
    expect(
      /indexOf\(actor\)/.test(regret) && regret.includes('seat'),
      'the forced seat must be resolved by INDEX on each clone. Resolving a Character from the '
      + 'original engine against the clone gives -1, planActions reads that as "no selection", '
      + 'and every branch silently becomes identical — the first run priced all five cards at '
      + 'exactly 0.00 +/- 0.00.',
    ).toBe(true);
  });
});

/**
 * NO THRESHOLD FINER THAN THE SAMPLE THAT JUDGES IT.
 *
 * This mistake has now been made twice in one file, in two different
 * requirements, and neither was caught by reading the code:
 *
 *  - `DEAD_VALUE` was set at 2pp from two plausible-sounding arguments, against
 *    a noise floor nobody had measured. It was 3pp. Every "dead card" that
 *    constant produced was unsupportable (NEXT-STEPS §17.5).
 *  - Requirement 3c judged a 5pp bar on 300 combats an arm. `gamesFor(5)` is
 *    800. Re-run on five seeds with the game unchanged, its verdict flipped
 *    PASSA/FALLA/PASSA/FALLA/PASSA (§19.1).
 *
 * `gamesFor(pp)` already says what a claim costs, and requirement 1 already
 * quotes it in its own detail line. The gap was that nothing ENFORCED it. A
 * threshold below its sample's resolution does not measure the game — it
 * reports which seed was used — and that is indistinguishable from a real
 * finding until somebody re-runs it.
 */
describe('every threshold is resolvable by the sample that judges it', () => {
  const lib = fs.readFileSync(path.join(PKG, 'src', 'analyze.ts'), 'utf8');

  /** A requirement's bar, and the per-arm sample its verify run gets. */
  const CHECKS: { name: string; barPP: number; games: number }[] = [
    { name: '3 (thinking beats not thinking)', barPP: MINDLESS_MARGIN * 100, games: MINDLESS_GAMES },
    { name: '3b (the strategy space matters)', barPP: STRATEGY_SPACE_MARGIN * 100, games: MINDLESS_GAMES },
    { name: '3c (one repeated card)', barPP: ONE_TRICK_MARGIN * 100, games: ONE_TRICK_GAMES },
  ];

  for (const c of CHECKS) {
    it(`requirement ${c.name} runs enough combats for its own bar`, () => {
      const needed = gamesFor(c.barPP);
      expect(
        c.games,
        `requirement ${c.name} judges a ${c.barPP}pp bar on ${c.games} combats an arm, and `
        + `gamesFor(${c.barPP}) says it needs ${needed}. Below that the verdict is a report on `
        + 'the seed: measured on requirement 3c at 300, it flipped four times across five seeds '
        + 'with the game unchanged. Either raise the sample or widen the bar — do not leave a '
        + 'threshold finer than the instrument reading it.',
      ).toBeGreaterThanOrEqual(needed);
    });
  }

  it('requirement 1 quotes the sample its bar needs, and still does', () => {
    // Requirement 1 is the one check that already printed its own power
    // requirement. Keep it printing: it is the reason the gap was noticed.
    expect(
      lib.includes('gamesFor(REGRESSION_PP * 100)'),
      "requirement 1's detail line must keep quoting gamesFor(REGRESSION_PP), so a reader can see "
      + 'whether a flat level step is a finding or a sample size.',
    ).toBe(true);
  });

  it('a bar and its sample are declared together, not scattered', () => {
    // ONE_TRICK_GAMES exists because 3c's bar is four times finer than
    // requirement 3's and cannot share its budget. If it disappears, 3c has
    // silently gone back to MINDLESS_GAMES.
    expect(
      lib.includes('ONE_TRICK_GAMES'),
      '3c must keep its own sample budget. Sharing MINDLESS_GAMES puts a 5pp bar on a sample '
      + 'sized for a 20pp one.',
    ).toBe(true);
  });
});
