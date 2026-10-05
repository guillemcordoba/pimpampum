/**
 * THE ELEMENTS SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the bands. Data only; what is done with it is `@pimpampum/bench`'s.
 */
import type { Shape } from '@pimpampum/bench';

/**
 * The shapes a kit is measured across. PV is solved, never written down; the
 * COUNT is the coarse lever, chosen by measurement (`probe-shapes.ts --set
 * elements`). Counts probed 2026-10-06 against the calibration party: each
 * solved to 57-65% at 13-20 PV a body, inside the round budget.
 */
export const SHAPES: Shape[] = [
  { label: 'patrulla', pool: [{ enemyId: 'soldat-del-foc', count: 5 }] },
  { label: 'emboscada', pool: [{ enemyId: 'agent-de-pedra', count: 2 }, { enemyId: 'arquer-de-la-muralla', count: 2 }] },
  { label: 'cap', pool: [{ enemyId: 'serp-de-les-marees', count: 2 }] },
  { label: 'mixt', pool: [{ enemyId: 'artiller-del-tercer-ull', count: 1 }, { enemyId: 'soldat-del-foc', count: 4 }] },
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
  'acrobata-del-chi': 'fair at five bodies (61%, 13 PV, probed 2026-10-06), but the four shapes already cover a horde; not needed in the matrix.',
  shirshu: 'no threat to four heroes at one or two bodies whatever its PV (82-98%, probed 2026-10-06); its kit needs teeth before it can form a shape.',
  'titellaire-de-sang': 'no threat at two to four bodies whatever her PV (86-97%, probed 2026-10-06); the puppet card is control, not a kill.',
  koh: 'no threat alone or as a pair whatever his PV (91-98%, probed 2026-10-06), even punishing every attacker; his kit needs another look.',
  'rostre-de-l-empenta': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-ferro': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-l-anima': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-les-besties': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-famolenc': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'rostre-de-l-infern': 'one of the Senyor de la Por\'s bodies — fought only together, in the villain encounter.',
  'senyor-de-la-por': 'the villain himself, hidden behind his six bodies; measured as the villain encounter.',
  'bestia-de-la-por': 'never fielded: only the Rostre de les Bèsties calls it, mid-fight.',
};

/**
 * The villain encounter: the Senyor and three of his bodies — the push, the
 * soul and the one that brings the others back.
 *
 * A fight of about five rounds holds only so much enemy PV in total; spread
 * over all seven bodies it solved to 4 PV each (probed 2026-10-06) — a goblin
 * horde, not a villain. Difficulty is an input and the GM composes the fight,
 * so the standard encounter fields three bodies and `NIGHTMARE` all six.
 */
export const VILLAIN: Shape = {
  label: 'senyor-de-la-por',
  pool: [
    { enemyId: 'rostre-de-l-empenta', count: 1 }, { enemyId: 'rostre-de-l-anima', count: 1 },
    { enemyId: 'rostre-de-l-infern', count: 1 }, { enemyId: 'senyor-de-la-por', count: 1 },
  ],
};

/** All six bodies at once — the nightmare. */
export const NIGHTMARE: Shape = {
  label: 'els-sis-rostres',
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
