import { AIStrategy, Character, ActionDefinition, EquipmentDefinition, EquipmentSlot, createCharacter } from '@pimpampum/engine';
import { getEquipment, COP_DESESPERAT } from '@pimpampum/skills';
import { EnemyTemplate } from './types.js';
import { getEnemyTemplate, unlockedEnemyActions } from './catalog.js';

/**
 * Instantiate an enemy from a template. `levels` overrides the level (ordinal:
 * actions known) of specific skills; any unset skill uses the template's
 * suggestedLevel. `equipmentIds` adds passive items (same slots/effects as
 * player equipment). `pv` overrides the template's basePV.
 */
export function createEnemyFromTemplate(
  template: EnemyTemplate,
  levels: Record<string, number> = {},
  name = template.displayName,
  equipmentIds: string[] = [],
  pv?: number,
): Character {
  const skills: Record<string, number> = {};
  const actions: ActionDefinition[] = [];
  for (const skillId of template.skills) {
    const level = levels[skillId] ?? template.suggestedLevel;
    skills[skillId] = level;
    actions.push(...unlockedEnemyActions(skillId, level));
  }
  // Every combatant always holds the universal desperation card.
  actions.push(COP_DESESPERAT);
  const equipment = [...(template.equipment ?? []), ...equipmentIds]
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);
  if (template.naturalArmor) {
    equipment.push({
      id: `${template.id}-armadura-natural`,
      name: 'Armadura natural',
      slot: EquipmentSlot.Armor,
      passiveArmor: template.naturalArmor,
      speedPenalty: 0,
      rollBonuses: [],
      iconPath: '',
      description: `Armadura natural ${template.naturalArmor}.`,
    });
  }
  const c = createCharacter({
    name,
    classCss: template.classCss,
    iconPath: template.iconPath,
    pv: pv ?? template.basePV,
    skills,
    actions,
    equipment,
    category: 'enemy',
  });
  c.aiStrategy = template.aiStrategy ?? AIStrategy.Aggro;
  return c;
}

/** Convenience: build an enemy by template id. */
export function createEnemy(id: string, levels: Record<string, number> = {}, name?: string, equipmentIds: string[] = [], pv?: number): Character | undefined {
  const t = getEnemyTemplate(id);
  return t ? createEnemyFromTemplate(t, levels, name, equipmentIds, pv) : undefined;
}
