// Dice
export { DiceRoll } from './dice.js';

// Core types
export { ActionType, EquipmentSlot, isAttack, isDefenseAction, isFocusAction } from './types.js';
export type {
  SkillInstance, ActionEffect, ActionDefinition, SkillBonus,
  EquipmentDefinition, CharacterDefinition, TargetRequirement,
} from './types.js';

// Resolution math
export { rollD20, resolveAttack, resolveDamage, checkSkillUp, rollAttackDamage } from './resolution.js';
export type { AttackOutcome } from './resolution.js';

// Effects registry
export { EffectRegistry, newAttackModifiers } from './effects.js';
export type { EngineApi, EffectContext, EffectHandler, AttackModifiers, AIContext } from './effects.js';

// Status behaviours
export type { StatusBehavior, StatusRef, StatusHookContext, AttackStatusMods, ContestKind } from './status.js';

// Actions
export { ActionInstance, getActionTargetRequirement, getActionTargetCount } from './action.js';

// Modifiers
export { CombatModifier, ModifierDuration } from './modifier.js';

// Characters
export { Character, createCharacter, characterSkillSum } from './character.js';
export type { StatusEntry, Guard, CreateCharacterOptions } from './character.js';

// Combat engine
export { CombatEngine, newCombatStats, mergeCombatStats } from './combat.js';
export type {
  LogEntry, TargetRef, ActionSelection, CombatResult, CombatStats, CombatEngineOptions,
  RevealedAction, TargetPrompt, StepResult, RoundPrep,
} from './combat.js';

// AI
export { selectAction, assignStrategies, availableActionIndices } from './ai.js';
export type { AIView, PlannedAction } from './ai.js';

// Strategy
export { AIStrategy } from './strategy.js';
export type { StrategyStats } from './strategy.js';

// Display constants
export { ACTION_TYPE_DISPLAY_NAMES, ACTION_TYPE_CSS, STAT_ICONS, STAT_DISPLAY_NAMES, SLOT_LABELS, RULES_SUMMARY } from './display.js';
export type { RulesSection } from './display.js';

// Fatigue
export {
  FATIGUE_TABLE, HEAL_DIVISOR, DEFAULT_FATIGUE_COST,
  fatigueTier, fatiguePenalty, fatigueStateName,
  shortRestFatigue, longRestFatigue,
} from './fatigue.js';
export type { FatigueTier } from './fatigue.js';

// Size
export {
  SIZE_TABLE, DEFAULT_SIZE, ALL_SIZES,
  sizePvModifier, sizeSpeedModifier, sizeName,
} from './size.js';
export type { CharacterSize, SizeSpec } from './size.js';
