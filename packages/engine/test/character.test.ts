/**
 * A CHARACTER'S STATE — fatigue, equipment, bonuses, durations, damage — as
 * the rules state it. Everything here is exact; no fight is played.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ActionType, clampFatigue, CombatModifier, createCharacter, DiceRoll, EquipmentSlot,
  FATIGUE_LEVEL_NAMES, FATIGUE_MAX_LEVEL, fatigueRollPenalty, ModifierDuration,
  type EquipmentDefinition,
} from '../src/index.js';
import { armour, attackCard, defenseCard, fighter, TEST_SKILL } from '../src/testing.js';

function item(over: Partial<EquipmentDefinition>): EquipmentDefinition {
  return {
    id: 'x', name: 'x', slot: EquipmentSlot.Weapon, passiveArmor: 0, speedPenalty: 0,
    rollBonuses: [], iconPath: '', description: '', ...over,
  };
}

describe('fatigue', () => {
  it('is a level from 0 to 5, one name per level', () => {
    expect(FATIGUE_MAX_LEVEL).toBe(5);
    expect(FATIGUE_LEVEL_NAMES).toHaveLength(FATIGUE_MAX_LEVEL + 1);
  });

  it('clamps anything to a valid level', () => {
    fc.assert(fc.property(fc.double({ min: -100, max: 100, noNaN: true }), x => {
      const l = clampFatigue(x);
      expect(Number.isInteger(l)).toBe(true);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(FATIGUE_MAX_LEVEL);
    }));
    expect(clampFatigue(NaN)).toBe(0);
  });

  it('costs one point per level on every roll — attack, defense and uncontested alike', () => {
    for (let level = 0; level <= FATIGUE_MAX_LEVEL; level++) {
      const c = fighter('F', [attackCard()], { fatigue: level });
      expect(fatigueRollPenalty(level)).toBe(0 - level);
      expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(0 - level);
      expect(c.getRollBonus(TEST_SKILL, 'defense')).toBe(0 - level);
      expect(c.getRollBonus(TEST_SKILL)).toBe(0 - level);
    }
  });

  it('only a rest clears it, and all of it at once', () => {
    const c = fighter('F', [attackCard()], { fatigue: 4 });
    c.resetForNewCombat();
    c.advanceTurn();
    expect(c.fatigue).toBe(4);
    c.rest();
    expect(c.fatigue).toBe(0);
  });
});

describe('equipment', () => {
  it('armour adds up, and modifiers can lower it but never below zero', () => {
    const c = fighter('A', [attackCard()], { equipment: [armour(2)] });
    expect(c.getPassiveArmor()).toBe(2);
    c.addModifier(new CombatModifier('armor', -5, ModifierDuration.ThisTurn));
    expect(c.getPassiveArmor()).toBe(0);
  });

  it('heavy armour slows every action it is worn for', () => {
    const c = fighter('A', [attackCard('a', { speed: 4 })], { equipment: [armour(2, 1)] });
    expect(c.getEffectiveSpeed(c.actions[0])).toBe(3);
  });

  it('one item per slot: equipping replaces, and takes the old item\'s cards with it', () => {
    const shieldCard = defenseCard('raise', { unlockLevel: 0 });
    const shield = item({ id: 'shield', slot: EquipmentSlot.Shield, grantsActions: [shieldCard] });
    const other = item({ id: 'buckler', slot: EquipmentSlot.Shield });
    const c = createCharacter({ name: 'S', classCss: 't', pv: 10, skills: {}, actions: [], equipment: [shield] });
    expect(c.actions.map(a => a.def.id)).toEqual(['raise']);
    c.equip(other);
    expect(c.equipment.map(e => e.id)).toEqual(['buckler']);
    expect(c.actions).toHaveLength(0);
  });

  it('roll bonuses apply to their own skill or to "*", and to their own kind only', () => {
    const c = fighter('B', [attackCard()], {
      equipment: [item({
        rollBonuses: [
          { skillId: TEST_SKILL, value: 1 },
          { skillId: '*', kind: 'attack', value: 2 },
          { skillId: 'other', value: 100 },
        ],
      })],
    });
    expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(3);
    expect(c.getRollBonus(TEST_SKILL, 'defense')).toBe(1);
    expect(c.getRollBonus('elsewhere', 'attack')).toBe(2);
  });
});

describe('modifiers and statuses run out when they say they do', () => {
  it('ThisTurn lasts one advance; NextNTurns waits a turn and then lasts N; RestOfCombat stays', () => {
    const c = fighter('M', [attackCard()]);
    c.addModifier(new CombatModifier('attack', 1, ModifierDuration.ThisTurn));
    c.addModifier(new CombatModifier('attack', 10, ModifierDuration.NextNTurns(2)));
    c.addModifier(new CombatModifier('attack', 100, ModifierDuration.RestOfCombat));
    expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(101);   // the pending one is not live yet
    c.advanceTurn();
    expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(110);
    c.advanceTurn();
    expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(110);
    c.advanceTurn();
    expect(c.getRollBonus(TEST_SKILL, 'attack')).toBe(100);
  });

  it('a status counts down and goes; -1 stays for the whole combat', () => {
    const c = fighter('S', [attackCard()]);
    c.setStatus('brief', 1, 2);
    c.setStatus('forever', 1, -1);
    c.advanceTurn();
    expect(c.hasStatus('brief')).toBe(true);
    c.advanceTurn();
    expect(c.hasStatus('brief')).toBe(false);
    for (let i = 0; i < 10; i++) c.advanceTurn();
    expect(c.hasStatus('forever')).toBe(true);
  });

  it('a new combat wipes combat state and restores PV — but not fatigue', () => {
    const c = fighter('R', [attackCard('pot', { isConsumable: true })], { pv: 10, fatigue: 2 });
    c.loseLife(4);
    c.setStatus('s', 1, -1);
    c.actions[0].consumed = true;
    c.resetForNewCombat();
    expect(c.currentPV).toBe(10);
    expect(c.statuses.size).toBe(0);
    expect(c.actions[0].consumed).toBe(false);
    expect(c.fatigue).toBe(2);
  });
});

describe('PV', () => {
  it('stays within [0, max] whatever is done to it', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 50 }),
      fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 0, max: 30 })), { maxLength: 30 }),
      (pv, ops) => {
        const c = fighter('P', [attackCard()], { pv });
        for (const [hurt, n] of ops) {
          if (hurt) c.loseLife(n); else c.heal(n);
          expect(c.currentPV).toBeGreaterThanOrEqual(0);
          expect(c.currentPV).toBeLessThanOrEqual(pv);
        }
      },
    ));
  });

  it('only real damage counts as a hit — a 0-point blow does not interrupt a focus', () => {
    const c = fighter('P', [attackCard()]);
    c.loseLife(0);
    expect(c.hitThisTurn).toBe(false);
    c.loseLife(1);
    expect(c.hitThisTurn).toBe(true);
  });
});

describe('skills', () => {
  it('raising a skill the character knows adds a level; one they lack is left alone', () => {
    const c = fighter('L', [attackCard()], { level: 2 });
    c.raiseSkill(TEST_SKILL);
    expect(c.getSkillLevel(TEST_SKILL)).toBe(3);
    c.raiseSkill('unknown');
    expect(c.skills.has('unknown')).toBe(false);
  });
});

describe('a cloned character', () => {
  it('shares definitions and copies state, so playing the copy leaves the original untouched', () => {
    const c = fighter('O', [attackCard('a', { dice: new DiceRoll(2, 6), actionType: ActionType.Atac })], { pv: 12 });
    c.setStatus('mark', 3, 2, { n: 1 });
    const copy = c.cloneState();
    copy.loseLife(5);
    copy.setStatus('mark', 9, 1);
    copy.raiseSkill(TEST_SKILL);
    expect(c.currentPV).toBe(12);
    expect(c.getStatusValue('mark')).toBe(3);
    expect(c.getSkillLevel(TEST_SKILL)).toBe(0);
    expect(copy.actions[0].def).toBe(c.actions[0].def);
  });
});
