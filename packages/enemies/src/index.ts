import { Character } from '@pimpampum/engine';
import { getEnemyTemplate } from './catalog.js';
import { createEnemyFromTemplate } from './factory.js';
import { EncounterDefinition } from './encounters/index.js';

export {
  ENEMY_TEMPLATES, getEnemyTemplate,
  ENEMY_SKILLS, getEnemySkill, ENEMY_ACTIONS, getEnemyAction, unlockedEnemyActions,
} from './catalog.js';
export { createEnemyFromTemplate, createEnemy } from './factory.js';
export type { EnemyTemplate, EnemyModule, EnemyRole } from './types.js';
export {
  pvForLevel, bodyScore, evenTarget, solveEncounter, generateEncounter,
  classifyScore, multiplierForWinrate, winrateForRatio,
  DIFFICULTY_MULT, DIFFICULTY_WINRATE, ROLE_COUNT, SCORE_BANDS,
  PV_DIVISOR, SCORE_PER_PLAYER, MAX_ENEMY_LEVEL, WINRATE_K,
} from './generator.js';
export type {
  EncounterDifficulty, GeneratedEncounter, PoolSpec, SolvedGroup, SolvedEncounter, ScoreBand,
} from './generator.js';
export { ALL_ENCOUNTERS, getEncounter } from './encounters/index.js';
export type { EncounterDefinition, EncounterEnemyGroup } from './encounters/index.js';

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
