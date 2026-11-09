/**
 * THE ELEMENTS SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the bands. Data only; what is done with it is `@pimpampum/bench`'s.
 */
import type { Shape } from '@pimpampum/bench';

/**
 * The shapes a kit is measured across, one per creature's role: the horde, the
 * control pack, the beasts, the mixed line. PV is solved, never written down;
 * the COUNT is the coarse lever, chosen by measurement (`probe-shapes.ts
 * --set elements`, last 2026-11-02, GOALS.md B17). The beasts were one unagi
 * until then: alone it could not threaten the party before the fight-length
 * cap, and no PV made it fair.
 */
/**
 * The level the creatures are fielded at in every shape: the reference heroes'
 * own (10), so every creature fields its full kit.
 */
export const CREATURE_LEVEL = 10;

export const SHAPES: Shape[] = [
  { label: 'patrulla', pool: [{ enemyId: 'soldat-del-foc', count: 7, level: CREATURE_LEVEL }] },
  { label: 'caçadors', pool: [{ enemyId: 'shirshu', count: 2, level: CREATURE_LEVEL }] },
  { label: 'bèsties', pool: [{ enemyId: 'unagi', count: 3, level: CREATURE_LEVEL }] },
  { label: 'mixt', pool: [{ enemyId: 'soldat-del-foc', count: 4, level: CREATURE_LEVEL }, { enemyId: 'arquer-yuyan', count: 1, level: CREATURE_LEVEL }] },
];

/** Ally rows: three kits each — the four elements three to a row, every one
 *  of them in three rows, Esgrima in a fifth beside water and fire,
 *  Acrobàcia in a sixth beside earth and air, Artífex in a seventh beside
 *  water and air, Mestre del xi in an eighth beside earth and fire. */
export const COMPANY: string[][] = [
  ['earthbender', 'firebender', 'airbender'],
  ['waterbender', 'firebender', 'airbender'],
  ['waterbender', 'earthbender', 'airbender'],
  ['waterbender', 'earthbender', 'firebender'],
  // Esgrima, shared with the fantasy set (2026-10-13).
  ['mestre-armes', 'waterbender', 'firebender'],
  // Acrobàcia, shared with the fantasy set (2026-10-14).
  ['acrobacia', 'earthbender', 'airbender'],
  // Artífex, shared with the fantasy set (2026-10-14).
  ['artifex', 'waterbender', 'airbender'],
  // Mestre del xi, shared with the fantasy set (2026-10-14).
  ['mestre-del-xi', 'earthbender', 'firebender'],
];

/** The stand-in per company row — the one element that row leaves out (the
 *  Esgrima row leaves out two, earth stands in; the Acrobàcia row too,
 *  water stands in; the Artífex row too, fire stands in; the Mestre del xi
 *  row too, air stands in). */
export const CALIBRATION_KITS = ['waterbender', 'earthbender', 'firebender', 'airbender', 'earthbender', 'waterbender', 'firebender', 'airbender'];

/** Creatures no SHAPE fields, and why. */
export const UNFIELDED_ENEMIES: Record<string, string> = {};

/** The winrate shapes are solved toward — an aim, not a requirement. */
export const FAIR = 0.6;

/** Average fight length the shapes are solved up to (intentions.md: ~5). */
export const MAX_AVG_ROUNDS = 5;

/** A cell outside this band is pinned against an edge and not measured in. */
export const SATURATION = { min: 0.20, max: 0.80 };

/** How many bodies a harness fields for "a natural fight" of one creature. */
export const FIELDED: Record<string, number> = {
  'soldat-del-foc': 4, shirshu: 2, unagi: 1, 'arquer-yuyan': 2,
};

export const UNLISTED_BODIES = 3;

export function bodiesFor(enemyId: string): number {
  return FIELDED[enemyId] ?? UNLISTED_BODIES;
}
