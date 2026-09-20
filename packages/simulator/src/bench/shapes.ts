/**
 * FIGHT SHAPES, and what "a fair cell" actually means.
 *
 * A kit is never measured against one fight: a kit that shines against a horde
 * and folds against a boss reads as fine. So the subject is thrown at a MATRIX
 * of shapes × ally rows, and the spread is evidence in its own right.
 *
 * THE CALIBRATION BUG THIS MODULE EXISTS TO FIX. The analyzer used to price
 * each shape against `MAINS.slice(0, 4)` — four main kits at full kit — and
 * then print "each cell is a fair fight by construction". The cells are not
 * that party. A cell is the SUBJECT at level N plus a company row that is two
 * mains and one COMPLEMENTARY kit (metge/runes/gel, 2-3 actions each). Those
 * are structurally different parties, so the 60% never transferred, and the
 * mismatch was worst exactly where it mattered most — at level 1, where the
 * subject is weakest.
 *
 * The calibration party is now CELL-SHAPED: a neutral kit in seat 1 plus a
 * real company row. The shape is solved against one of them and then MEASURED
 * against all of them, so what the report prints is what was measured rather
 * than what was assumed.
 */
import { simulateEncounter, solveEncounter, type FieldedGroup } from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';
import { hero } from './reference.js';
import { calibrationGames, searchGames } from './games.js';
import { countedCached, enemyPrint, key, skillPrint } from './cache.js';

/**
 * The shapes. PV is never written down here — it is SOLVED, so a shape stays
 * calibrated when the cards or the AI move.
 *
 * The COUNT has to be chosen, and it is the coarse lever, so it is chosen by
 * measurement (`probe-shapes.ts`). PV cannot rescue a badly-picked count: too
 * few bodies and the solver hits the round budget long before they are
 * dangerous (3× bone-devil caps out at a 98% free win), too many and one point
 * of PV per body is worth more than the whole gap to the target (8× goblin
 * lands 18pp too hard, with no flag, because the nearest integer really is the
 * best answer). Re-run the probe after any content or AI change; `solveShape`
 * below says when a count has gone out of band.
 */
/*
 * Counts as of the 2026-09-20 probe, re-run against the FULL-KIT (Σ22)
 * reference party. Read this before changing anything here:
 *
 *   horda    4× 52%  5× 70%  6× 87%  8× 58%(PV floor)  10× 33%  12× 20%
 *   escamot  3× 95%  4× 50%  5× 79%  6× 75%(PV floor)
 *   cap      1× 49%  2× 42%
 *   mixt     2× 44%  3× 66% ✓  4× 72%  6× 79%(PV floor)
 *
 * ONE of eighteen candidates lands inside ±8pp of 60%, and the reason is
 * arithmetic rather than bad luck: ADJACENT BODY COUNTS ARE 20-35pp APART, and
 * the band is 16pp wide. A step that size cannot reliably land in a target that
 * size. PV is supposed to be the fine lever between counts, but it is an
 * integer and bottoms out at 1, so for small creatures the counts above the
 * floor and the counts below it are two different regimes with nothing in
 * between.
 *
 * The counts below are therefore the CLOSEST AVAILABLE, not fair ones. Three of
 * four are reported out of band and excluded from the headline, which is the
 * honest state of the matrix — see NEXT-STEPS §12.4 for the ways out, all of
 * which are design decisions rather than count decisions.
 */
export const SHAPES: { label: string; pool: { enemyId: string; count: number }[] }[] = [
  { label: 'horda', pool: [{ enemyId: 'goblin', count: 8 }] },
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
  // what a complementary kit is for. `tests/bench.test.ts` now fails if any kit
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

/** The stand-in for one company row. */
export function calibrationKit(companyIdx: number): string {
  return CALIBRATION_KITS[companyIdx % CALIBRATION_KITS.length];
}

/**
 * Creatures no SHAPE fields, and why.
 *
 * A player kit is only ever measured against the creatures in `SHAPES`, so a
 * creature missing from them is a creature no kit is ever tested against. That
 * was true of half the roster and nothing said so. It is now a DECLARED gap:
 * `tests/bench.test.ts` fails if a creature is neither fielded nor listed here,
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
 * THE ONLY THING A CELL HAS TO BE: NOT SATURATED.
 *
 * The analyzer used to demand every shape land within ±8pp of `FAIR` and drop
 * the ones that missed — which excluded three of four shapes, and could not be
 * fixed by re-probing because adjacent body counts are 20-35pp apart and the
 * band was 16pp wide (NEXT-STEPS §12.4).
 *
 * That demand was never load-bearing. Walk the requirements: level ramps
 * compare a level to the level below it, the mindless bar compares a policy to
 * a restricted policy on the same cells, card use is plays over legality.
 * EVERY VERDICT IS ALREADY A DELTA, and a delta does not care where the cell
 * sits — only that it is not pinned against an edge, where every arm reads the
 * same and differences compress to nothing.
 *
 * So the test is saturation, applied per CELL rather than per shape: a shape
 * can average 58% while one of its company rows sits at 96%, and that row is
 * useless for measuring anything no matter how good the average looks.
 */
export const SATURATION = { min: 0.20, max: 0.80 };

/**
 * Games behind each per-cell baseline (±~2.2pp).
 *
 * These numbers are subtracted from every subject's score, so their error
 * enters every delta. They are measured once per run and reused across every
 * kit and level, which is what makes it affordable to buy precision here.
 */
const CALIBRATION_GAMES = calibrationGames(500);
/** Independent of the solver's own seed: the check must not re-use the sample
 *  the search steered on (winner's curse, ~4pp optimistic — see simulate.ts). */
const CALIBRATION_SEED = 616_000;

/** A CELL-SHAPED party for calibration: the neutral stand-in in seat 1, the
 *  real company row behind it — the same construction `partyWith` uses for an
 *  actual cell, with the subject swapped out. */
export function calibrationParty(companyIdx: number): PartySpec {
  const company = COMPANY[companyIdx % COMPANY.length];
  return {
    characters: [
      hero('Patró', calibrationKit(companyIdx)),
      ...company.map((id, i) => hero(`Company ${i + 1}`, id)),
    ],
  };
}

export interface SolvedShape {
  groups: FieldedGroup[];
  /**
   * THE NEUTRAL BASELINE, per company row: what a neutral kit scores in this
   * exact seat.
   *
   * This is the number every subject is reported against. Two things fall out
   * of subtracting it that were previously unfixable:
   *
   *  - the CELL's own difficulty cancels, so a shape drifting as content is
   *    added no longer moves any kit's score;
   *  - the SEATING cancels, and it was worth up to 66pp — the company rows are
   *    not three seatings of one fight, they are three different fights, and
   *    averaging raw winrates over them buried the kit under the seat.
   */
  byCompany: number[];
  /** Mean of the baselines — how hard this shape is on average. Reported for
   *  the reader; nothing is judged against it. */
  mean: number;
  /**
   * Max − min across the calibration parties.
   *
   * READ WITH CARE: the stand-in in seat 1 differs per row (it must, or it
   * would sit beside a copy of itself), so this mixes the ally row's effect
   * with the stand-in's. Since both terms of every delta now carry it, it is
   * reported as information rather than used as a correction.
   */
  spread: number;
  /** The solver ran out of lever (duration budget or PV bound). Reported, not
   *  disqualifying: a capped shape is still a fine place to measure a delta,
   *  it simply is not at the winrate that was asked for. */
  capped: boolean;
  games: number;
}

const cache = new Map<string, SolvedShape>();

/**
 * Price one shape, then measure the neutral baseline in every company row.
 *
 * Solved against company 0 (the solver takes one party), MEASURED against all
 * of them — and it is the per-row measurements, not the solve, that everything
 * downstream uses.
 */
/** What a company row's party is made of, for cache keying. */
function partyPrint(companyIdx: number): string {
  return [calibrationKit(companyIdx), ...COMPANY[companyIdx % COMPANY.length]]
    .map(skillPrint).join('/');
}

/** What a shape fields, for cache keying. */
function poolPrint(shape: (typeof SHAPES)[number]): string {
  return shape.pool.map(p => `${p.count}x${enemyPrint(p.enemyId)}`).join('+');
}

/**
 * The solved composition alone — what stands on the table, at what PV.
 *
 * Split out from `solveShape` so the two halves can be warmed separately: one
 * solve per shape, then all sixteen baselines at once. They also depend on
 * different content (the solve only sees company 0's party), which is what lets
 * an edit to one kit leave most of this cached.
 */
export function solveGroupsOnly(shape: (typeof SHAPES)[number]): FieldedGroup[] {
  const k = key('solve', poolPrint(shape), partyPrint(0), String(FAIR), String(searchGames(120)));
  return countedCached<FieldedGroup[]>('shape', k, () => {
    const solved = solveEncounter(shape.pool, calibrationParty(0), FAIR, { searchGames: searchGames(120) });
    return solved
      ? solved.groups.map(g => ({ enemyId: g.enemyId, count: g.count, level: g.level, pv: g.pv }))
      : [];
  });
}

/** The neutral baseline for one (shape, company) cell. */
export function baselineFor(shape: (typeof SHAPES)[number], companyIdx: number): number {
  const groups = solveGroupsOnly(shape);
  if (groups.length === 0) return 1;
  const groupPrint = groups.map(g => `${g.count}x${g.enemyId}@${g.pv}L${g.level}`).join('+');
  const k = key('base', groupPrint, partyPrint(companyIdx),
    String(CALIBRATION_GAMES), String(CALIBRATION_SEED + companyIdx * 31));
  return countedCached<number>('baseline', k, () => simulateEncounter(groups, calibrationParty(companyIdx), {
    games: CALIBRATION_GAMES, seed: CALIBRATION_SEED + companyIdx * 31,
  }).winrate);
}

export function solveShape(shape: (typeof SHAPES)[number]): SolvedShape {
  const hit = cache.get(shape.label);
  if (hit) return hit;

  // CACHED PER CELL, not per run. The solve and each company's baseline depend
  // on different slices of the content, so they are keyed separately: editing
  // one player kit invalidates only the rows that seat it — typically one of
  // four — instead of the whole 30 s of fixed cost. See bench/cache.ts.
  const groups = solveGroupsOnly(shape);
  const solvedOk = groups.length > 0;
  const byCompany = solvedOk
    ? COMPANY.map((_, i) => baselineFor(shape, i))
    : COMPANY.map(() => 1);
  const mean = byCompany.reduce((a, b) => a + b, 0) / byCompany.length;

  // `capped` is not cached: it is only read for the report line, and re-solving
  // to recover it would defeat the cache entirely.
  const solved = solvedOk ? { durationCapped: false, clamped: false } : null;

  const entry: SolvedShape = {
    groups,
    byCompany,
    mean,
    spread: Math.max(...byCompany) - Math.min(...byCompany),
    capped: !solved,
    games: CALIBRATION_GAMES,
  };
  cache.set(shape.label, entry);
  return entry;
}

/** One measurable position: a shape, a company row, and the neutral score there. */
export interface Cell {
  shapeIdx: number;
  companyIdx: number;
  label: string;
  /** Neutral kit's winrate in this seat — subtracted from every subject's. */
  baseline: number;
  baselineGames: number;
}

/**
 * Every cell worth measuring in: the full shape × company matrix, minus the
 * positions where the neutral baseline is pinned against an edge.
 *
 * A cell whose baseline is 96% cannot show that one kit is better than another
 * — both win it — and it lifts the mindless bar as much as the real policy,
 * which is precisely how requirement 3's margin got eaten.
 */
export function usableCells(): Cell[] {
  const out: Cell[] = [];
  SHAPES.forEach((shape, shapeIdx) => {
    const solved = solveShape(shape);
    solved.byCompany.forEach((baseline, companyIdx) => {
      if (baseline < SATURATION.min || baseline > SATURATION.max) return;
      out.push({
        shapeIdx, companyIdx, baseline,
        baselineGames: solved.games,
        label: `${shape.label}/c${companyIdx + 1}`,
      });
    });
  });
  return out;
}

/** Cells the saturation test rejected, for the report to name. */
export function saturatedCells(): Cell[] {
  const out: Cell[] = [];
  SHAPES.forEach((shape, shapeIdx) => {
    const solved = solveShape(shape);
    solved.byCompany.forEach((baseline, companyIdx) => {
      if (baseline >= SATURATION.min && baseline <= SATURATION.max) return;
      out.push({
        shapeIdx, companyIdx, baseline,
        baselineGames: solved.games,
        label: `${shape.label}/c${companyIdx + 1}`,
      });
    });
  });
  return out;
}

/**
 * How many bodies to field per creature when a harness wants "a natural-looking
 * fight" of one species — `main.ts`'s parametric check and the balancer guard.
 *
 * It is the HARNESS's choice, not data the content carries; the balancer prices
 * any count. It lived in two files as identical copies, with an unlisted
 * creature silently falling back to 3 — fine for a squad, meaningless for a
 * horde or a boss. `bodiesFor` still falls back, but `UNLISTED_BODIES` makes
 * the arbitrary number visible, and `tests/bench.test.ts` fails if a creature
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
