/**
 * Fatigue system: a single per-character counter that penalises every d20+skill roll
 * once you cross a hardcoded threshold. Tuneable by editing the table below.
 *
 * Lore: combat is taxing, especially magical and all-out actions. Below 5 fatigue
 * you're fine. Past that, exhaustion ramps up sharply — a destroyed character
 * can barely roll anything.
 */

export interface FatigueTier {
  /** Minimum fatigue value at which this tier kicks in. */
  from: number;
  /** Catalan label used in displays and logs. */
  name: string;
  /** Subtracted from every d20+skill roll (and divided into heal totals). */
  penalty: number;
}

/** Sorted ascending by `from`. Tune by editing values here. */
export const FATIGUE_TABLE: readonly FatigueTier[] = [
  { from: 0,  name: 'Fresc',       penalty: 0  },
  { from: 6,  name: 'Tocat',       penalty: 5  },
  { from: 7,  name: 'Cansat',      penalty: 10 },
  { from: 8,  name: 'Esgotat',     penalty: 20 },
  { from: 9,  name: 'Trencat',     penalty: 40 },
  { from: 10, name: 'Destrossat',  penalty: 80 },
];

/** Divisor applied to (d20 + skill - fatiguePenalty) to compute heal amount. */
export const HEAL_DIVISOR = 4;

/** Highest tier whose `from` is ≤ the given fatigue value. */
export function fatigueTier(fatigue: number): FatigueTier {
  let entry: FatigueTier = FATIGUE_TABLE[0];
  for (const t of FATIGUE_TABLE) if (fatigue >= t.from) entry = t;
  return entry;
}

export function fatiguePenalty(fatigue: number): number {
  return fatigueTier(fatigue).penalty;
}

export function fatigueStateName(fatigue: number): string {
  return fatigueTier(fatigue).name;
}

/** Default fatigue cost for any action that does not declare one. */
export const DEFAULT_FATIGUE_COST = 1;

/** Short rest: clears post-cliff exhaustion, leaves Fresc state intact. */
export function shortRestFatigue(fatigue: number): number {
  return Math.min(fatigue, 5);
}

/** Long rest: full reset. */
export function longRestFatigue(): number {
  return 0;
}
