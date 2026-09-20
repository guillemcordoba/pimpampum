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

// --- Skill level in the contest ---------------------------------------------
/**
 * A ROLL IS THE CARD'S DICE PLUS YOUR LEVEL IN ITS SKILL.
 *
 * This is the only place a level enters a roll, and it is what makes level a
 * real danger dial rather than just a wider hand — the property the encounter
 * balancer needs, since level raises damage per round WITHOUT adding PV.
 *
 * Both sides add their own, so two equally trained contenders cancel exactly
 * and the contest is arithmetically identical to one with no bonus at all. It
 * only speaks when the two sides are unevenly trained — which is what makes an
 * enemy's level a real measure of how dangerous it is rather than just a count
 * of how many cards it holds.
 *
 * It replaced MESTRATGE (removed 2026-09-20), which added `level − the card's
 * unlock level` instead: the idea was that your first action is the one you
 * have thrown ten thousand times while the one you learned last week is still
 * clumsy, so old cards stayed relevant as their dice fell behind. It is gone by
 * design decision, not by measurement — the level is the level, whichever card
 * you play. Note `Rugit de guerra` already rolled the FULL level for its own
 * contest, so the engine is now consistent with the one card that said so on
 * its face.
 */
export function skillLevelBonus(actor: { getSkillLevel(id: string): number }, def: { skillId: string }): number {
  return actor.getSkillLevel(def.skillId);
}
