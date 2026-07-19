// Dice
export { DiceRoll, rollDie } from './dice.js';

// Core types
export { ActionType, EquipmentSlot, isAttack, isDefenseAction, isFocusAction } from './types.js';
export type {
  SkillInstance, ActionEffect, ActionDefinition, RollBonus,
  EquipmentDefinition, CharacterDefinition, TargetRequirement,
} from './types.js';

// Resolution math
export { resolveAttack, resolveDamage, checkSkillUp, SKILL_UP_MARGIN } from './resolution.js';

// Effects registry
export { EffectRegistry, newAttackModifiers } from './effects.js';
export type { EngineApi, EffectContext, EffectHandler, AttackModifiers, AIContext, ActionEvent } from './effects.js';

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
export { selectAction, pickResolveTargets, assignStrategies, availableActionIndices } from './ai.js';
export type { AIView, PlannedAction, PendingSummary } from './ai.js';

// Strategy
export { AIStrategy } from './strategy.js';
export type { StrategyStats } from './strategy.js';

// Display constants
export { ACTION_TYPE_DISPLAY_NAMES, ACTION_TYPE_CSS, STAT_ICONS, STAT_DISPLAY_NAMES, SLOT_LABELS, RULES_SUMMARY } from './display.js';
export type { RulesSection } from './display.js';

// Fatigue (daily stamina budget)
export { FATIGUE_ENABLED, FATIGUE_CONFIG, maxFatigue, fatigueStateName } from './fatigue.js';
