/**
 * The measuring half of `set.slow.test.ts`: how a fight solved for an
 * unarmoured party goes as more of that party puts armour on.
 *
 * Every arm plays the SAME seed, and armour draws no random numbers, so every
 * arm fights with the same drawn party in the same order: the arms differ only
 * in who wears what. Seats are drawn independently, so "the first k" are k
 * members picked at random — the curve says what armour is worth on a random
 * few, which is a floor on what a table that chooses its wearers would get.
 */
import { games, searchGames, useSet } from '@pimpampum/bench';
import { simulateEncounter, solveEncounter, type PoolSpec } from '../src/index.js';
import { FANTASY } from '../src/bench/index.js';

export const PARTY = 4;
/** Passive-armour values this set equips: cuir (1) and ferro (2). */
export const ARMOURS = [1, 2] as const;

export interface ArmourPoint { worn: number; winrate: number; games: number }
export interface ArmourCurves { label: string; curves: Record<number, ArmourPoint[]> }

export function armourCurves(label: string, pool: PoolSpec[]): ArmourCurves | null {
  useSet(FANTASY);
  const bare = { count: PARTY, levels: 6, armor: 0 };
  const solved = solveEncounter(pool, bare, 0.65, { searchGames: searchGames(100) });
  if (!solved || solved.clamped) return null;
  const n = games(800);
  const at = (armor: number[]): number =>
    simulateEncounter(solved.groups, { ...bare, armor }, { games: n, seed: 31337 }).winrate;
  const none: ArmourPoint = { worn: 0, winrate: at(Array(PARTY).fill(0)), games: n };
  const curves: Record<number, ArmourPoint[]> = {};
  for (const a of ARMOURS) {
    curves[a] = [none];
    for (let k = 1; k <= PARTY; k++) {
      curves[a].push({ worn: k, winrate: at(Array.from({ length: PARTY }, (_, i) => (i < k ? a : 0))), games: n });
    }
  }
  return { label, curves };
}
