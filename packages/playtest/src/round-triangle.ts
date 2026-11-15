/**
 * THE TRIANGLE, ROUND BY ROUND — the requirement read on bench's round table
 * (`round-table.ts`; the user, 2026-11-15): once the cards are face up, the
 * answer you wish you had played to an attack is a defense, to a defense a
 * Focus, to a Focus an attack. No strategy is involved and nobody guesses:
 * each column of the table is one plan the other side showed, and the claim
 * is about which of our plans did best against it over the rest of the fight.
 *
 * THE VERDICT is on the three pure columns (both enemies attack, both defend,
 * both play a Focus) and our three pure answers: the claimed answer is
 * clearly ahead of each of the other two. The mixed plans are in the table
 * and printed with it: they show where one hero guarding while the other
 * plays a Focus beats either pure answer.
 */
import { counterPlan, PLANS, roundTableChunk, type Plan, type RoundTable, type RoundTableChunk, type Variant } from '@pimpampum/bench';
import { shiftDefenses } from './fixes.js';
import { installSet, type RunContext } from './prepare.js';

export const PURE: readonly Plan[] = ['AA', 'DD', 'FF'];

export interface RoundEdge {
  /** The plan the other side showed, and the answer the triangle claims for it. */
  theirs: Plan; claimed: Plan;
  /** The claimed answer's score there, and the best score among the other pure answers, with which answer it was. */
  score: number; rival: Plan; rivalScore: number;
  /** The claimed answer's lead over that rival, and its standard error (the two cells taken as independent: the same positions make it smaller than this). */
  lead: number; se: number;
  holds: boolean;
  /** The best answer of all six plans, mixed ones included. */
  best: Plan; bestScore: number;
}

/** Each pure column's edge: is the triangle's answer clearly the one to have played? */
export function roundTriangle(table: Pick<RoundTable, 'cells'>): RoundEdge[] {
  return PURE.map(theirs => {
    const claimed = counterPlan(theirs);
    const at = (ours: Plan) => table.cells[ours][theirs];
    const rival = PURE.filter(p => p !== claimed).reduce((a, b) => (at(b).score > at(a).score ? b : a));
    const best = PLANS.reduce((a, b) => (at(b).score > at(a).score ? b : a));
    const lead = at(claimed).score - at(rival).score, se = Math.hypot(at(claimed).se, at(rival).se);
    return { theirs, claimed, score: at(claimed).score, rival, rivalScore: at(rival).score, lead, se, holds: lead - 2 * se > 0, best, bestScore: at(best).score };
  });
}

/** The edges that do not hold, in words. */
export function roundTriangleVerdict(edges: readonly RoundEdge[]): { ok: boolean; broken: string[] } {
  const broken = edges.filter(e => !e.holds).map(e => `into ${e.theirs}, ${e.claimed} is not clearly the answer (${e.rival} scores ${Math.round(100 * e.rivalScore)}%, ${e.claimed} ${Math.round(100 * e.score)}%)`);
  return { ok: broken.length === 0, broken };
}

/** One chunk of a level's round table, in a child process (bench `isolated`). `defenseShift`: every Defense card's dice that many rungs along, a candidate rule's content change. */
export async function roundTableJob(set: RunContext['set'], level: number, total: number, chunk: number, variant: Variant = {}, defenseShift = 0): Promise<RoundTableChunk> {
  await installSet(set);
  shiftDefenses(defenseShift);
  return roundTableChunk(level, total, chunk, variant);
}
