import { EffectRegistry, EffectHandler } from '@pimpampum/engine';
import { ATTACK_EFFECTS } from './attack-effects.js';
import { FOCUS_EFFECTS } from './focus-effects.js';
import { DEFENSE_EFFECTS } from './defense-effects.js';
import { WEAPON_EFFECTS } from './weapon-effects.js';

/**
 * Generic, parameterised effect handlers shared across skills, keyed by the
 * effect `type` referenced from action definitions. Effects that pertain to a
 * single skill live on that skill's SkillDefinition (`effects` /
 * `statusBehaviors`) in `skills/*.ts` and are registered by `registerSkills`.
 */
export const ALL_EFFECTS: Record<string, EffectHandler> = {
  ...ATTACK_EFFECTS,
  ...FOCUS_EFFECTS,
  ...DEFENSE_EFFECTS,
  ...WEAPON_EFFECTS,
};

/** Register the generic effect handlers on an EffectRegistry. */
export function registerAllEffects(registry: EffectRegistry): void {
  for (const [type, handler] of Object.entries(ALL_EFFECTS)) {
    registry.register(type, handler);
  }
}

export const EFFECT_TYPES = Object.keys(ALL_EFFECTS);
