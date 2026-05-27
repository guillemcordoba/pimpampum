import { EffectRegistry, EffectHandler } from '@pimpampum/engine';
import { ATTACK_EFFECTS } from './attack-effects.js';
import { FOCUS_EFFECTS } from './focus-effects.js';
import { DEFENSE_EFFECTS } from './defense-effects.js';

/** Every effect handler, keyed by the effect `type` referenced from action definitions. */
export const ALL_EFFECTS: Record<string, EffectHandler> = {
  ...ATTACK_EFFECTS,
  ...FOCUS_EFFECTS,
  ...DEFENSE_EFFECTS,
};

/** Register all skill effect handlers on an EffectRegistry. */
export function registerAllEffects(registry: EffectRegistry): void {
  for (const [type, handler] of Object.entries(ALL_EFFECTS)) {
    registry.register(type, handler);
  }
}

export const EFFECT_TYPES = Object.keys(ALL_EFFECTS);
