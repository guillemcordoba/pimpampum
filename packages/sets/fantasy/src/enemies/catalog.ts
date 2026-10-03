import { ActionDefinition, EffectRegistry } from '@pimpampum/engine';
import { SkillDefinition } from '../players/types.js';
import { EnemyDefinition } from './types.js';
import { GOBLIN } from './creatures/goblin.js';
import { GOBLIN_SHAMAN } from './creatures/goblin-shaman.js';
import { WOLF } from './creatures/wolf.js';
import { SPINED_DEVIL } from './creatures/spined-devil.js';
import { BONE_DEVIL } from './creatures/bone-devil.js';
import { STONE_GOLEM } from './creatures/stone-golem.js';
import { HORNED_DEVIL } from './creatures/horned-devil.js';
import { BASILISK } from './creatures/basilisk.js';

// Every creature, in display order. Add a new enemy by creating a file in
// `enemies/` and listing its definition here.
export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
  GOBLIN, GOBLIN_SHAMAN, WOLF, SPINED_DEVIL,
  BONE_DEVIL, STONE_GOLEM, HORNED_DEVIL, BASILISK,
];

const enemyIndex = new Map(ENEMY_DEFINITIONS.map(e => [e.id, e]));
export function getEnemy(id: string): EnemyDefinition | undefined {
  return enemyIndex.get(id);
}

// Enemy skills are kept apart from ALL_SKILLS so they only surface in the enemy
// section of the app. They reuse the generic SkillDefinition/action helpers and
// the generic effect handlers.
export const ENEMY_SKILLS: SkillDefinition[] = ENEMY_DEFINITIONS.flatMap(e => e.skills);

const enemySkillIndex = new Map(ENEMY_SKILLS.map(s => [s.id, s]));

const enemyActionIndex = new Map<string, ActionDefinition>();
for (const s of ENEMY_SKILLS) for (const a of s.actions) enemyActionIndex.set(a.id, a);


/** Enemy actions a skill makes available at or below the given level. */
export function unlockedEnemyActions(skillId: string, level: number): ActionDefinition[] {
  const s = enemySkillIndex.get(skillId);
  return s ? s.actions.filter(a => a.unlockLevel <= level) : [];
}

/** Register enemy-skill-specific effect handlers (co-located on each enemy's
 *  SkillDefinition, like player skills) onto a registry — half of
 *  `createRegistry` (`../registry.ts`). */
export function registerEnemySkills(registry: EffectRegistry): void {
  for (const skill of ENEMY_SKILLS) {
    for (const [type, handler] of Object.entries(skill.effects ?? {})) {
      registry.register(type, handler);
    }
  }
}
