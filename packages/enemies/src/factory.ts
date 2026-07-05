import { AIStrategy, Character, ActionDefinition, EquipmentDefinition, EquipmentSlot, createCharacter } from '@pimpampum/engine';
import { getEquipment } from '@pimpampum/skills';
import { EnemyTemplate } from './types.js';
import { getEnemyTemplate, unlockedEnemyActions } from './catalog.js';
import { pvForLevel } from './generator.js';

/**
 * Instantiate an enemy from a template. `levels` overrides the level of specific
 * skills; any unset skill uses the template's suggestedLevel. `equipmentIds`
 * adds passive items (same slots/effects as player equipment). `pv` overrides
 * the level-derived durability — pass SolvedGroup.pv when fielding a solved
 * encounter, since the solver discounts PV by the h-curve (level ≠ pv there).
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
  let topLevel = 1;
  for (const skillId of template.skills) {
    const level = levels[skillId] ?? template.suggestedLevel;
    skills[skillId] = level;
    topLevel = Math.max(topLevel, level);
    actions.push(...unlockedEnemyActions(skillId, level));
  }
  const equipment = equipmentIds
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);
  if (template.naturalArmor) {
    equipment.push({
      id: `${template.id}-armadura-natural`,
      name: 'Armadura natural',
      slot: EquipmentSlot.Torso,
      passiveArmor: template.naturalArmor,
      speedPenalty: 0,
      skillBonuses: [],
      iconPath: '',
      description: `Armadura natural ${template.naturalArmor}.`,
    });
  }
  const c = createCharacter({
    name,
    classCss: template.classCss,
    iconPath: template.iconPath,
    // Durability derives from the fielded level (pv = level²/42, solitaris
    // get the boss mass multiplier), not from the template — unless the caller
    // fields a solver-priced PV.
    pv: pv ?? pvForLevel(topLevel, template.role),
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
