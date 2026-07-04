import { EffectRegistry } from '@pimpampum/engine';
import { registerAllEffects } from './effects/index.js';
import { ALL_SKILLS } from './catalog.js';

/** Register the generic effect handlers plus every skill's own handlers onto
 *  a registry. (Status behaviours need no registration — handlers attach them
 *  to the status instances they set.) */
export function registerSkills(registry: EffectRegistry): void {
  registerAllEffects(registry);
  for (const skill of ALL_SKILLS) {
    for (const [type, handler] of Object.entries(skill.effects ?? {})) {
      registry.register(type, handler);
    }
  }
}

/** Create a fresh registry with all skill effects registered. */
export function createRegistry(): EffectRegistry {
  const registry = new EffectRegistry();
  registerSkills(registry);
  return registry;
}
