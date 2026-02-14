import type { CharacterTemplate } from '../character.js';
import { createCharacter } from '../character.js';
import { FIGHTER_TEMPLATE } from './fighter.js';
import { ROGUE_TEMPLATE } from './rogue.js';
import { WIZARD_TEMPLATE } from './wizard.js';
import { BARBARIAN_TEMPLATE } from './barbarian.js';
import { CLERIC_TEMPLATE } from './cleric.js';
import { GOBLIN_TEMPLATE } from './goblin.js';
import { GOBLIN_SHAMAN_TEMPLATE } from './goblin-shaman.js';
import { BASILISK_TEMPLATE } from './basilisk.js';

export { FIGHTER_TEMPLATE } from './fighter.js';
export { ROGUE_TEMPLATE } from './rogue.js';
export { WIZARD_TEMPLATE } from './wizard.js';
export { BARBARIAN_TEMPLATE } from './barbarian.js';
export { CLERIC_TEMPLATE } from './cleric.js';
export { GOBLIN_TEMPLATE } from './goblin.js';
export { GOBLIN_SHAMAN_TEMPLATE } from './goblin-shaman.js';
export { BASILISK_TEMPLATE } from './basilisk.js';

export const ALL_CHARACTER_TEMPLATES: CharacterTemplate[] = [
  FIGHTER_TEMPLATE,
  ROGUE_TEMPLATE,
  WIZARD_TEMPLATE,
  BARBARIAN_TEMPLATE,
  CLERIC_TEMPLATE,
  GOBLIN_TEMPLATE,
  GOBLIN_SHAMAN_TEMPLATE,
  BASILISK_TEMPLATE,
];

export const PLAYER_TEMPLATES = ALL_CHARACTER_TEMPLATES.filter(t => t.category === 'player');
export const ENEMY_TEMPLATES = ALL_CHARACTER_TEMPLATES.filter(t => t.category === 'enemy');

/** Aggregated card icon map from all character templates */
export const CARD_ICONS: Record<string, string> = Object.assign(
  {},
  ...ALL_CHARACTER_TEMPLATES.map(t => t.cardIcons),
);

// Backward-compatible factory functions
export const createFighter = (name: string) => createCharacter(FIGHTER_TEMPLATE, name);
export const createRogue = (name: string) => createCharacter(ROGUE_TEMPLATE, name);
export const createWizard = (name: string) => createCharacter(WIZARD_TEMPLATE, name);
export const createBarbarian = (name: string) => createCharacter(BARBARIAN_TEMPLATE, name);
export const createCleric = (name: string) => createCharacter(CLERIC_TEMPLATE, name);
export const createGoblin = (name: string) => createCharacter(GOBLIN_TEMPLATE, name);
export const createGoblinShaman = (name: string) => createCharacter(GOBLIN_SHAMAN_TEMPLATE, name);
export const createBasilisk = (name: string) => createCharacter(BASILISK_TEMPLATE, name);
