import { ActionDefinition } from '@pimpampum/engine';
import { SkillDefinition } from './types.js';
import { ENGINYER_EXPLOSIUS } from './skills/explosives-engineer.js';
import { MESTRE_ARMES } from './skills/weapon-master.js';
import { NIGROMANT } from './skills/nigromant.js';
import { BERSERK } from './skills/berserk.js';
import { METGE } from './skills/metge.js';
import { RUNES } from './skills/runes.js';
import { OMBRES } from './skills/ombres.js';
import { GEL } from './skills/gel.js';
import { EARTHBENDER } from './skills/earthbender.js';
import { VOLCANIC } from './skills/volcanic.js';

/** Every player skill. Enemy skills live in @pimpampum/enemies. */
export const ALL_SKILLS: SkillDefinition[] = [
  ENGINYER_EXPLOSIUS,
  MESTRE_ARMES,
  NIGROMANT,
  BERSERK,
  METGE,
  RUNES,
  OMBRES,
  GEL,
  EARTHBENDER,
  VOLCANIC,
];

export const PLAYER_SKILLS = ALL_SKILLS;

const skillIndex = new Map(ALL_SKILLS.map(s => [s.id, s]));
export function getSkill(id: string): SkillDefinition | undefined {
  return skillIndex.get(id);
}

const actionIndex = new Map<string, ActionDefinition>();
for (const s of ALL_SKILLS) for (const a of s.actions) actionIndex.set(a.id, a);

/** Every action across all skills. */
export const ALL_ACTIONS: ActionDefinition[] = [...actionIndex.values()];
export function getAction(id: string): ActionDefinition | undefined {
  return actionIndex.get(id);
}

/** Actions a skill makes available at or below the given level. */
export function unlockedActions(skillId: string, level: number): ActionDefinition[] {
  const s = skillIndex.get(skillId);
  return s ? s.actions.filter(a => a.unlockLevel <= level) : [];
}

/**
 * Add a skill at runtime, and remove it again.
 *
 * ALL_SKILLS is an array but the lookups are MAPS built from it at module load,
 * so pushing onto the array reaches `MAIN_KITS` and `cardsOf` while leaving
 * `unlockedActions` and `getAction` blind to it. A character built from such a
 * skill comes out holding nothing but Cop desesperat, and every measurement
 * taken of it is a measurement of an empty hand — silently, with plausible
 * numbers. That is how the first run of the requirement controls "found" that
 * a 1d6→7d6 ladder buys no gain.
 *
 * Exported for CONTROL KITS (`simulator/bench/control-kits.ts`): subjects whose
 * verdict is known by construction, used to check that a requirement reports
 * the known thing. Production content belongs in ALL_SKILLS above, statically.
 */
export function registerSkill(def: SkillDefinition): void {
  if (!ALL_SKILLS.includes(def)) ALL_SKILLS.push(def);
  skillIndex.set(def.id, def);
  for (const a of def.actions) actionIndex.set(a.id, a);
}

export function unregisterSkill(def: SkillDefinition): void {
  const i = ALL_SKILLS.indexOf(def);
  if (i >= 0) ALL_SKILLS.splice(i, 1);
  skillIndex.delete(def.id);
  for (const a of def.actions) actionIndex.delete(a.id);
}
