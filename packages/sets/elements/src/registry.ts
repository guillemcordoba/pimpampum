import { EffectRegistry } from '@pimpampum/engine';
import { registerSkills } from './players/setup.js';
import { registerEnemySkills } from './enemies/catalog.js';

/**
 * Every handler this set's cards can reach — player AND enemy — on a fresh
 * registry.
 *
 * One function, because there is one game. Player and enemy content used to be
 * two packages, which made "build a registry" two calls, and forgetting the
 * second one was silent: enemy cards resolved to nothing and every fight priced
 * as trivial, with no error anywhere. That footgun was a non-negotiable in
 * CLAUDE.md for as long as it existed. It exists no longer.
 */
export function createRegistry(): EffectRegistry {
  const registry = new EffectRegistry();
  registerSkills(registry);
  registerEnemySkills(registry);
  return registry;
}
