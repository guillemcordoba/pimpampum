import { EffectHandler } from '@pimpampum/engine';
import { STANDING_WALL_EFFECTS } from './standing-wall.js';

/**
 * SHARED CARDS: cards that appear in several skills' ladders (player or
 * enemy). Each card lives in its own file here — canonical name, description,
 * stats, effect handler and StatusBehaviors together — and exposes a factory
 * (`<card>Action(...)`) that skills call to stamp their own instance (their
 * skillId + unlock ordinal). Handlers are registered ONCE, with the generic
 * effects; instances must NOT redeclare them on SkillDefinition.effects.
 */
export const SHARED_CARD_EFFECTS: Record<string, EffectHandler> = {
  ...STANDING_WALL_EFFECTS,
};

export { standingWallAction } from './standing-wall.js';
