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
import { stderr } from '@pimpampum/bench';
import { TRIANGLE_GAMES } from '../src/index.js';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * WHAT A CARD IS WORTH IS NOT WHAT THE AI THINKS OF IT.
 *
 * The card requirement (now 3) spent three sessions as a PLAY RATE — "how often did the AI
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
  const block = (): string => lib.slice(lib.indexOf('// 3. Choosing matters.'), lib.indexOf('/** The subject half of a cell key'));

  it('the requirement 3 verdict is computed from per-decision counterfactuals', () => {
    expect(block().length, 'could not find the requirement 3 block — did the markers move?').toBeGreaterThan(200);
    expect(
      block().includes('measureKit') && block().includes('scoreCards'),
      'requirement 3 no longer reads bench/regret.ts. Whatever it measures now, it is not what '
      + 'the game loses by never playing the card.',
    ).toBe(true);
  });

  it('play rate never decides the verdict', () => {
    // Counting how often the AI picked a card measures the AI. The counters may
    // be READ as an explanation; they must not be compared to a threshold.
    expect(
      /(played\s*\/\s*legal|counters\.(played|legal))[^;]*[<>]/.test(block()),
      'a play rate is being compared against a threshold inside requirement 3.',
    ).toBe(false);
  });

  it('fails on the cost of a random pick, never on the ranking or a card\'s share', () => {
    // `value` is a card's score minus the mean of its alternatives, so across a
    // hand the values SUM TO ~ZERO by arithmetic: failing on it would flag half
    // of every kit however well designed. And a card's best-play share cannot
    // tell a useless card from a harmless one in a fight the choice barely
    // moves (NEXT-STEPS §27.3). The verdict is the cross-fitted cost alone.
    const ok = block().match(/const choices: Verdict = \{\s*ok: ([^,]*),/);
    expect(ok, 'no `const choices: Verdict = { ok: … }` in the requirement 3 block').not.toBeNull();
    let expr = ok![1];
    for (const name of ok![1].match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const def = block().match(new RegExp(`const ${name} = ([^;]*);`));
      if (def) expr += ` ${def[1]}`;
    }
    expect(expr.includes('choiceMattersVerdict') && expr.includes('cost.mean'),
      `requirement 3 decides on "${ok![1]}", which does not trace to the random-pick cost.`).toBe(true);
    expect(/\.value\b|bestShare/.test(expr),
      `requirement 3 reaches a card's value or share in "${ok![1]}".`).toBe(false);
  });

  it('the random-pick cost is cross-fitted, so noise alone costs nothing', () => {
    expect(/const choiceCost = crossFittedCost\(branches\);/.test(regret),
      'the per-decision cost must come from crossFittedCost: top-minus-mean takes a max over '
      + 'noisy rollouts and reads a choice between cards worth exactly the same').toBe(true);
  });

  it('drops positions where every card scores the same', () => {
    // Once the outcome is settled every branch plays to the same board and all
    // candidates tie, so each would collect 1/k from a position that said
    // nothing — and 1/k is exactly the chance null every card is tested
    // against. Decided positions drag every card toward the line.
    expect(
      /top === bottom/.test(regret),
      'positions where all candidates score identically are decisions that cost nothing, not '
      + 'samples of which card is best: every card would collect a full wasBest from them.',
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
 * This mistake was made twice before anything enforced it: `DEAD_VALUE` was
 * set at 2pp against a 3pp noise floor (NEXT-STEPS §17.5), and the one-card
 * requirement judged a 5pp bar on 300 combats an arm, its verdict flipping
 * PASSA/FALLA/PASSA/FALLA/PASSA across five seeds with the game unchanged
 * (§19.1). A threshold below its sample's resolution reports which seed was
 * used, and that is indistinguishable from a real finding until somebody
 * re-runs it.
 */
describe('every threshold is resolvable by the sample that judges it', () => {
  it('the triangle resolves a 5pp edge from an even duel', () => {
    const halfWidth = 2 * stderr(0.5, TRIANGLE_GAMES);
    expect(halfWidth,
      `TRIANGLE_GAMES=${TRIANGLE_GAMES} leaves a ±${(halfWidth * 100).toFixed(1)}pp interval around an even `
      + 'duel. An edge smaller than the interval reads as a coin flip, so the triangle could only '
      + 'ever "hold" for corners that crush each other.').toBeLessThanOrEqual(0.05);
  });
});
