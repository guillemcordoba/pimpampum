// Skills + actions
export {
  ALL_SKILLS, PLAYER_SKILLS, getSkill,
  ALL_ACTIONS, getAction, unlockedActions,
} from './catalog.js';
export type { SkillDefinition } from './types.js';
export { action, d, ICON_PREFIX } from './types.js';

// Shared cards (one card, several skills — see cards/index.ts)
export { standingWallAction } from './cards/index.js';

// Effects
export { registerAllEffects, ALL_EFFECTS, EFFECT_TYPES } from './effects/index.js';
export { maxCharges, EXPLOSIVE_SKILL_ID } from './skills/explosives-engineer.js';
export { getPressure, PRESSURE_STATUS, VOLCANIC_SKILL_ID } from './skills/volcanic.js';

// Equipment
export { ALL_EQUIPMENT, getEquipment } from './equipment/index.js';

// Potions (consumable, skill-less action cards)
export { ALL_POTIONS, getPotion } from './potions/index.js';

// The universal desperation fallback (always in every hand)
export { COP_DESESPERAT } from './desperation.js';

// Setup
export { registerSkills, createRegistry } from './setup.js';

// Character building
export { buildCharacter, buildSkillSum } from './build.js';
export type { CharacterBuildSpec } from './build.js';
