import { Character } from '@pimpampum/engine';
import { getEnemyTemplate } from './catalog.js';
import { createEnemyFromTemplate } from './factory.js';
import { SolvedEncounter } from './generator.js';

export {
  ENEMY_TEMPLATES, getEnemyTemplate,
  ENEMY_SKILLS, getEnemySkill, ENEMY_ACTIONS, getEnemyAction, unlockedEnemyActions,
} from './catalog.js';
export { createEnemyFromTemplate, createEnemy } from './factory.js';
export { registerEnemySkills } from './catalog.js';
export type { EnemyTemplate, EnemyModule, EnemyRole } from './types.js';
export {
  solveEncounter, generateEncounter, unitThreat, levelFactor, templateLevelFactor, partyStrength, armorFactor, PARTY_REF_ARMOR,
  winrateForRatio, ratioForWinrate, compositionThreat, predictEncounter,
  WINRATE_K, PARTY_ALPHA, ROLE_COUNT, TARGET_WINRATES, PV_MULT_MIN, PV_MULT_MAX,
  PLAYER_REF_LEVELS, playerLevelFactor,
} from './generator.js';
export type { PoolSpec, SolvedGroup, SolvedEncounter, EncounterDifficulty, FieldedGroup } from './generator.js';

/** Instantiate every enemy of a balancer-solved encounter. */
export function buildSolvedEncounter(solved: SolvedEncounter): Character[] {
  const enemies: Character[] = [];
  for (const g of solved.groups) {
    const template = getEnemyTemplate(g.templateId);
    if (!template) continue;
    const levels = Object.fromEntries(template.skills.map(s => [s, g.level]));
    for (let i = 0; i < g.count; i++) {
      const name = g.count > 1 ? `${template.displayName} ${i + 1}` : template.displayName;
      enemies.push(createEnemyFromTemplate(template, levels, name, [], g.pv));
    }
  }
  return enemies;
}
