import type { Character, StatusEntry } from './character.js';
import type { ActionDefinition } from './types.js';
import type { EngineApi } from './effects.js';
import type { AIView } from './ai.js';

/**
 * Status behaviours: the second half of the content registry. Where an
 * EffectHandler runs when its OWN action resolves, a StatusBehavior runs while
 * a status sits ON a character, intercepting other actions and round flow at
 * fixed generic seams. Content registers behaviours via
 * EffectRegistry.registerStatus; the engine never knows status keys by name.
 *
 * Scalar adjustments don't need a behaviour: the engine reads generic
 * StatusEntry.data fields directly (see the StatusEntry docs in character.ts).
 */
export interface StatusHookContext {
  engine: EngineApi;
  /** The character carrying the status. */
  holder: Character;
  key: string;
  entry: StatusEntry;
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
   *  Runs after dot/regen ticks, before modifiers/statuses advance. */
  onRoundEnd?(ctx: StatusHookContext): void;
  /** AI: transform the base weight of a candidate action while the holder has
   *  this status (runs before per-effect aiWeight hints are added). */
  adjustActionWeight?(view: AIView, holder: Character, entry: StatusEntry, action: ActionDefinition, weight: number): number;
}
