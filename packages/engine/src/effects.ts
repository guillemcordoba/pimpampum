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
  /** EVERY combatant ever fielded on `c`'s side, dead or alive (participation
   *  caps, memorials). Includes mid-combat additions. */
  rosterOf(c: Character): Character[];
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
   * counter-attacks) with the given attack dice. Resolves against the target's
   * active defense if any; the damage is the margin (minus armour). A blocked
   * source is NOT re-forced here — the scripted target stands.
   */
  performExtraAttack(source: Character, target: Character, dice: DiceRoll, opts?: { skillId?: string; rollBonus?: number; ignoreArmor?: boolean; label?: string }): void;

  /** Add a freshly created combatant to a team mid-combat (summons). */
  addCombatant(team: number, c: Character): void;

  /** Roll one die (1..sides) — generic chance checks for content. */
  rollDie(sides: number): number;
  /** Roll contest dice for `c`, honouring any status-imposed roll mode
   *  (advantage/disadvantage roll the whole pool twice, keep best/worst;
   *  disadvantage wins conflicts). `dice` undefined rolls 0. Pass the contest
   *  kind ('attack'/'defense'/'save') so kind-scoped stances apply; omit for
   *  uncontexted rolls. Route content-side contests (saves, heals) through
   *  this. */
  rollContestDice(c: Character, dice: DiceRoll | undefined, kind?: import('./status.js').ContestKind): number;
  /** Cancel a still-pending (not yet resolved) action by `target` this round.
   *  Returns true if an action was cancelled (i.e. it hadn't resolved yet). */
  cancelPendingAction(target: Character): boolean;
  /** Run the holder's modifyContestTotal status hooks over a contested dice
   *  total, seeing the opposing total. Content-side contests (saves) should
   *  route their totals through this so clutch statuses can fire there too. */
  adjustContestTotal(holder: Character, own: number, opposing: number, kind: import('./status.js').ContestKind): number;
}

/** Mutable bundle gathered before an attack resolves; effects tweak it in place. */
export interface AttackModifiers {
  /** Added to the attacker's dice total. */
  rollBonus: number;
  /** Skip the target's passive armour entirely. */
  ignoreArmor: boolean;
  /** Treat the target as undefended — ignore any active guard (feints). */
  ignoreDefense: boolean;
  /** Skip this target entirely — no roll, no damage (e.g. an attack that only
   *  strikes marked targets passes over everyone else). */
  skip: boolean;
  /** Flat extra PV damage on a hit, added AFTER armour (not part of the
   *  contest total). */
  bonusDamage: number;
  /** Extra dice rolled (once, flat) into the ATTACK TOTAL — they raise both
   *  the hit chance and the margin damage. */
  extraDamageDice: DiceRoll[];
}

export function newAttackModifiers(): AttackModifiers {
  return { rollBonus: 0, ignoreArmor: false, ignoreDefense: false, skip: false, bonusDamage: 0, extraDamageDice: [] };
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
  /** Attacker-perspective margin (attack total − defense total; equals the
   *  full attack total when undefended). */
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
  /** A defense action failed to block — the defender takes damage. */
  onBlockFail?(ctx: EffectContext): void;
  /** Coordinated end-of-round step for actions played this round (see
   *  StatusBehavior.onRoundEnd for hooks that run regardless of the action). */
  postRound?(ctx: EffectContext): void;
  /** Targeting requirement for an action carrying this effect. */
  getTargetRequirement?(params: Record<string, unknown>): TargetRequirement;
  /** Additive contribution to the AI's weight for selecting this action. */
  aiWeight?(ctx: AIContext): number;
  /** Run once per combatant at the start of combat (initialise resources/pools). */
  onCombatStart?(ctx: EffectContext): void;
  /** Availability gate: return false to make the action unplayable this round
   *  (e.g. an exhausted resource). Lightweight — no engine mutation. */
  canPlay?(actor: Character, params: Record<string, unknown>): boolean;
  /** Run once when the action actually goes off, before it resolves (spend
   *  resources). Not called for an interrupted focus. */
  onPlay?(ctx: EffectContext): void;
}

/** Registry mapping effect type keys to their handlers. (Status behaviours
 *  need no registry — they are attached to the status instance by whoever
 *  sets it; see StatusBehavior.) */
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
