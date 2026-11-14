/**
 * A HERO'S PV — never fixed (intentions.md, the user 2026-11-06): a base every
 * hero has, plus what each level in each of its classes adds. Bulky classes
 * add more, fragile ones less, in the designer's order (`PV_TIERS`); the
 * numbers are derived by `tools/src/derive-pv.ts --set elements` (the line
 * that clears every level's interactivity floor and stays closest under the
 * ceilings where fights still end in time; each class toward an even fight
 * with the field) and pinned here. A multi-class hero adds every
 * class's share.
 */

/** Bulk, the user's order (2026-11-06): which classes absorb and which evade. */
export const PV_TIERS: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>> = {
  bulky: ['earthbender', 'waterbender'],
  middle: ['mestre-armes', 'artifex', 'mestre-del-xi'],
  fragile: ['firebender', 'airbender', 'acrobacia'],
};

export const HERO_BASE_PV = 2.5;

/** What one level in each class adds. A class not listed adds the middle tier's. */
export const PV_PER_LEVEL: Readonly<Record<string, number>> = {
  earthbender: 2.75, waterbender: 2.75,
  'mestre-armes': 2.5, artifex: 2.5, 'mestre-del-xi': 2.5,
  firebender: 1.75, airbender: 1.75, acrobacia: 1.75,
};

const MIDDLE = PV_PER_LEVEL[PV_TIERS.middle[0]];

/** A hero's PV from its classes and levels (`{ waterbender: 4, artifex: 2 }`). */
export function heroPV(skills: Readonly<Record<string, number>>): number {
  let pv = HERO_BASE_PV;
  for (const [id, level] of Object.entries(skills)) pv += (PV_PER_LEVEL[id] ?? MIDDLE) * level;
  return Math.max(1, Math.round(pv));
}
