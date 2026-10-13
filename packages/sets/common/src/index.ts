/**
 * CONTENT SHARED BY SEVERAL SETS — browser-safe, like each set's root.
 *
 * The skill-definition builders every set writes its kits with, the generic
 * parameterised handlers more than one set's cards call, and the skills more
 * than one set may field. A set lists the skills it fields in its own catalogue
 * and spreads `COMMON_EFFECTS` into its own registry; nothing here registers
 * itself anywhere.
 */
export type { SkillDefinition } from './types.js';
export { action, d, ICON_PREFIX } from './types.js';
export * from './effects/helpers.js';
export { COMMON_EFFECTS } from './effects/index.js';
export { MESTRE_ARMES } from './skills/esgrima.js';

import { MESTRE_ARMES } from './skills/esgrima.js';
import type { SkillDefinition } from './types.js';

export const COMMON_SKILLS: readonly SkillDefinition[] = [MESTRE_ARMES];
