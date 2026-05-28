import { DiceRoll } from './dice.js';
import { Character } from './character.js';
import { ActionDefinition, TargetRequirement } from './types.js';

/**
 * The slice of the combat engine that effect handlers are allowed to touch.
 * Implemented by CombatEngine and passed to handlers via EffectContext so that
 * content (the skills package) never imports the engine internals directly.
 */
export interface EngineApi {
  /** Current round number (1-based). */
  readonly round: number;

  /** Append a line to the combat log. `kind` drives colour/category in the UI. */
  log(kind: string, message: string, team?: number): void;

  /** Team index (0 or 1) the character belongs to. */
  teamOf(c: Character): number;
  /** Living members of a team. */
  livingTeam(team: number): Character[];
  /** Living allies of `c` (excludes self unless includeSelf). */
  alliesOf(c: Character, includeSelf?: boolean): Character[];
  /** Living enemies of `c`. */
  enemiesOf(c: Character): Character[];

  /**
   * Subtract `amount` PV from `target` (already post-armour). Returns true if the
   * target died. Records the hit for focus-interruption / stats bookkeeping.
   */
  applyPvLoss(target: Character, amount: number, source?: Character): boolean;
  /** Restore up to `amount` PV (capped at maxPV). Can revive a downed ally. */
  heal(target: Character, amount: number): void;

  /**
   * Perform an extra attack outside the normal turn order (action surge, summons,
   * counter-attacks). Resolves against the target's active defense if any.
   */
  performExtraAttack(source: Character, target: Character, damageDice: DiceRoll, opts?: { skillId?: string; rollBonus?: number; ignoreArmor?: boolean; label?: string }): void;

  /** Add a freshly created combatant to a team mid-combat (summons). */
  addCombatant(team: number, c: Character): void;

  /** Roll a d20 (exposed so handlers stay deterministic with engine RNG hooks). */
  rollD20(): number;
}

/** Mutable bundle gathered before an attack resolves; effects tweak it in place. */
export interface AttackModifiers {
  /** Added to the attacker's d20 + skill roll. */
  rollBonus: number;
  /** Skip the target's passive armour entirely. */
  ignoreArmor: boolean;
  /** Flat extra PV damage on a hit (after armour). */
  bonusDamage: number;
  /** Extra damage dice rolled and added to the base damage on a hit. */
  extraDamageDice: DiceRoll[];
}

export function newAttackModifiers(): AttackModifiers {
  return { rollBonus: 0, ignoreArmor: false, bonusDamage: 0, extraDamageDice: [] };
}

/** Context handed to an effect handler hook. Fields are populated per-hook. */
export interface EffectContext {
  engine: EngineApi;
  /** The character performing the action carrying this effect. */
  source: Character;
  action: ActionDefinition;
  /** This effect's params (from the ActionEffect). */
  params: Record<string, unknown>;
  /** Targets selected for the action (attack target, defended ally, etc.). */
  targets: Character[];
  /** Single relevant opponent for onAttackHit/onAttackMiss/onDefend. */
  target?: Character;
  /** Whether the triggering attack hit. */
  hit?: boolean;
  /** Post-armour PV damage the triggering attack dealt. */
  damageDealt?: number;
  /** Attacker-perspective margin of the triggering roll. */
  margin?: number;
  /** Mutable attack modifiers, present only during the modifyAttack hook. */
  attackMods?: AttackModifiers;
}

/** Lightweight view passed to an effect's AI weight hint (no combat mutation). */
export interface AIContext {
  registry: EffectRegistry;
  round: number;
  actor: Character;
  /** Living allies, excluding self. */
  allies: Character[];
  /** Living enemies. */
  enemies: Character[];
  action: ActionDefinition;
  params: Record<string, unknown>;
}

/**
 * Behaviour for one effect `type`. Every hook is optional; the engine calls the
 * ones relevant to the action kind and resolution phase.
 */
export interface EffectHandler {
  /** Focus/defense action body, run when the action resolves in speed order. */
  onResolve?(ctx: EffectContext): void;
  /** Adjust an in-flight attack before it is rolled (piercing, smite, pack…). */
  modifyAttack?(ctx: EffectContext): void;
  /** Attack rider after the attack lands. */
  onAttackHit?(ctx: EffectContext): void;
  /** Attack rider after the attack misses. */
  onAttackMiss?(ctx: EffectContext): void;
  /** A defense action successfully blocked an incoming attack (counter/retaliate). */
  onDefend?(ctx: EffectContext): void;
  /** A defense action failed to block — the defender takes damage (berserker rage). */
  onBlockFail?(ctx: EffectContext): void;
  /** Coordinated end-of-round step (e.g. Nimble Escape group bonus). */
  postRound?(ctx: EffectContext): void;
  /** Targeting requirement for an action carrying this effect. */
  getTargetRequirement?(params: Record<string, unknown>): TargetRequirement;
  /** Additive contribution to the AI's weight for selecting this action. */
  aiWeight?(ctx: AIContext): number;
}

/** Registry mapping effect type keys to their handlers. */
export class EffectRegistry {
  private handlers = new Map<string, EffectHandler>();

  register(effectType: string, handler: EffectHandler): void {
    if (this.handlers.has(effectType)) {
      throw new Error(`Effect handler already registered: ${effectType}`);
    }
    this.handlers.set(effectType, handler);
  }

  getHandler(effectType: string): EffectHandler | undefined {
    return this.handlers.get(effectType);
  }

  has(effectType: string): boolean {
    return this.handlers.has(effectType);
  }
}
