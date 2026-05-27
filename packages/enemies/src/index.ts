import { Character } from '@pimpampum/engine';
import { getEnemyTemplate, createEnemyFromTemplate } from './templates.js';
import { EncounterDefinition } from './encounters/index.js';

export { ENEMY_TEMPLATES, getEnemyTemplate, createEnemyFromTemplate, createEnemy } from './templates.js';
export type { EnemyTemplate } from './templates.js';
export { ALL_ENCOUNTERS, getEncounter } from './encounters/index.js';
export type { EncounterDefinition, EncounterEnemyGroup } from './encounters/index.js';
export {
  ENEMY_SKILLS, getEnemySkill, ENEMY_ACTIONS, getEnemyAction, unlockedEnemyActions,
} from './enemy-skills.js';

/** Instantiate every enemy in an encounter's composition for a player count. */
export function buildEncounter(encounter: EncounterDefinition, playerCount: number, levels: Record<string, number> = {}): Character[] {
  const comp = encounter.compositions[playerCount] ?? encounter.compositions[3];
  const enemies: Character[] = [];
  for (const group of comp) {
    const template = getEnemyTemplate(group.templateId);
    if (!template) continue;
    const groupLevels = group.level !== undefined
      ? Object.fromEntries(template.skills.map(s => [s, group.level as number]))
      : levels;
    for (let i = 0; i < group.count; i++) {
      const name = group.count > 1 ? `${template.displayName} ${i + 1}` : template.displayName;
      enemies.push(createEnemyFromTemplate(template, groupLevels, name));
    }
  }
  return enemies;
}
