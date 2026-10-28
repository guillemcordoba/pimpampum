/**
 * WHAT A REAL FIGHT LOOKS LIKE — the generator's parameter distributions,
 * FROZEN as constants so the audit never imports a content set.
 *
 * Measured from both sets' kits by `tools/src/ai-audit-calibrate.ts`, which
 * prints these tables and flags drift from them. Re-run it after a content
 * change and paste its output here when the real kits have moved.
 *
 * Tables are `[value, weight]` frequency lists. Weights are counts as measured.
 *
 * WHAT THE AUDIT DOES NOT TAKE FROM HERE, because the referee could not solve
 * it: real hands (6-10 cards a hero) are cut to the harness's `cards`, real
 * shapes (4 heroes against 1-5) are sized down by the night mix, and PV is
 * rescaled so the fight lasts its rounds left (`position.ts`'s `pace`); the
 * tables still set the ratios between bodies. Fast shares, dice, levels, armour,
 * the type mix, fatigue costs and the share of priced statuses are as measured.
 */
export interface Profile {
  /** When these were measured, and from what. */
  measured: string;
  /** Share of cards of each type that are fast (resolve in the fast step). */
  fast: { attack: number; defense: number; focus: number };
  dice: {
    attack: readonly (readonly [string, number])[];
    area: readonly (readonly [string, number])[];
    defense: readonly (readonly [string, number])[];
    /** Riders that take something away (stun, lock, weaken) carry these. */
    control: readonly (readonly [string, number])[];
  };
  /** Card types in a hand: attack / defense / focus shares. */
  typeMix: { attack: number; defense: number; focus: number };
  /** Cards a fighter holds (playable, fallback excluded). */
  handSize: { hero: readonly (readonly [number, number])[]; enemy: readonly (readonly [number, number])[] };
  /** Skill level per fighter. */
  level: { hero: readonly (readonly [number, number])[]; enemy: readonly (readonly [number, number])[] };
  /** Max PV per body. */
  pv: { hero: readonly (readonly [number, number])[]; enemy: readonly (readonly [number, number])[] };
  /** Passive armour per body. */
  armour: { hero: readonly (readonly [number, number])[]; enemy: readonly (readonly [number, number])[] };
  /** Share of cards that cost a fatigue level. */
  fatigueCostShare: number;
  /** Share of status-setting cards whose status prices itself (positionValue). */
  pricedShare: number;
  /** Bodies per side in real encounters: `heroes x enemies`. */
  shapes: readonly (readonly [string, number])[];
  /** Fight length in rounds under the production AI. */
  rounds: readonly (readonly [number, number])[];
}

export const PROFILE: Profile = {
  measured: '2026-10-14, fantasy + elements at elements-set 1daa805 (every kit card; reference party vs each calibration shape, 6 fights each)',
  // Measured 2026-10-28 on priority-system (both sets, every kit and enemy
  // card, fallback excluded): attacks 15/81, defenses 0/33, focuses 7/41.
  fast: { attack: 0.185, defense: 0, focus: 0.171 },
  dice: {
    attack: [['1d10', 1], ['1d12', 1], ['1d2', 2], ['1d4', 2], ['1d6', 9], ['2d4', 10], ['2d6', 23], ['2d8', 3], ['3d4', 2], ['3d6', 16], ['3d8', 2], ['4d6', 2]],
    area: [['1d6', 3], ['1d8', 1], ['2d6', 11], ['3d6', 8], ['3d8', 4]],
    defense: [['2d6', 9], ['2d8', 6], ['3d4', 14], ['3d6', 11], ['4d4', 2], ['4d6', 1]],
    // Not measured separately: the attack ladder's lower half, where the real
    // riders that take something away sit.
    control: [['1d2', 2], ['1d4', 2], ['1d6', 9], ['2d4', 10], ['2d6', 23]],
  },
  typeMix: { attack: 0.53, defense: 0.23, focus: 0.25 },
  handSize: { hero: [[6, 8], [7, 8], [10, 16]], enemy: [[3, 14], [4, 2], [5, 11]] },
  level: { hero: [[5, 8], [6, 8], [10, 16]], enemy: [[3, 4], [4, 8], [5, 2], [10, 13]] },
  pv: { hero: [[12, 32]], enemy: [[13, 8], [15, 4], [33, 1], [60, 2], [67, 1], [71, 4], [89, 5], [124, 1], [488, 1]] },
  armour: { hero: [[2, 32]], enemy: [[0, 17], [1, 9], [2, 1]] },
  fatigueCostShare: 0.159,
  pricedShare: 0.65,
  shapes: [['4x1', 2], ['4x2', 1], ['4x4', 2], ['4x5', 3]],
  rounds: [[1, 3], [2, 8], [3, 10], [4, 16], [5, 6], [6, 1], [7, 1], [8, 1], [10, 1], [30, 1]],
};
