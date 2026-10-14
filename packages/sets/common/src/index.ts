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
export { ACROBACIA } from './skills/acrobacia.js';
export { ARTIFEX } from './skills/artifex.js';
export { WEAPONS, needsWeapon, kitNeedsWeapon, weaponFor } from './equipment.js';

/** Shared cards the AI cannot play by construction, with why — each set that
 *  fields them spreads this into its calibration's `aiBlindCards`. */
export const COMMON_AI_BLIND_CARDS: Readonly<Record<string, string>> = {
  'guardia-camaleo': 'grants post-reveal card swaps. The AI commits blind and never '
    + 'swaps, so the card is worth exactly nothing to it and everything to a player '
    + 'who can see the reveal. Its own handler already says so (aiWeight 0.2).',
};

import { MESTRE_ARMES } from './skills/esgrima.js';
import { ACROBACIA } from './skills/acrobacia.js';
import { ARTIFEX } from './skills/artifex.js';
import type { SkillDefinition } from './types.js';

export const COMMON_SKILLS: readonly SkillDefinition[] = [MESTRE_ARMES, ACROBACIA, ARTIFEX];
