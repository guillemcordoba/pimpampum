/**
 * THE DICE LADDER (intentions.md, 2026-11-02, the user): every number in the
 * game is built up from the smallest die, 1d4. A level-1 attack rolls about
 * 1d4 and each level adds about one point to the average; a defense of a level
 * holds against the attacks of that level about 78% of the time (the defense
 * premium); and a hero's PV is derived from the same ladder (a creature's PV is an
 * encounter lever, solved with its level).
 *
 * Cards sit AROUND the ladder, not on it: an effect, extra targets or speed
 * are paid for in dice (`test/ladder.test.ts` says how far a card may stray).
 */
import { DiceRoll } from '@pimpampum/engine';

/** A level's vanilla single-target attack, one die type and a flat bonus. */
export const ATTACK_LADDER: Readonly<Record<number, DiceRoll>> = {
  1: new DiceRoll(1, 4), 2: new DiceRoll(1, 6), 3: new DiceRoll(2, 4), 4: new DiceRoll(2, 4, 1), 5: new DiceRoll(2, 6),
  6: new DiceRoll(3, 4), 7: new DiceRoll(3, 4, 1), 8: new DiceRoll(4, 4), 9: new DiceRoll(3, 6), 10: new DiceRoll(3, 6, 1),
};

/** A level's vanilla defense: holds against that level's attack ~78% of the time. */
export const DEFENSE_LADDER: Readonly<Record<number, DiceRoll>> = {
  1: new DiceRoll(1, 6), 2: new DiceRoll(2, 4), 3: new DiceRoll(2, 6), 4: new DiceRoll(3, 4), 5: new DiceRoll(2, 6, 2),
  6: new DiceRoll(3, 4, 2), 7: new DiceRoll(2, 8, 2), 8: new DiceRoll(5, 4), 9: new DiceRoll(4, 6), 10: new DiceRoll(4, 6, 1),
};

/** The attack average the ladder aims at: 1d4's 2.5 at level 1, +1 a level. */
export function ladderMean(level: number): number {
  return level + 1.5;
}

/** Average same-level blows a body survives undefended, at the reference level. */
export const BLOWS_TO_FALL = 4;
export const PV_REFERENCE_LEVEL = 5;

/** A hero's PV: 4 × the level-5 average = 26. */
export const BODY_PV = BLOWS_TO_FALL * ladderMean(PV_REFERENCE_LEVEL);
