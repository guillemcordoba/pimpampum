// Dice
export { diceDistribution, expectedExcess } from './dice.js';
export { DiceRoll, rollDie } from './dice.js';
export { random, setRng, seededRng, withSeed } from './rng.js';


// Core types
export { ActionType, EquipmentSlot, isAttack, isDefenseAction } from './types.js';
export type {
  SkillInstance, ActionEffect, ActionDefinition, RollBonus,
  EquipmentDefinition, TargetRequirement,
} from './types.js';

// Resolution math
export { skillLevelBonus, resolveAttack, resolveDamage, checkSkillUp, SKILL_UP_MARGIN } from './resolution.js';

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
export { Character, createCharacter } from './character.js';
export type { StatusEntry, Guard, CreateCharacterOptions } from './character.js';

// Combat engine
export { CombatEngine, newCombatStats, mergeCombatStats } from './combat.js';
export type {
  LogEntry, TargetRef, ActionSelection, CombatResult, CombatStats, CombatEngineOptions, ActionChooser, TargetChooser,
  RevealedAction, TargetPrompt, StepResult, RoundPrep,
} from './combat.js';

// The POLICY SEAM. The engine exposes the view and the legality rules; the
// decision itself comes from an injected chooser (see CombatEngineOptions).
// @pimpampum/ai supplies one. There is no AI in this package.
export { canPlayAction, availableActionIndices, setAIControlled, firstLegalChooser } from './policy.js';
export type { AIView, PlannedAction, PendingSummary } from './policy.js';


// Display constants
export { ACTION_TYPE_DISPLAY_NAMES, ACTION_TYPE_CSS, STAT_ICONS, RULES_SUMMARY } from './display.js';
export type { RulesSection } from './display.js';

// Fatigue (DM-assigned level, −1 per level on every roll)
export { FATIGUE_MAX_LEVEL, FATIGUE_LEVEL_NAMES, clampFatigue, fatigueRollPenalty, fatigueStateName } from './fatigue.js';
