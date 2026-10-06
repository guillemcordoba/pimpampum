/**
 * THE ELEMENTS SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the bands. Data only; what is done with it is `@pimpampum/bench`'s.
 */
import type { Shape } from '@pimpampum/bench';

/**
 * The shapes a kit is measured across, one per creature's role: the horde, the
 * control pack, the lone beast, the mixed line. PV is solved, never written
 * down; the COUNT is the coarse lever, chosen by measurement (`probe-shapes.ts
 * --set elements`).
 */
export const SHAPES: Shape[] = [
  { label: 'patrulla', pool: [{ enemyId: 'soldat-del-foc', count: 5 }] },
  { label: 'caçadors', pool: [{ enemyId: 'shirshu', count: 2 }] },
  { label: 'bèstia', pool: [{ enemyId: 'unagi', count: 1 }] },
  { label: 'mixt', pool: [{ enemyId: 'soldat-del-foc', count: 4 }, { enemyId: 'arquer-yuyan', count: 1 }] },
];

/** Ally rows: three of the four kits each, every kit in three rows. */
export const COMPANY: string[][] = [
  ['earthbender', 'firebender', 'airbender'],
  ['waterbender', 'firebender', 'airbender'],
  ['waterbender', 'earthbender', 'airbender'],
  ['waterbender', 'earthbender', 'firebender'],
];

/** The stand-in per company row — the one kit that row leaves out. */
export const CALIBRATION_KITS = ['waterbender', 'earthbender', 'firebender', 'airbender'];

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
