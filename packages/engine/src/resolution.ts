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
