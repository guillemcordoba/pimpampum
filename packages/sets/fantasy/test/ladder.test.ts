/**
 * THE DICE LADDER (intentions.md): every card sits around its level's rung —
 * an attack (or a Focus that rolls) near `ATTACK_LADDER`, a defense near
 * `DEFENSE_LADDER`. ABOVE by more than the slack needs a reason, written in
 * `LADDER_RULES` (set-common `offTheLadder`).
 */
import { describe, it, expect } from 'vitest';
import { offTheLadder } from '@pimpampum/set-common';
import { ALL_SKILLS, LADDER_RULES } from '../src/index.js';

describe('the dice ladder', () => {
  for (const skill of ALL_SKILLS) {
    it(`${skill.id}: no card above its rung by more than ${LADDER_RULES.slack} without a reason`, () => {
      expect(offTheLadder([skill], LADDER_RULES).over).toEqual([]);
    });
  }

  it('every reason names a card that still needs it', () => {
    const excused = offTheLadder(ALL_SKILLS, LADDER_RULES).excused;
    expect(Object.keys(LADDER_RULES.reasons).filter(id => !excused.includes(id))).toEqual([]);
  });
});
