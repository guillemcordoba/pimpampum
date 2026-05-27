import { EffectRegistry } from '@pimpampum/engine';
import { registerAllEffects } from './effects/index.js';

/** Register all skill effect handlers onto a registry. */
export function registerSkills(registry: EffectRegistry): void {
  registerAllEffects(registry);
}

/** Create a fresh registry with all skill effects registered. */
export function createRegistry(): EffectRegistry {
  const registry = new EffectRegistry();
  registerSkills(registry);
  return registry;
}
