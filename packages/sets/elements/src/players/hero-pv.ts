/**
 * A HERO'S PV, BY LEVEL — never fixed (intentions.md, the user 2026-11-06):
 * derived from the requirements by `tools/src/derive-pv.ts --set elements` (at
 * each level, the most PV with fights still ending in time, floored by round 1
 * and by interactivity), and pinned here. Re-derive it when the ladder, the
 * structure or the cards move far. Levels 1-2 sit below play (heroes start at
 * level 3) and take level 3's.
 */
export const HERO_PV: Readonly<Record<number, number>> = {
  1: 26, 2: 26, 3: 26, 4: 26, 5: 26, 6: 26, 7: 26, 8: 26, 9: 26, 10: 26,
};

export function heroPV(level: number): number {
  return HERO_PV[Math.max(1, Math.min(10, Math.round(level)))];
}
