/**
 * THE FANTASY SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the two bands. Data only: what is done with it (solve each shape, measure
 * the neutral baseline per row, drop saturated cells) is the same for every set
 * and lives in `@pimpampum/bench` (`positions.ts`).
 */
import type { Shape } from '@pimpampum/bench';

/**
 * The shapes. PV is never written down here — it is SOLVED, so a shape stays
 * calibrated when the cards or the AI move.
 *
 * The COUNT has to be chosen, and it is the coarse lever, so it is chosen by
 * measurement (`probe-shapes.ts`). PV cannot rescue a badly-picked count: too
 * few bodies and the solver hits the round budget long before they are
 * dangerous, too many and one point of PV per body is worth more than the
 * whole gap to the target. Re-run the probe after any content or AI change;
 * `solveShape` below says when a count has gone out of band.
 *
 * The counts below were chosen on 2026-09-23, after the goblin stall and the
 * solver's unchecked clamps were fixed (NEXT-STEPS §26, with the probe table).
 * Before those fixes no count was fair, and the probe's numbers from then say
 * more about the two faults than about the shapes.
 */
export const SHAPES: Shape[] = [
  { label: 'horda', pool: [{ enemyId: 'goblin', count: 5 }] },
  { label: 'escamot', pool: [{ enemyId: 'bone-devil', count: 4 }] },
  { label: 'cap', pool: [{ enemyId: 'basilisk', count: 1 }] },
  { label: 'mixt', pool: [{ enemyId: 'goblin', count: 3 }, { enemyId: 'horned-devil', count: 1 }] },
];

/** Ally rows the subject is measured beside. A kit that only works next to
 *  particular company shows up as spread across these rather than averaged
 *  away. Each row is two mains and one complementary kit, which is what a real
 *  table looks like — and is why the calibration party must have that shape
 *  too. */
export const COMPANY: string[][] = [
  ['mestre-armes', 'volcanic', 'metge'],
  ['berserk', 'earthbender', 'runes'],
  ['nigromant', 'enginyer-explosius', 'gel'],
  // Row 4 exists so that EVERY kit is measured as an ally, not only as a
  // subject. With three rows, `ombres` appeared in none of them — it was
  // scored when it was the subject and never once as company, which is half of
  // what a complementary kit is for. `test/calibration.test.ts` now fails if any kit
  // falls out of this list, so the gap cannot reopen silently when a skill is
  // added.
  //
  // It costs nothing: `runCell` divides its game budget across the matrix, so
  // more rows buy finer coverage at the same total number of combats.
  ['volcanic', 'nigromant', 'ombres'],
];

/**
 * The kit that stands in for the subject while a shape is being priced —
 * ONE PER COMPANY ROW, and never a kit already sitting in that row.
 *
 * A first attempt used a single stand-in for all three rows and produced
 * `volcanic | mestre-armes | volcanic | metge` against company 0: a doubled
 * kit, which is neither neutral nor a table anyone would field. Every main kit
 * appears in some row, so the stand-in has to be chosen per row.
 *
 * Within that constraint they are picked for being unopinionated — the
 * depth-1 mirror sweeps put mestre-armes, berserk and volcànica within a few
 * points of even — because a strong or weak stand-in would bake its own
 * verdict into every other kit's score.
 */
export const CALIBRATION_KITS = ['berserk', 'volcanic', 'mestre-armes', 'enginyer-explosius'];


/**
 * Creatures no SHAPE fields, and why.
 *
 * A player kit is only ever measured against the creatures in `SHAPES`, so a
 * creature missing from them is a creature no kit is ever tested against. That
 * was true of half the roster and nothing said so. It is now a DECLARED gap:
 * `test/calibration.test.ts` fails if a creature is neither fielded nor listed here,
 * so adding an enemy forces a decision about where it gets measured instead of
 * defaulting to "nowhere".
 *
 * These are not permanent. Two of them are blocked on content, two are simply
 * shapes nobody has probed a count for yet.
 */
export const UNFIELDED_ENEMIES: Record<string, string> = {
  wolf: 'cannot reach an even fight at ANY count or level (NEXT-STEPS §5), so it '
    + 'cannot form a calibrated shape at all. Re-check after its kit gets teeth.',
  'spined-devil': 'same as wolf — no composition has ever threatened the reference '
    + 'party, so there is no count that solves to FAIR.',
  'goblin-shaman': 'a CASTER-HORDE shape is a real gap in the matrix (all four shapes '
    + 'are melee-led). It reached an even fight at 3 bodies under the old measurements; '
    + 'probe a count and promote it to a fifth shape.',
  'stone-golem': 'an ARMOURED-ELITE shape is the other gap — nothing here tests a kit '
    + 'against high passive armour. Even at 4 bodies under the old measurements; same '
    + 'treatment as goblin-shaman.',
};

/**
 * The winrate a shape is SOLVED toward.
 *
 * It is an aim, not a requirement. Nothing downstream compares a subject to
 * this number — see `NEUTRAL_BASELINE` below for why — so a shape that lands at
 * 50% or 70% instead is perfectly usable. 60% rather than 50% only because it
 * leaves a little more room above than below.
 */
export const FAIR = 0.6;

/**
 * The average fight length the shapes are solved up to: intentions.md's
 * "about five rounds", and inside requirement 1's median bar
 * (`test/calibration.test.ts` holds the two together). The solver's own
 * default is 6, and calibration fights solved to it broke requirement 1's p90
 * for every kit measured in them.
 */
export const MAX_AVG_ROUNDS = 5;

/**
 * THE ONLY THING A CELL HAS TO BE: NOT SATURATED.
 *
 * The analyzer used to demand every shape land within ±8pp of `FAIR` and drop
 * the ones that missed — which excluded three of four shapes, and could not be
 * fixed by re-probing because adjacent body counts are 20-35pp apart and the
 * band was 16pp wide (NEXT-STEPS §12.4).
 *
 * That demand was never load-bearing: the power band subtracts the neutral
 * baseline measured in the same cell, and a card's value is a difference
 * between branches of the same position. EVERY VERDICT IS ALREADY A DELTA, and a delta does not care where the cell
 * sits — only that it is not pinned against an edge, where every arm reads the
 * same and differences compress to nothing.
 *
 * So the test is saturation, applied per CELL rather than per shape: a shape
 * can average 58% while one of its company rows sits at 96%, and that row is
 * useless for measuring anything no matter how good the average looks.
 */
export const SATURATION = { min: 0.20, max: 0.80 };

/**
 * How many bodies to field per creature when a harness wants "a natural-looking
 * fight" of one species — `main.ts`'s parametric check and the balancer guard.
 *
 * It is the HARNESS's choice, not data the content carries; the balancer prices
 * any count. It lived in two files as identical copies, with an unlisted
 * creature silently falling back to 3 — fine for a squad, meaningless for a
 * horde or a boss. `bodiesFor` still falls back, but `UNLISTED_BODIES` makes
 * the arbitrary number visible, and `test/calibration.test.ts` fails if a creature
 * is missing from the table.
 */
export const FIELDED: Record<string, number> = {
  goblin: 6, 'spined-devil': 6, wolf: 6,
  'goblin-shaman': 3, 'bone-devil': 3, 'stone-golem': 3,
  basilisk: 1, 'horned-devil': 1,
};

export const UNLISTED_BODIES = 3;

export function bodiesFor(enemyId: string): number {
  return FIELDED[enemyId] ?? UNLISTED_BODIES;
}
