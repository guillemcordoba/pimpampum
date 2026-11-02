/**
 * THE DICE LADDER (intentions.md): every card sits around its level's rung —
 * an attack (or a Focus that rolls) near `ATTACK_LADDER`, a defense near
 * `DEFENSE_LADDER`. Below is free: effects, extra targets and speed are paid
 * for in dice. ABOVE by more than a point needs a reason, written here.
 */
import { describe, it, expect } from 'vitest';
import { ActionType } from '@pimpampum/engine';
import { ATTACK_LADDER, DEFENSE_LADDER } from '@pimpampum/set-common';
import { ALL_SKILLS } from '../src/index.js';

/** How far above its rung a card may roll without a reason. */
const SLACK = 1;

/** Cards above their rung by more than `SLACK`, and what pays for it. */
const ABOVE: Record<string, string> = {
  // Esgrima, shared with the elements set (its test says the same).
  'estocada-fantasma': 'costs a fatigue level (a card too strong for its slot pays fatigue)',
};

describe('the dice ladder', () => {
  for (const skill of ALL_SKILLS) {
    it(`${skill.id}: no card above its rung by more than ${SLACK} without a reason`, () => {
      const over = skill.actions.flatMap(a => {
        if (!a.dice) return [];
        const level = Math.max(1, Math.min(10, a.unlockLevel));
        const rung = (a.actionType === ActionType.Defensa ? DEFENSE_LADDER : ATTACK_LADDER)[level].average();
        return a.dice.average() - rung > SLACK && !(a.id in ABOVE) ? [`${a.id} (level ${level}: ${a.dice.average()} against ${rung})`] : [];
      });
      expect(over).toEqual([]);
    });
  }
});
