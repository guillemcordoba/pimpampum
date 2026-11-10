/**
 * THE DEFENSE PREMIUM, solved exactly (intentions.md: a defense holds against
 * its level's attack ~78% of the time, read as the MEAN, never as a floor).
 * Convolves the two ladders' dice: a probability, not a sample. It replaced
 * `tools/src/experiment-defense-vs-attack.ts` (deleted 2026-11-10), which
 * printed the same number for the old fantasy cards; the cards now sit around
 * the ladder (each set's `test/ladder.test.ts`), so the ladder is what holds it.
 */
import { describe, it, expect } from 'vitest';
import { diceDistribution, type DiceRoll } from '@pimpampum/engine';
import { ATTACK_LADDER, DEFENSE_LADDER } from '../src/index.js';

/** Ties hold for the defense. */
function holds(defense: DiceRoll, attack: DiceRoll): number {
  let p = 0;
  for (const [d, dp] of diceDistribution(defense, 0)) {
    for (const [a, ap] of diceDistribution(attack, 0)) if (d >= a) p += dp * ap;
  }
  return p;
}

const LEVELS = Object.keys(ATTACK_LADDER).map(Number);

describe('the dice ladder\'s defense premium', () => {
  it('averages about 78% over the levels', () => {
    const mean = LEVELS.reduce((s, l) => s + holds(DEFENSE_LADDER[l], ATTACK_LADDER[l]), 0) / LEVELS.length;
    expect(mean).toBeGreaterThan(0.75);
    expect(mean).toBeLessThan(0.82);
  });

  // A rung far off the mean is a level where defending is a different game:
  // near 90% a guard is a win condition (intentions.md, 2026-08-08).
  for (const l of LEVELS) {
    it(`level ${l}: ${DEFENSE_LADDER[l]} holds against ${ATTACK_LADDER[l]} between 72% and 85%`, () => {
      const p = holds(DEFENSE_LADDER[l], ATTACK_LADDER[l]);
      expect(p).toBeGreaterThan(0.72);
      expect(p).toBeLessThan(0.85);
    });
  }
});
