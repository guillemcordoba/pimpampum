import { ActionDefinition, EffectRegistry } from '@pimpampum/engine';
import { SkillDefinition } from '../players/types.js';
import { EnemyDefinition } from './types.js';
import { SOLDAT_DEL_FOC } from './creatures/soldat-del-foc.js';
import { ARQUER_DE_LA_MURALLA } from './creatures/arquer-de-la-muralla.js';
import { AGENT_DE_PEDRA } from './creatures/agent-de-pedra.js';
import { ACROBATA_DEL_CHI } from './creatures/acrobata-del-chi.js';
import { ARTILLER_DEL_TERCER_ULL } from './creatures/artiller-del-tercer-ull.js';
import { SHIRSHU } from './creatures/shirshu.js';
import { TITELLAIRE_DE_SANG } from './creatures/titellaire-de-sang.js';
import { KOH } from './creatures/koh.js';
import { SERP_DE_LES_MAREES } from './creatures/serp-de-les-marees.js';
import { ROSTRE_DE_L_EMPENTA } from './creatures/rostre-de-l-empenta.js';
import { ROSTRE_DE_FERRO } from './creatures/rostre-de-ferro.js';
import { ROSTRE_DE_L_ANIMA } from './creatures/rostre-de-l-anima.js';
import { ROSTRE_DE_LES_BESTIES } from './creatures/rostre-de-les-besties.js';
import { BESTIA_DE_LA_POR } from './creatures/bestia-de-la-por.js';
import { ROSTRE_FAMOLENC } from './creatures/rostre-famolenc.js';
import { ROSTRE_DE_L_INFERN } from './creatures/rostre-de-l-infern.js';
import { SENYOR_DE_LA_POR } from './creatures/senyor-de-la-por.js';

// Every creature, in display order. Add a new enemy by creating a file in
// `enemies/` and listing its definition here.
export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
  SOLDAT_DEL_FOC, ARQUER_DE_LA_MURALLA, AGENT_DE_PEDRA, ACROBATA_DEL_CHI,
  ARTILLER_DEL_TERCER_ULL, SHIRSHU, TITELLAIRE_DE_SANG, KOH, SERP_DE_LES_MAREES,
  // El Senyor de la Por and his six bodies; the beast is only ever summoned.
  ROSTRE_DE_L_EMPENTA, ROSTRE_DE_FERRO, ROSTRE_DE_L_ANIMA, ROSTRE_DE_LES_BESTIES,
  ROSTRE_FAMOLENC, ROSTRE_DE_L_INFERN, SENYOR_DE_LA_POR, BESTIA_DE_LA_POR,
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
