/**
 * THE RULES OF A CONTEST, exactly (`resolution.ts`, rules.md).
 *
 * Each rule is stated once as an ORACLE — a one-line restatement of rules.md —
 * and the engine's function is checked against it over generated inputs, plus
 * the handful of hand examples a reader can check in their head.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkSkillUp, resolveAttack, resolveDamage, SKILL_UP_MARGIN, skillLevelBonus,
} from '../src/index.js';

const total = fc.integer({ min: 0, max: 200 });

describe('an attack contest', () => {
  it('examples: damage is the margin, a tie holds, undefended takes the full roll', () => {
    expect(resolveAttack(10, 7)).toEqual({ hit: true, margin: 3 });
    expect(resolveAttack(7, 7)).toEqual({ hit: false, margin: 0 });
    expect(resolveAttack(5, 9)).toEqual({ hit: false, margin: -4 });
    expect(resolveAttack(6, null)).toEqual({ hit: true, margin: 6 });
  });

  it('defended: hits exactly when the attack STRICTLY exceeds the defense, by the difference', () => {
    fc.assert(fc.property(total, total, (a, d) => {
      expect(resolveAttack(a, d)).toEqual({ hit: a > d, margin: a - d });
    }));
  });

  it('undefended: always hits, for the whole attack total', () => {
    fc.assert(fc.property(total, a => {
      expect(resolveAttack(a, null)).toEqual({ hit: true, margin: a });
    }));
  });

  it('equal training cancels: adding the same level to both sides changes nothing', () => {
    // A roll is dice + level, on BOTH sides, so a same-level contest is
    // arithmetically identical to one with no bonus at all (CLAUDE.md).
    fc.assert(fc.property(total, total, fc.integer({ min: 0, max: 20 }), (a, d, k) => {
      expect(resolveAttack(a + k, d + k)).toEqual(resolveAttack(a, d));
    }));
  });
});

describe('damage through armour', () => {
  it('examples', () => {
    expect(resolveDamage(7, 3)).toBe(4);
    expect(resolveDamage(2, 5)).toBe(0);
    expect(resolveDamage(5, 0)).toBe(5);
  });

  it('is the margin minus armour, never below zero', () => {
    fc.assert(fc.property(fc.integer({ min: -50, max: 200 }), fc.integer({ min: 0, max: 20 }), (m, armour) => {
      expect(resolveDamage(m, armour)).toBe(Math.max(0, m - armour));
    }));
  });

  it('more armour never lets more through; a bigger margin never deals less', () => {
    fc.assert(fc.property(total, fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 10 }), (m, a, extra) => {
      expect(resolveDamage(m, a + extra)).toBeLessThanOrEqual(resolveDamage(m, a));
      expect(resolveDamage(m + extra, a)).toBeGreaterThanOrEqual(resolveDamage(m, a));
    }));
  });
});

describe('learning from a contest', () => {
  it('the loser learns only on a close loss', () => {
    expect(checkSkillUp(0)).toBe(true);    // a tie: the attacker lost by 0
    expect(checkSkillUp(1)).toBe(true);
    expect(checkSkillUp(SKILL_UP_MARGIN)).toBe(true);
    expect(checkSkillUp(SKILL_UP_MARGIN + 1)).toBe(false);
    expect(checkSkillUp(-1)).toBe(false);  // winners never learn
  });

  it('is exactly the band [0, SKILL_UP_MARGIN]', () => {
    fc.assert(fc.property(fc.integer({ min: -100, max: 100 }), lostBy => {
      expect(checkSkillUp(lostBy)).toBe(lostBy >= 0 && lostBy <= SKILL_UP_MARGIN);
    }));
  });
});

describe('the level in a roll', () => {
  it('is the actor\'s level in the CARD\'s skill, and nothing for a skill they lack', () => {
    const actor = { getSkillLevel: (id: string) => ({ a: 3, b: 1 } as Record<string, number>)[id] ?? 0 };
    expect(skillLevelBonus(actor, { skillId: 'a' })).toBe(3);
    expect(skillLevelBonus(actor, { skillId: 'b' })).toBe(1);
    expect(skillLevelBonus(actor, { skillId: 'z' })).toBe(0);
  });
});
