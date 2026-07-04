import type { Character, StatusEntry } from './character.js';
import type { ActionDefinition } from './types.js';
import type { EngineApi } from './effects.js';
import type { AIView } from './ai.js';

/**
 * Status behaviours: the second half of the content system. Where an
 * EffectHandler runs when its OWN action resolves, a StatusBehavior runs while
 * a status sits ON a character, intercepting rolls, damage, guards, targeting
 * and round flow at fixed generic seams. The behaviour is attached to the
 * status INSTANCE by whoever sets it — `setStatus(key, value, turns, data,
 * behavior)` — so the engine never knows a status by name and no registration
 * is needed. A status with no behaviour is inert bookkeeping.
 */

/** A status on its holder — the argument to every query hook. */
export interface StatusRef {
  holder: Character;
  key: string;
  entry: StatusEntry;
}

/** Query hooks get a StatusRef; engine-level hooks get this richer context. */
export interface StatusHookContext extends StatusRef {
  engine: EngineApi;
  /** onRoundEnd only: the action the holder had queued this round (even if it
   *  was cancelled mid-round), or null if they skipped / played nothing. */
  playedAction?: ActionDefinition | null;
}

/** Multipliers a status applies to the holder's attack action. */
export interface AttackStatusMods {
  /** Multiplies the attacker's d20 + skill total in guarded contests. */
  attackTotalMult?: number;
  /** Multiplies the rolled damage before armour. */
  damageMult?: number;
}

export interface StatusBehavior {
  // --- Query hooks: pure reads of the combat pipeline (they may still mutate
  // --- the holder, e.g. a one-shot bonus consuming itself). ------------------

  /** Added to the holder's effective action speed. */
  modifySpeed?(ref: StatusRef): number;
  /** Roll mode for every d20 the holder rolls: roll twice, keep worst / best.
   *  Disadvantage wins if several statuses disagree. */
  rollMode?(ref: StatusRef): 'advantage' | 'disadvantage' | void;
  /** Transform the holder's rolled damage on every attack (before armour). */
  modifyOutgoingDamage?(ref: StatusRef, damage: number): number;
  /** Transform damage the holder is about to receive (after armour; the
   *  engine floors the final result at 0). May consume the status. */
  modifyIncomingDamage?(ref: StatusRef, damage: number): number;
  /** Clamp a PV loss the holder is about to suffer (last stands, wards). */
  clampPvLoss?(ref: StatusRef, amount: number): number;
  /** Added to attack rolls made AGAINST the holder (marks, exposures). */
  attackRollAgainstHolder?(ref: StatusRef): number;
  /** The holder cannot benefit from any guard. */
  preventsGuard?(ref: StatusRef): boolean;
  /** Guarding with this status takes the full blow — no contest is rolled. */
  absorbsGuard?(ref: StatusRef): boolean;
  /** Post-reveal card-swap charges this status grants the holder. */
  cardSwapCharges?(ref: StatusRef): number;
  /** Spend one card-swap charge (clear the status when exhausted). */
  spendCardSwapCharge?(ref: StatusRef): void;
  /** AI: transform the base weight of a candidate action while the holder has
   *  this status (runs before per-effect aiWeight hints are added). */
  adjustActionWeight?(view: AIView, ref: StatusRef, action: ActionDefinition, weight: number): number;

  // --- Engine hooks: logic with RNG, logging and multi-character reach. ------

  /** The holder is executing an attack action (once per action, before the
   *  target loop). May mutate the entry (ladders). Multipliers from several
   *  statuses combine multiplicatively. */
  onAttackAction?(ctx: StatusHookContext): AttackStatusMods | void;
  /** Redirect one intended target of the holder's attack (scatter effects). */
  redirectAttackTarget?(ctx: StatusHookContext, intended: Character): Character;
  /** An enemy of the holder is executing an attack action (hazards, traps).
   *  Return true when this hazard consumed the attack's hazard check — the
   *  engine stops checking further hazards for this attack. */
  onEnemyAttackAction?(ctx: StatusHookContext, attacker: Character): boolean;
  /** Extra full passes over the holder's (still-living) attack targets after
   *  the action resolves. May consume the status. */
  attackRepeats?(ctx: StatusHookContext): number;
  /** Round-end hook, run for EVERY combatant carrying the status — unlike an
   *  EffectHandler's postRound, which only runs for actions played this round.
   *  Runs before modifiers/statuses advance. Damage-over-time ticks live here. */
  onRoundEnd?(ctx: StatusHookContext): void;
}
