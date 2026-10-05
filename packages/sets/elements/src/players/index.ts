// Skills + actions
export {
  ALL_SKILLS, getSkill, getAction, unlockedActions, registerSkill, unregisterSkill,
} from './catalog.js';
export type { SkillDefinition } from './types.js';
export { action, d, ICON_PREFIX } from './types.js';

// Equipment
export { ALL_EQUIPMENT, getEquipment, standardGear } from './equipment.js';

// The universal desperation fallback (always in every hand)
export { COP_DESESPERAT } from './desperation.js';

// Character building
export { buildCharacter } from './build.js';
export type { CharacterBuildSpec } from './build.js';

// Reference party generation (the balancer's player-side input)
export {
  buildReferenceParty, buildReferencePlayer, isExplicitParty,
  PLAYER_PV, COMPLEMENTARY_SKILLS,
} from './party.js';
export type { PartySpec, DrawnPartySpec, ExplicitPartySpec } from './party.js';
