import { EffectRegistry } from '@pimpampum/engine';
import { COMMON_EFFECTS } from '@pimpampum/set-common';
import { GENERIC_EFFECTS } from './generic.js';

/** Register the set's generic, parameterised handlers, and the ones shared
 *  with other sets (@pimpampum/set-common: weapons, fatigue costs…). Each
 *  skill's own handlers live on its SkillDefinition and are registered by
 *  `registerSkills`. */
export function registerAllEffects(registry: EffectRegistry): void {
  for (const [type, handler] of Object.entries({ ...GENERIC_EFFECTS, ...COMMON_EFFECTS })) registry.register(type, handler);
}
