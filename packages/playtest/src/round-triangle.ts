/**
 * THE TRIANGLE, ROUND BY ROUND — the requirement read on bench's round table
 * (`round-table.ts`; the user, 2026-11-15): once the cards are face up, the
 * answer you wish you had played to an attack is a defense, to a defense a
 * Focus, to a Focus an attack. No strategy is involved and nobody guesses:
 * each column of the table is one plan the other side showed, and the claim
 * is about which of our plans did best against it over the rest of the fight.
 *
 * THE VERDICT is on the three pure columns (both enemies attack, both defend,
 * both play a Focus). Our six answers split in two: those that hold the
 * counter (into both attacking: DD, and the mixed AD and DF, where one hero
 * guards) and those that do not (AA, AF, FF). The edge holds when the best
 * answer holding the counter is clearly ahead of the best one without it: a
 * side of two whose right reply is one hero on the counter and the other on
 * something else did play the counter (GOALS.md goal 1, item b; until
 * 2026-11-17 only the pure DD was credited, against the pure AA and FF).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTER, games, inLanes, isolated, mergeRoundTable, PLANS, roundTableChunk, roundTableChunks, type Kind, type Plan, type RoundTable, type RoundTableChunk, type Variant } from '@pimpampum/bench';
import { shiftDefenses } from './fixes.js';
import { installSet, type RunContext } from './prepare.js';
import { ROUND_POSITIONS } from './rules.js';

export const PURE: readonly Plan[] = ['AA', 'DD', 'FF'];

export interface RoundEdge {
  /** The plan the other side showed, and the card type the triangle claims for it. */
  theirs: Plan; counter: Kind;
  /** The best of our answers holding the counter, and its score there. */
  claimed: Plan; score: number;
  /** The best of our answers without it, and its score. */
  rival: Plan; rivalScore: number;
  /** The claimed answer's lead over that rival, and its standard error (the two cells taken as independent: the same positions make it smaller than this). */
  lead: number; se: number;
  holds: boolean;
  /** The best answer of all six plans. */
  best: Plan; bestScore: number;
}

/** Each pure column's edge: is an answer holding the triangle's counter clearly the one to have played? */
export function roundTriangle(table: Pick<RoundTable, 'cells'>): RoundEdge[] {
  return PURE.map(theirs => {
    const counter = COUNTER[theirs[0] as Kind];
    const at = (ours: Plan) => table.cells[ours][theirs];
    const top = (plans: readonly Plan[]) => plans.reduce((a, b) => (at(b).score > at(a).score ? b : a));
    const claimed = top(PLANS.filter(p => p.includes(counter)));
    const rival = top(PLANS.filter(p => !p.includes(counter)));
    const best = top(PLANS);
    const lead = at(claimed).score - at(rival).score, se = Math.hypot(at(claimed).se, at(rival).se);
    return { theirs, counter, claimed, score: at(claimed).score, rival, rivalScore: at(rival).score, lead, se, holds: lead - 2 * se > 0, best, bestScore: at(best).score };
  });
}

/** The edges that do not hold, in words. */
export function roundTriangleVerdict(edges: readonly RoundEdge[]): { ok: boolean; broken: string[] } {
  const broken = edges.filter(e => !e.holds).map(e => `into ${e.theirs}, no answer holding ${e.counter} is clearly ahead (${e.rival} scores ${Math.round(100 * e.rivalScore)}%, ${e.claimed} ${Math.round(100 * e.score)}%)`);
  return { ok: broken.length === 0, broken };
}

/** One chunk of a level's round table, in a child process (bench `isolated`). `defenseShift`: every Defense card's dice that many rungs along, a candidate rule's content change. */
export async function roundTableJob(set: RunContext['set'], level: number, total: number, chunk: number, variant: Variant = {}, defenseShift = 0): Promise<RoundTableChunk> {
  await installSet(set);
  shiftDefenses(defenseShift);
  return roundTableChunk(level, total, chunk, variant);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The built module the chunks run in: this one, from `dist/`. */
const SELF = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'round-triangle.js');

export interface RoundTriangleLevel { level: number; table: RoundTable; edges: RoundEdge[]; ok: boolean; broken: string[] }

export interface RoundTriangleOptions {
  /** Round starts a level; `ROUND_POSITIONS` (through bench's `games()`), unless said. */
  positions?: number;
  /** A candidate rule (playtest `DEFENSE_RULES`), or every hero on one PV. */
  variant?: Variant; defenseShift?: number;
  onChunk?: (done: number, total: number) => void;
}

/** Each level's round table and its verdict: the chunks in child processes across bench's lanes, then summed. */
export async function measureRoundTriangle(set: RunContext['set'], levels: readonly number[], opts: RoundTriangleOptions = {}): Promise<RoundTriangleLevel[]> {
  const positions = opts.positions ?? games(ROUND_POSITIONS);
  const jobs = levels.flatMap(level => Array.from({ length: roundTableChunks(positions) }, (_, chunk) => ({ level, chunk })));
  let done = 0;
  const parts = await inLanes(jobs.map(({ level, chunk }) => async () => {
    const part = await isolated<RoundTableChunk>(SELF, 'roundTableJob', [set, level, positions, chunk, opts.variant ?? {}, opts.defenseShift ?? 0]);
    opts.onChunk?.(++done, jobs.length);
    return { level, part };
  }));
  return levels.map(level => {
    const table = mergeRoundTable(level, parts.filter(p => p.level === level).map(p => p.part));
    const edges = roundTriangle(table);
    return { level, table, edges, ...roundTriangleVerdict(edges) };
  });
}
