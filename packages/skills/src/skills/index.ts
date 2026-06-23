import { ActionDefinition } from '@pimpampum/engine';
import { SkillDefinition } from './skill-types.js';
import { MARTIAL_SKILLS } from './martial-skills.js';
import { ARCANE_SKILLS } from './arcane-skills.js';
import { DIVINE_NATURE_SKILLS } from './divine-nature-skills.js';
import { SOCIAL_SKILLS } from './social-skills.js';
import { EXPLOSIVE_SKILLS } from './explosive-skills.js';

export * from './skill-types.js';

/** Every player skill. Enemy skills live in @pimpampum/enemies. */
export const ALL_SKILLS: SkillDefinition[] = [
  ...MARTIAL_SKILLS,
  ...ARCANE_SKILLS,
  ...DIVINE_NATURE_SKILLS,
  ...SOCIAL_SKILLS,
  ...EXPLOSIVE_SKILLS,
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
