import { EffectRegistry } from '@pimpampum/engine';
import { registerAllEffects } from './effects/index.js';
import { registeredSkills } from './catalog.js';

/** Register the generic effect handlers plus every PLAYER skill's own
 *  handlers onto a registry — half of `createRegistry` (`../registry.ts`). (Status behaviours need no registration — handlers attach them
 *  to the status instances they set.) */
export function registerSkills(registry: EffectRegistry): void {
  registerAllEffects(registry);
  for (const skill of registeredSkills()) {
    for (const [type, handler] of Object.entries(skill.effects ?? {})) {
      registry.register(type, handler);
    }
  }
}
