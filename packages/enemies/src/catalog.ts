import { ActionDefinition, EffectRegistry } from '@pimpampum/engine';
import { SkillDefinition } from '@pimpampum/skills';
import { EnemyTemplate, EnemyModule } from './types.js';
import { GOBLIN } from './enemies/goblin.js';
import { GOBLIN_SHAMAN } from './enemies/goblin-shaman.js';
import { WOLF } from './enemies/wolf.js';
import { SPINED_DEVIL } from './enemies/spined-devil.js';
import { BONE_DEVIL } from './enemies/bone-devil.js';
import { STONE_GOLEM } from './enemies/stone-golem.js';
import { HORNED_DEVIL } from './enemies/horned-devil.js';
import { BASILISK } from './enemies/basilisk.js';

// Every enemy module, in display order. Add a new enemy by creating a file in
// `enemies/` and listing its module here.
const ENEMY_MODULES: EnemyModule[] = [
  GOBLIN, GOBLIN_SHAMAN, WOLF, SPINED_DEVIL,
  BONE_DEVIL, STONE_GOLEM, HORNED_DEVIL, BASILISK,
];

export const ENEMY_TEMPLATES: EnemyTemplate[] = ENEMY_MODULES.map(m => m.template);

const templateIndex = new Map(ENEMY_TEMPLATES.map(t => [t.id, t]));
export function getEnemyTemplate(id: string): EnemyTemplate | undefined {
  return templateIndex.get(id);
}

// Enemy skills live here (not in @pimpampum/skills) so they only surface in the
// enemy section of the app. They reuse the generic SkillDefinition/action helpers
// and the effect handlers registered by @pimpampum/skills.
export const ENEMY_SKILLS: SkillDefinition[] = ENEMY_MODULES.flatMap(m => m.skills);

const enemySkillIndex = new Map(ENEMY_SKILLS.map(s => [s.id, s]));
export function getEnemySkill(id: string): SkillDefinition | undefined {
  return enemySkillIndex.get(id);
}

const enemyActionIndex = new Map<string, ActionDefinition>();
for (const s of ENEMY_SKILLS) for (const a of s.actions) enemyActionIndex.set(a.id, a);

export const ENEMY_ACTIONS: ActionDefinition[] = [...enemyActionIndex.values()];
export function getEnemyAction(id: string): ActionDefinition | undefined {
  return enemyActionIndex.get(id);
}

/** Enemy actions a skill makes available at or below the given level. */
export function unlockedEnemyActions(skillId: string, level: number): ActionDefinition[] {
  const s = enemySkillIndex.get(skillId);
  return s ? s.actions.filter(a => a.unlockLevel <= level) : [];
}

/** Register enemy-skill-specific effect handlers (co-located on each enemy's
 *  SkillDefinition, like player skills) onto a registry. Call after
 *  `createRegistry()` when enemies will fight. */
export function registerEnemySkills(registry: EffectRegistry): void {
  for (const skill of ENEMY_SKILLS) {
    for (const [type, handler] of Object.entries(skill.effects ?? {})) {
      registry.register(type, handler);
    }
  }
}
