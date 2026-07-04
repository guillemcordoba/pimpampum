import { EffectRegistry } from '@pimpampum/engine';
import { registerAllEffects } from './effects/index.js';
import { ALL_SKILLS } from './catalog.js';

/** Register the generic effect handlers plus every skill's own handlers and
 *  status behaviours onto a registry. */
export function registerSkills(registry: EffectRegistry): void {
  registerAllEffects(registry);
  for (const skill of ALL_SKILLS) {
    for (const [type, handler] of Object.entries(skill.effects ?? {})) {
      registry.register(type, handler);
    }
    for (const [key, behavior] of Object.entries(skill.statusBehaviors ?? {})) {
      registry.registerStatus(key, behavior);
    }
  }
}

/** Create a fresh registry with all skill effects registered. */
export function createRegistry(): EffectRegistry {
  const registry = new EffectRegistry();
  registerSkills(registry);
  return registry;
}
