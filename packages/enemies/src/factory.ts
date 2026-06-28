import { Character, ActionDefinition, EquipmentDefinition, createCharacter } from '@pimpampum/engine';
import { getEquipment } from '@pimpampum/skills';
import { EnemyTemplate } from './types.js';
import { getEnemyTemplate, unlockedEnemyActions } from './catalog.js';

/**
 * Instantiate an enemy from a template. `levels` overrides the level of specific
 * skills; any unset skill uses the template's suggestedLevel. `equipmentIds`
 * adds passive items (same slots/effects as player equipment).
 */
export function createEnemyFromTemplate(
  template: EnemyTemplate,
  levels: Record<string, number> = {},
  name = template.displayName,
  equipmentIds: string[] = [],
): Character {
  const skills: Record<string, number> = {};
  const actions: ActionDefinition[] = [];
  for (const skillId of template.skills) {
    const level = levels[skillId] ?? template.suggestedLevel;
    skills[skillId] = level;
    actions.push(...unlockedEnemyActions(skillId, level));
  }
  const equipment = equipmentIds
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);
  return createCharacter({
    name,
    classCss: template.classCss,
    iconPath: template.iconPath,
    pv: template.basePV,
    skills,
    actions,
    equipment,
    category: 'enemy',
  });
}

/** Convenience: build an enemy by template id. */
export function createEnemy(id: string, levels: Record<string, number> = {}, name?: string, equipmentIds: string[] = []): Character | undefined {
  const t = getEnemyTemplate(id);
  return t ? createEnemyFromTemplate(t, levels, name, equipmentIds) : undefined;
}
