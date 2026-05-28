import { Character, ActionDefinition, EquipmentDefinition, createCharacter } from '@pimpampum/engine';
import { getEquipment } from '@pimpampum/skills';
import { unlockedEnemyActions } from './enemy-skills.js';

const ICON = 'icons/000000/transparent/1x1/';

/**
 * An enemy template. It declares which skills the enemy fights with; the DM /
 * web UI / simulator chooses the levels at runtime (defaulting to suggestedLevel).
 */
export interface EnemyTemplate {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  basePV: number;
  /** Skill ids from @pimpampum/skills. */
  skills: string[];
  /** Default skill level when none is supplied. */
  suggestedLevel: number;
}

export const ENEMY_TEMPLATES: EnemyTemplate[] = [
  { id: 'goblin', displayName: 'Goblin', classCss: 'goblin', iconPath: ICON + 'delapouite/goblin-head.svg', basePV: 4, skills: ['tactiques-goblin'], suggestedLevel: 20 },
  { id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', iconPath: ICON + 'delapouite/skull-staff.svg', basePV: 8, skills: ['xamanisme-goblin'], suggestedLevel: 25 },
  { id: 'wolf', displayName: 'Llop', classCss: 'llop', iconPath: ICON + 'lorc/wolf-head.svg', basePV: 4, skills: ['instint-manada'], suggestedLevel: 18 },
  { id: 'spined-devil', displayName: 'Diable Espinós', classCss: 'diable-espinos', iconPath: ICON + 'lorc/imp.svg', basePV: 6, skills: ['foc-infernal'], suggestedLevel: 22 },
  { id: 'bone-devil', displayName: "Diable d'Os", classCss: 'diable-dos', iconPath: ICON + 'lorc/daemon-skull.svg', basePV: 12, skills: ['maldat-ossia', 'terror'], suggestedLevel: 30 },
  { id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', iconPath: ICON + 'delapouite/rock-golem.svg', basePV: 14, skills: ['forca-pedra'], suggestedLevel: 35 },
  { id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', iconPath: ICON + 'delapouite/devil-mask.svg', basePV: 18, skills: ['combat-diabolic', 'foc-avern'], suggestedLevel: 40 },
  { id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', iconPath: ICON + 'delapouite/spiked-dragon-head.svg', basePV: 24, skills: ['petrificacio', 'veri'], suggestedLevel: 45 },
];

const templateIndex = new Map(ENEMY_TEMPLATES.map(t => [t.id, t]));

export function getEnemyTemplate(id: string): EnemyTemplate | undefined {
  return templateIndex.get(id);
}

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
  const t = templateIndex.get(id);
  return t ? createEnemyFromTemplate(t, levels, name, equipmentIds) : undefined;
}
