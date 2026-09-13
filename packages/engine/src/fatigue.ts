/**
 * Fatigue: a per-character LEVEL from 0 (Fresc) to 5 (Esgotat), assigned by
 * the DM from the fiction — a second fight with no respite, a forced march, a
 * night without sleep, cold, hunger, an untreated wound. Nothing in the engine
 * ever raises it on its own; playing cards costs no fatigue. Only a long rest
 * of four hours or more clears it, all of it at once (Character.rest()).
 *
 * Each level subtracts 1 from EVERY roll the character makes — attack,
 * defense, focus contests, out-of-combat contests. Measured 2026-09-13
 * (`simulator/src/experiment-fatigue-tiers.ts`): one point is worth roughly one
 * difficulty tier — a 65% ("hard") fight is 49% at Cansat, 31% at Fatigat, 6%
 * at Esgotat — so a level is handed out like a tier, never as flavour.
 *
 * The penalty is PLAYER-SIDE ONLY. Enemies never carry fatigue: since damage
 * is the margin, a symmetric penalty cancels out and only the min-0 floor
 * survives, which doubles fight length (3.9 → 7.7 rounds at −5, the freeze the
 * 2026-07-17 measurement rejected). One-sided, it shortens fights instead
 * (5.0 → 4.2 rounds), because the tired side also defends worse.
 */

/** Deepest fatigue level. */
export const FATIGUE_MAX_LEVEL = 5;

/** Catalan name of each fatigue level, 0 (fresh) to FATIGUE_MAX_LEVEL. */
export const FATIGUE_LEVEL_NAMES: readonly string[] = [
  'Fresc', 'Cansat', 'Fatigat', 'Extenuat', 'Exhaust', 'Esgotat',
];

/** Clamp any number to a valid fatigue level. */
export function clampFatigue(level: number): number {
  return Math.max(0, Math.min(FATIGUE_MAX_LEVEL, Math.round(level) || 0));
}

/** Flat modifier a fatigue level applies to every roll (−1 per level). */
export function fatigueRollPenalty(level: number): number {
  return -clampFatigue(level);
}

/** Catalan label for a fatigue level. */
export function fatigueStateName(level: number): string {
  return FATIGUE_LEVEL_NAMES[clampFatigue(level)];
}
