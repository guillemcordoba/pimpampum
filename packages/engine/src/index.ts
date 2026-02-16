export { DiceRoll } from './dice.js';
export { Equipment, EquipmentSlot, createArmaduraDeFerro, createCotaDeMalla, createArmaduraDeCuir, createBracalsDeCuir, ALL_EQUIPMENT } from './equipment.js';
export type { EquipmentTemplate } from './equipment.js';
export { Card, CardType, isAttack, isDefense, isFocus, isPhysical, EFFECT_NONE, getCardTargetRequirement, getCardTargetCount } from './card.js';
export type { SpecialEffect, TargetRequirement } from './card.js';
export { CombatModifier, ModifierDuration } from './modifier.js';
export { Character, createCharacter } from './character.js';
export type { CharacterTemplate, DefenseBonus } from './character.js';
export {
  createFighter, createWizard, createRogue, createBarbarian, createCleric, createMonk,
  createGoblin, createGoblinShaman, createBasilisk,
  createSpinedDevil, createBoneDevil, createHornedDevil,
  ALL_CHARACTER_TEMPLATES, PLAYER_TEMPLATES, ENEMY_TEMPLATES, CARD_ICONS,
  FIGHTER_TEMPLATE, ROGUE_TEMPLATE, WIZARD_TEMPLATE, BARBARIAN_TEMPLATE,
  CLERIC_TEMPLATE, MONK_TEMPLATE, GOBLIN_TEMPLATE, GOBLIN_SHAMAN_TEMPLATE, BASILISK_TEMPLATE,
  SPINED_DEVIL_TEMPLATE, BONE_DEVIL_TEMPLATE, HORNED_DEVIL_TEMPLATE,
} from './characters/index.js';
export { CombatEngine, newCombatStats, mergeCombatStats } from './combat.js';
export type { LogEntry, CardStats, CombatStats, CardSelection, PlannedAction } from './combat.js';
export { selectCardAI, assignStrategies } from './ai.js';
export type { AIEngineView } from './ai.js';
export { AIStrategy } from './strategy.js';
export type { StrategyStats } from './strategy.js';
export { CARD_TYPE_DISPLAY_NAMES, CARD_TYPE_CSS, STAT_ICONS, STAT_DISPLAY_NAMES, RULES_SUMMARY } from './display.js';
export type { RulesSection } from './display.js';
