/**
 * THE POSITIONS A SUBJECT IS MEASURED IN — computed from a set's declared
 * calibration.
 *
 * A kit is never measured against one fight: a kit that shines against a horde
 * and folds against a boss reads as fine. So the subject is thrown at a MATRIX
 * of shapes × company rows, and every score is a DELTA from what a neutral kit
 * gets in the same seat.
 *
 * THE CALIBRATION BUG THIS EXISTS TO FIX. The analyzer used to price each shape
 * against four main kits at full kit and then print "each cell is a fair fight
 * by construction". The cells are not that party. A cell is the SUBJECT plus a
 * company row, so the calibration party is CELL-SHAPED: a neutral stand-in in
 * seat 1 plus the real company row behind it. The shape is solved against one
 * row and then MEASURED against all of them, so what the report prints is what
 * was measured rather than what was assumed.
 *
 * Everything here used to live inside the fantasy set. None of it is fantasy:
 * given the set's data — shapes, company rows, stand-ins, the fair winrate and
 * the saturation band (`GameSet.calibration`) — this is the same for any set.
 */
import { theSet, type Cell, type FieldedGroup, type PartySpec, type Shape } from './gameset.js';
import { countedCached, enemyPrint, key, skillPrint } from './cache.js';
import { calibrationGames, searchGames } from './games.js';
import { cellResult } from './cells.js';

/**
 * Games behind each per-cell baseline (±~2.2pp).
 *
 * These numbers are subtracted from every subject's score, so their error
 * enters every delta. They are measured once per run and reused across every
 * kit and level, which is what makes it affordable to buy precision here.
 */
const BASELINE_GAMES = 500;
/** Fresh numbers, apart from every subject arm's: a baseline that shared the
 *  subject's dice would subtract its luck along with its skill. */
const BASELINE_OFFSET = 616_000;
/** The solver's search budget for a shape. */
const SHAPE_SEARCH_GAMES = 120;

/** The set's benchmark party, as an EXPLICIT spec — the same heroes every
 *  game, so the honest error bar is the binomial one. */
export function referenceParty(level?: number): PartySpec {
  const set = theSet();
  return {
    characters: set.calibration.referenceKits.map((id, i) => set.hero(`Heroi ${i + 1}`, id, level)),
  };
}

/** How many company rows the set declares. */
export function companyCount(): number {
  return theSet().calibration.company.length;
}

/** The stand-in for one company row. */
export function standInFor(companyIdx: number): string {
  const { standIns } = theSet().calibration;
  return standIns[companyIdx % standIns.length];
}

/** A CELL-SHAPED party: the neutral stand-in in seat 1, the real company row
 *  behind it — the same construction a cell uses, with the subject swapped out. */
export function calibrationParty(companyIdx: number): PartySpec {
  const set = theSet();
  const { company } = set.calibration;
  return {
    characters: [
      set.hero('Patró', standInFor(companyIdx)),
      ...company[companyIdx % company.length].map((id, i) => set.hero(`Company ${i + 1}`, id)),
    ],
  };
}

/** A company row with a SUBJECT in seat 1 instead of the stand-in. */
export function subjectParty(kitId: string, level: number, companyIdx: number): PartySpec {
  const set = theSet();
  const base = calibrationParty(companyIdx).characters!;
  return { characters: [set.hero('Subjecte', kitId, level), ...base.slice(1)] };
}

export interface SolvedShape {
  groups: FieldedGroup[];
  /**
   * THE NEUTRAL BASELINE, per company row: what a neutral kit scores in this
   * exact seat. Every subject is reported against it, and two things fall out
   * of subtracting it: the CELL's own difficulty cancels, so a shape drifting
   * as content is added no longer moves any kit's score; and the SEATING
   * cancels, which was worth up to 66pp.
   */
  byCompany: number[];
  /** Mean of the baselines — how hard this shape is on average. Reported for
   *  the reader; nothing is judged against it. */
  mean: number;
  /**
   * Max − min across the rows. READ WITH CARE: the stand-in differs per row (it
   * must, or it would sit beside a copy of itself), so this mixes the ally
   * row's effect with the stand-in's.
   */
  spread: number;
  games: number;
}

/** What a fielded composition is, for cache keying. */
export function groupsPrint(groups: FieldedGroup[]): string {
  return groups.map(g => `${g.count}x${enemyPrint(g.enemyId)}@${g.pv}L${g.level}`).join('+');
}

/** What a company row's party is made of, for cache keying. */
export function companyPrint(companyIdx: number): string {
  return partyPrint(companyIdx);
}

function partyPrint(companyIdx: number): string {
  const { company } = theSet().calibration;
  return [standInFor(companyIdx), ...company[companyIdx % company.length]].map(skillPrint).join('/');
}

function poolPrint(shape: Shape): string {
  return shape.pool.map(p => `${p.count}x${enemyPrint(p.enemyId)}`).join('+');
}

/**
 * The solved composition alone — what stands on the table, at what PV.
 *
 * Split from the baselines so the two can be cached apart: they depend on
 * different content (the solve only sees company 0's party), which is what
 * lets an edit to one kit leave most of this cached.
 */
export function shapeEnemies(shapeIdx: number): FieldedGroup[] {
  const set = theSet();
  const shape = set.calibration.shapes[shapeIdx];
  const { fair, maxAvgRounds } = set.calibration;
  const search = searchGames(SHAPE_SEARCH_GAMES);
  const k = key('solve', poolPrint(shape), partyPrint(0), String(fair), String(search), String(maxAvgRounds));
  return countedCached<FieldedGroup[]>('shape', k, () => {
    const solved = set.solveEncounter(shape.pool, calibrationParty(0), fair, { searchGames: search, maxAvgRounds });
    return solved
      ? solved.groups.map(g => ({ enemyId: g.enemyId, count: g.count, level: g.level, pv: g.pv }))
      : [];
  });
}

/**
 * The neutral baseline for one (shape, company) cell.
 *
 * MEASURED BY THE SAME MACHINERY AS EVERY SUBJECT ARM — the cell runner, the
 * cell AI, the cell targeting — with the neutral stand-in in the subject's seat.
 * A baseline is subtracted from every score, so anything that differs between
 * how it and a subject are measured lands in every delta as a constant bias.
 * It used to come from the set's own encounter simulator, which played with a
 * different target chooser (and, in a set that solves cheaply, a different
 * depth): a neutral kit measured against its own baseline did not score zero.
 */
export function baselineFor(shapeIdx: number, companyIdx: number): number {
  const groups = shapeEnemies(shapeIdx);
  if (groups.length === 0) return 1;
  const games = calibrationGames(BASELINE_GAMES);
  const groupPrint = groups.map(g => `${g.count}x${g.enemyId}@${g.pv}L${g.level}`).join('+');
  const k = key('base-cell', groupPrint, partyPrint(companyIdx), String(games), String(BASELINE_OFFSET));
  const cell: Cell = { shapeIdx, companyIdx, label: 'baseline', baseline: 0, baselineGames: 0, context: '' };
  return countedCached<number>('baseline', k, () => cellResult(
    () => ({ party: calibrationParty(companyIdx), enemies: groups, subjectTeam: 0 }),
    cell, games, BASELINE_OFFSET,
  ).winrate);
}

const solvedMemo = new Map<string, SolvedShape>();

/** Price one shape, then measure the neutral baseline in every company row. */
export function solvedShape(shapeIdx: number): SolvedShape {
  const memoKey = `${theSet().id}:${shapeIdx}`;
  const hit = solvedMemo.get(memoKey);
  if (hit) return hit;
  const solvedOk = shapeEnemies(shapeIdx).length > 0;
  const rows = Array.from({ length: companyCount() }, (_, i) => i);
  const byCompany = rows.map(i => (solvedOk ? baselineFor(shapeIdx, i) : 1));
  const mean = byCompany.reduce((a, b) => a + b, 0) / byCompany.length;
  const entry: SolvedShape = {
    groups: shapeEnemies(shapeIdx),
    byCompany,
    mean,
    spread: Math.max(...byCompany) - Math.min(...byCompany),
    games: calibrationGames(BASELINE_GAMES),
  };
  solvedMemo.set(memoKey, entry);
  return entry;
}

/** Whether a neutral baseline is pinned against an edge. */
export function isSaturated(baseline: number): boolean {
  const { min, max } = theSet().calibration.saturation;
  return baseline < min || baseline > max;
}

function allCells(): Cell[] {
  const out: Cell[] = [];
  theSet().calibration.shapes.forEach((shape, shapeIdx) => {
    const solved = solvedShape(shapeIdx);
    solved.byCompany.forEach((baseline, companyIdx) => out.push({
      shapeIdx, companyIdx, baseline,
      baselineGames: solved.games,
      label: `${shape.label}/c${companyIdx + 1}`,
      context: `${companyPrint(companyIdx)}|${groupsPrint(solved.groups)}`,
    }));
  });
  return out;
}

/**
 * Every cell worth measuring in: the full shape × company matrix, minus the
 * positions where the neutral baseline is pinned against an edge.
 *
 * THE ONLY THING A CELL HAS TO BE IS UNSATURATED. Every verdict is already a
 * delta, and a delta does not care where the cell sits — only that it is not
 * against an edge, where every arm reads the same and differences compress to
 * nothing. A cell whose baseline is 96% cannot show that one kit is better than
 * another; both win it.
 */
export function usableCells(): Cell[] {
  return allCells().filter(c => !isSaturated(c.baseline));
}

/** The cells the saturation test rejected, so a report can name them rather
 *  than silently measuring in fewer places than the reader assumes. */
export function saturatedCells(): Cell[] {
  return allCells().filter(c => isSaturated(c.baseline));
}
