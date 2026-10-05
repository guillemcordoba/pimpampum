import { EffectRegistry } from '@pimpampum/engine';
import { GENERIC_EFFECTS } from './generic.js';

/** Register the set's generic, parameterised handlers. Each skill's own
 *  handlers live on its SkillDefinition and are registered by `registerSkills`. */
export function registerAllEffects(registry: EffectRegistry): void {
  for (const [type, handler] of Object.entries(GENERIC_EFFECTS)) registry.register(type, handler);
}
