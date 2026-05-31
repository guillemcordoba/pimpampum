import { DiceRoll } from './dice.js';

/** Roll a single d20 (1-20). */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Result of a contested attack roll. */
export interface AttackOutcome {
  attackerRoll: number;
  attackerTotal: number;
  /** null when the attack was undefended (auto-hit). */
  defenderRoll: number | null;
  defenderTotal: number | null;
  hit: boolean;
  /** attackerTotal - defenderTotal. +Infinity for an undefended auto-hit. */
  margin: number;
}

/**
 * Resolve a contested attack. The attacker hits if their total strictly exceeds
 * the defender's. An undefended attack (defenderTotal === null) always hits.
 */
export function resolveAttack(attackerTotal: number, defenderTotal: number | null): { hit: boolean; margin: number } {
  if (defenderTotal === null) return { hit: true, margin: Infinity };
  const margin = attackerTotal - defenderTotal;
  return { hit: margin > 0, margin };
}

/** Damage actually dealt to PV: rolled damage minus passive armour, floored at 0. */
export function resolveDamage(rolledDamage: number, passiveArmor: number): number {
  return Math.max(0, rolledDamage - passiveArmor);
}

/**
 * Skill levelling rule. After a contested skill roll the skill gains a level only
 * when the roll falls short of the threshold by less than 10 (a near miss). A
 * success never levels the skill. `margin` is the absolute distance from the
 * threshold. Undefended auto-hits (margin === Infinity) never level a skill —
 * there was no contest to learn from.
 */
export function checkSkillUp(succeeded: boolean, margin: number): boolean {
  if (!isFinite(margin)) return false;
  return !succeeded && Math.abs(margin) < 10;
}

/** Roll an attack's damage dice (returns raw dice total before armour). */
export function rollAttackDamage(dice: DiceRoll | undefined): number {
  return dice ? dice.roll() : 0;
}
