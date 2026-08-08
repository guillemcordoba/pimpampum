import { DiceRoll } from './dice.js';
/** Margin an eventual loser may lose by and still learn from the contest. */
export const SKILL_UP_MARGIN = 2;

/**
 * Resolve an attack contest. `defenseTotal === null` means undefended: the
 * attack auto-hits and the damage margin is the full attack total. Defended:
 * the defense holds on a tie or better — the attack hits only when its total
 * strictly exceeds the defense, and the damage is the margin between them.
 */
export function resolveAttack(attackTotal: number, defenseTotal: number | null): { hit: boolean; margin: number } {
  if (defenseTotal === null) return { hit: true, margin: attackTotal };
  const margin = attackTotal - defenseTotal;
  return { hit: margin > 0, margin };
}

/** Damage actually dealt to PV: the margin minus passive armour, floored at 0. */
export function resolveDamage(margin: number, passiveArmor: number): number {
  return Math.max(0, margin - passiveArmor);
}

/**
 * Learning rule: after a CONTESTED roll only, the LOSER levels up when they
 * lost by `SKILL_UP_MARGIN` or less. `lostBy` is winner total − loser total
 * (≥ 0; a tie counts as the attacker losing by 0). Callers decide who lost,
 * and never call this for undefended auto-hits — no contest, no learning.
 */
export function checkSkillUp(lostBy: number): boolean {
  return lostBy >= 0 && lostBy <= SKILL_UP_MARGIN;
}

// --- Mastery: level in the contest ------------------------------------------
/**
 * How far past a CARD you have trained: `skill level − the card's unlock
 * level`. Your first action is the one you have thrown ten thousand times; the
 * one you learned last week is still clumsy.
 *
 * This is the only place a level enters a roll, and it is what makes level a
 * real danger dial rather than just a wider hand — the property the encounter
 * balancer needs, since level raises damage per round WITHOUT adding PV (a
 * level-4 Gòlem's fights run 4 rounds where a level-1's run 7).
 *
 * Both sides add it, so equal mastery cancels exactly and a same-level contest
 * is arithmetically identical to one with no bonus at all. It only speaks when
 * the two sides are unevenly trained.
 *
 * Measured 2026-08-08: it turned the Gòlem's level from inert (4 bodies at
 * every level) into a monotone +51.7pp ramp, and shortened fights across every
 * kit. It does NOT paper over bad cards — the Diable Banyut's trap card still
 * shows as a regression — which is what keeps the kit analyzer honest.
 */
export function masteryBonus(actor: { getSkillLevel(id: string): number }, def: { skillId: string; unlockLevel: number }): number {
  return Math.max(0, actor.getSkillLevel(def.skillId) - def.unlockLevel);
}
