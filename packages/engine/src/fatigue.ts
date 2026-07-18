/**
 * Fatigue: a per-character DAILY STAMINA BUDGET. Every action played (in or
 * out of combat) adds its fatigue cost — 1 by default; heavy "esgotadora"
 * cards declare more. An action cannot be played if it would push the counter
 * past the daily maximum; a night's sleep clears it (Character.sleep()).
 *
 * Fatigue NEVER touches dice rolls: flat roll penalties froze long fights
 * instead of ending them (measured 2026-07-17, ~95% of mirror draws). Its job
 * is to price heroics (rage, adrenaline, big rituals) and cap the day —
 * including out-of-combat action spam like healing a whole party to full.
 */

export const FATIGUE_ENABLED = true;

/**
 * Daily fatigue budget — THE pacing knob. Sized so a party comfortably
 * sustains ~2-3 combats in a day (measured 2026-07-17: max 15 → 3rd combat
 * winnable but clearly degraded). Mutable object so the simulator can sweep
 * candidate values at runtime.
 */
export const FATIGUE_CONFIG = { max: 20 };

export function maxFatigue(): number {
  return FATIGUE_CONFIG.max;
}

/** Catalan label for the current fatigue state. */
export function fatigueStateName(fatigue: number): string {
  const left = FATIGUE_CONFIG.max - fatigue;
  if (left <= 0) return 'Esgotat';
  if (left <= FATIGUE_CONFIG.max / 3) return 'Cansat';
  return 'Fresc';
}
