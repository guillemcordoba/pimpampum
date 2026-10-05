/**
 * THE ELEMENTS SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the bands. Data only; what is done with it is `@pimpampum/bench`'s.
 */
import type { Shape } from '@pimpampum/bench';

/**
 * The shapes a kit is measured across. PV is solved, never written down; the
 * COUNT is the coarse lever, chosen by measurement (`probe-shapes.ts --set
 * elements`).
 */
export const SHAPES: Shape[] = [
  { label: 'patrulla', pool: [{ enemyId: 'soldat-del-foc', count: 4 }] },
  { label: 'emboscada', pool: [{ enemyId: 'agent-de-pedra', count: 2 }, { enemyId: 'arquer-de-la-muralla', count: 2 }] },
  { label: 'cap', pool: [{ enemyId: 'serp-de-les-marees', count: 1 }] },
  { label: 'mixt', pool: [{ enemyId: 'artiller-del-tercer-ull', count: 1 }, { enemyId: 'soldat-del-foc', count: 3 }] },
];

/** Ally rows: two mains and one complementary kit each, every kit in some row. */
export const COMPANY: string[][] = [
  ['waterbender', 'firebender', 'chakra'],
  ['earthbender', 'airbender', 'enginy'],
  ['chi-blocker', 'waterbender', 'chakra'],
  ['firebender', 'chi-blocker', 'enginy'],
];

/** The stand-in per company row — never a kit already in that row. */
export const CALIBRATION_KITS = ['airbender', 'firebender', 'earthbender', 'waterbender'];

/** Creatures no SHAPE fields, and why. */
export const UNFIELDED_ENEMIES: Record<string, string> = {
  'acrobata-del-chi': 'a shutdown support, measured in its own encounters for now; no shape has been probed for it.',
  shirshu: 'a single beast between the patrol and the boss; no count has been probed for it yet.',
  'titellaire-de-sang': 'a caster who works through the heroes themselves; no shape probed for her yet.',
  koh: 'a lone spirit boss; the sea serpent holds the boss slot in the matrix.',
  'rostre-de-l-empenta': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-ferro': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-l-anima': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-les-besties': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-famolenc': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-l-infern': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'senyor-de-la-por': 'the villain himself, hidden behind his six bodies; measured as the villain encounter.',
  'bestia-de-la-por': 'never fielded: only the Rostre de les Bèsties calls it, mid-fight.',
};

/** The villain encounter: the six bodies and the Senyor himself. */
export const VILLAIN: Shape = {
  label: 'senyor-de-la-por',
  pool: [
    { enemyId: 'rostre-de-l-empenta', count: 1 }, { enemyId: 'rostre-de-ferro', count: 1 },
    { enemyId: 'rostre-de-l-anima', count: 1 }, { enemyId: 'rostre-de-les-besties', count: 1 },
    { enemyId: 'rostre-famolenc', count: 1 }, { enemyId: 'rostre-de-l-infern', count: 1 },
    { enemyId: 'senyor-de-la-por', count: 1 },
  ],
};

/** The winrate shapes are solved toward — an aim, not a requirement. */
export const FAIR = 0.6;

/** Average fight length the shapes are solved up to (intentions.md: ~5). */
export const MAX_AVG_ROUNDS = 5;

/** A cell outside this band is pinned against an edge and not measured in. */
export const SATURATION = { min: 0.20, max: 0.80 };

/** How many bodies a harness fields for "a natural fight" of one creature. */
export const FIELDED: Record<string, number> = {
  'soldat-del-foc': 4, 'arquer-de-la-muralla': 3, 'agent-de-pedra': 3, 'acrobata-del-chi': 3,
  'artiller-del-tercer-ull': 1, shirshu: 1, 'titellaire-de-sang': 2, koh: 1, 'serp-de-les-marees': 1,
  'rostre-de-l-empenta': 1, 'rostre-de-ferro': 1, 'rostre-de-l-anima': 1, 'rostre-de-les-besties': 1,
  'rostre-famolenc': 1, 'rostre-de-l-infern': 1, 'senyor-de-la-por': 1, 'bestia-de-la-por': 2,
};

export const UNLISTED_BODIES = 3;

export function bodiesFor(enemyId: string): number {
  return FIELDED[enemyId] ?? UNLISTED_BODIES;
}
