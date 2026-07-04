import { describe, it, expect } from 'vitest';
import {
  createCharacter, ActionType, ActionDefinition, EquipmentDefinition,
  ALL_SIZES, CharacterSize, SIZE_TABLE, sizePvModifier, sizeSpeedModifier,
} from '@pimpampum/engine';
import { createEnemyFromTemplate, getEnemyTemplate } from './helpers.js';
import { pvForLevel } from '@pimpampum/enemies';

const ACTION: ActionDefinition = {
  id: 'test-atac', name: 'Test Atac', skillId: 'test', unlockLevel: 1,
  actionType: ActionType.Atac, speed: 2, effects: [], description: '', iconPath: '',
};

const HEAVY_ARMOR: EquipmentDefinition = {
  id: 'test-armor', name: 'Test Armor', slot: 'Torso' as EquipmentDefinition['slot'],
  passiveArmor: 3, speedPenalty: 4, skillBonuses: [], iconPath: '', description: '',
};

function makeCharacter(size?: CharacterSize, equipment: EquipmentDefinition[] = []) {
  return createCharacter({
    name: 'T', classCss: 'objecte', pv: 10,
    skills: { test: 30 }, actions: [ACTION], equipment, size,
  });
}

describe('character size', () => {
  it('applies the PV modifier to maxPV at creation', () => {
    for (const size of ALL_SIZES) {
      const c = makeCharacter(size);
      expect(c.size).toBe(size);
      expect(c.maxPV).toBe(10 + sizePvModifier(size));
      expect(c.currentPV).toBe(c.maxPV);
    }
  });

  it('defaults to Mitjà with no modifiers', () => {
    const c = makeCharacter();
    expect(c.size).toBe('mitja');
    expect(c.maxPV).toBe(10);
    expect(c.getEffectiveSpeed(c.actions[0])).toBe(ACTION.speed);
  });

  it('shifts effective action speed by the size modifier', () => {
    const mitja = makeCharacter('mitja');
    for (const size of ALL_SIZES) {
      const c = makeCharacter(size);
      expect(c.getEffectiveSpeed(c.actions[0]))
        .toBe(mitja.getEffectiveSpeed(mitja.actions[0]) + sizeSpeedModifier(size));
    }
  });

  it('stacks with equipment speed penalties', () => {
    const c = makeCharacter('gran', [HEAVY_ARMOR]);
    expect(c.getEffectiveSpeed(c.actions[0]))
      .toBe(ACTION.speed - HEAVY_ARMOR.speedPenalty + SIZE_TABLE.gran.speedModifier);
  });

  it('survives resetForNewCombat', () => {
    const c = makeCharacter('petit');
    c.loseLife(2);
    c.resetForNewCombat();
    expect(c.size).toBe('petit');
    expect(c.maxPV).toBe(10 + SIZE_TABLE.petit.pvModifier);
    expect(c.currentPV).toBe(c.maxPV);
    expect(c.getEffectiveSpeed(c.actions[0])).toBe(ACTION.speed + SIZE_TABLE.petit.speedModifier);
  });

  it('enemies default to Mitjà with formula-derived PV', () => {
    const template = getEnemyTemplate('goblin')!;
    const enemy = createEnemyFromTemplate(template);
    expect(enemy.size).toBe('mitja');
    expect(enemy.maxPV).toBe(pvForLevel(template.suggestedLevel));
  });
});
