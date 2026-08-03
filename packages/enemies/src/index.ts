import { Character } from '@pimpampum/engine';
import { getEnemy } from './catalog.js';
import { createEnemyFrom } from './factory.js';
import { SolvedEncounter } from './simulate.js';

export {
  ENEMY_DEFINITIONS, getEnemy,
  ENEMY_SKILLS, getEnemySkill, ENEMY_ACTIONS, getEnemyAction, unlockedEnemyActions,
  registerEnemySkills,
} from './catalog.js';
export { createEnemyFrom, createEnemy } from './factory.js';
export type { EnemySpec } from './factory.js';
export { fullKitLevel, ICON } from './types.js';
export type { EnemyDefinition } from './types.js';

// --- Encounter balancer: the difficulty of an encounter is MEASURED by
// simulating it, not predicted from fitted per-creature scalars.
export {
  solveEncounter, generateEncounter, simulateEncounter, buildComposition,
  TARGET_WINRATES, PV_MIN, PV_MAX, DEFAULT_MAX_AVG_ROUNDS,
} from './simulate.js';
export { leanChooser, isPolicyTrained } from './ai-policy.js';
export type {
  PoolSpec, SolvedGroup, SolvedEncounter, EncounterDifficulty, FieldedGroup,
  SimOptions, SimResult, SolveOptions,
} from './simulate.js';

/** Instantiate every enemy of a balancer-solved encounter. */
export function buildSolvedEncounter(solved: SolvedEncounter): Character[] {
  const enemies: Character[] = [];
  for (const g of solved.groups) {
    const def = getEnemy(g.enemyId);
    if (!def) continue;
    for (let i = 0; i < g.count; i++) {
      const name = g.count > 1 ? `${def.displayName} ${i + 1}` : def.displayName;
      enemies.push(createEnemyFrom(def, { pv: g.pv, level: g.level, name }));
    }
  }
  return enemies;
}
