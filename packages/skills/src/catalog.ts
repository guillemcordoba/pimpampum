import { ActionDefinition } from '@pimpampum/engine';
import { SkillDefinition } from './types.js';
import { ENGINYER_EXPLOSIUS } from './skills/explosives-engineer.js';
import { MESTRE_ARMES } from './skills/weapon-master.js';
import { NIGROMANT } from './skills/nigromant.js';
import { FURIA } from './skills/furia.js';
import { METGE } from './skills/metge.js';
import { RUNES } from './skills/runes.js';
import { OMBRES } from './skills/ombres.js';
import { GEL } from './skills/gel.js';

/** Every player skill. Enemy skills live in @pimpampum/enemies. */
export const ALL_SKILLS: SkillDefinition[] = [
  ENGINYER_EXPLOSIUS,
  MESTRE_ARMES,
  NIGROMANT,
  FURIA,
  METGE,
  RUNES,
  OMBRES,
  GEL,
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
