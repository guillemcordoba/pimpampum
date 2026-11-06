/**
 * THE DICE LADDER (intentions.md, 2026-11-02, the user): every number in the
 * game is built up from the smallest die, 1d4. A level-1 attack rolls about
 * 1d4 and each level adds about one point to the average; a defense of a level
 * holds against the attacks of that level about 78% of the time (the defense
 * premium); and a hero's PV is derived from the same ladder (a creature's PV is an
 * encounter lever, solved with its level).
 *
 * Cards sit AROUND the ladder, not on it: an effect, extra targets or speed
 * are paid for in dice (`offTheLadder`; each set's `LADDER_RULES` says how far a card may stray).
 */
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';

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

/** The one PV every hero had until 2026-11-06. A hero's PV is now derived per
 *  level (each set's `HERO_PV`); this stays only for the pinned calibration
 *  copies, which may not be edited, and the fantasy set until its own table is
 *  derived — the next `pnpm calibration:refresh` and that table retire it. */
export const BODY_PV = BLOWS_TO_FALL * ladderMean(PV_REFERENCE_LEVEL);

/** How far a card may roll above its level's rung, and the cards above it
 *  that something else pays for (`offTheLadder`). */
export interface LadderRules {
  slack: number;
  /** A Focus that rolls: Focus cards are much stronger than attacks (intentions.md). */
  focusSlack: number;
  /** Card id → what pays for its dice. */
  reasons: Readonly<Record<string, string>>;
}

/** The cards rolling above their rung by more than the slack (`over`), and
 *  the ones a written reason excuses. Below is free: effects, extra targets
 *  and speed are paid for in dice. */
export function offTheLadder(skills: readonly { actions: readonly ActionDefinition[] }[], rules: LadderRules): { over: string[]; excused: string[] } {
  const over: string[] = [], excused: string[] = [];
  for (const a of skills.flatMap(s => s.actions)) {
    if (!a.dice) continue;
    const level = Math.max(1, Math.min(10, a.unlockLevel));
    const rung = (a.actionType === ActionType.Defensa ? DEFENSE_LADDER : ATTACK_LADDER)[level].average();
    const slack = a.actionType === ActionType.Focus ? rules.focusSlack : rules.slack;
    if (a.dice.average() - rung <= slack) continue;
    if (a.id in rules.reasons) excused.push(a.id);
    else over.push(`${a.id} (level ${level}: ${a.dice.average()} against ${rung})`);
  }
  return { over, excused };
}
