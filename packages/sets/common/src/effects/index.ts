import { EffectHandler } from '@pimpampum/engine';
import { WEAPON_EFFECTS } from './weapon.js';
import { DEFENSE_EFFECTS } from './defense.js';
import { FOCUS_EFFECTS } from './focus.js';
import { FATIGUE_EFFECTS } from './fatigue.js';

/**
 * Generic, parameterised effect handlers shared by several sets, keyed by the
 * effect `type` an action references. A set that fields any card using them
 * spreads this record into its own registry (one registry per set).
 */
export const COMMON_EFFECTS: Record<string, EffectHandler> = {
  ...WEAPON_EFFECTS,
  ...DEFENSE_EFFECTS,
  ...FOCUS_EFFECTS,
  ...FATIGUE_EFFECTS,
};
