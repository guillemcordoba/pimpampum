/**
 * THE STRATEGY POOL, GROWN (the user, 2026-11-15: "a game theory algorithm
 * that generates strategies meta and keeps generating a strat that beats the
 * best strat and adds that to the pool"; "we are happy when the strategy pool
 * converges to a player that reads the opponent and does the winning play
 * against it").
 *
 * The algorithm is the DOUBLE ORACLE over policies (McMahan, Gordon and Blum
 * 2003; PSRO, Lanctot et al. 2017). A cyclic game has no best strategy, so
 * "the best" is the pool's EQUILIBRIUM MIX (Balduzzi et al. 2019): the mix of
 * members no member beats. Each step:
 *  1. solve the pool's score table for that mix (`metaMix`);
 *  2. search for the response table (bench `ResponseTable`) that scores most
 *     against it: from the member that already does best, one answer changed
 *     at a time, a change kept only when it clearly scores more;
 *  3. add it and fill its row; stop when the search finds nothing that beats
 *     the mix by `minGain`.
 * A table keeps an answer of its own only where one clearly scored more:
 * after a plan no member of the mix can show, it plays as it opens. So a
 * table that differs from a fixed strategy differs where it matters.
 * The fights are bench's `poolDuel`; here they are a function handed in, so
 * the loop is tested on games whose answer is known.
 *
 * WHAT IS READ AT THE END: who the mix is made of. A member that answers
 * whatever it saw the same way is a fixed strategy; one whose answers follow
 * what the other side showed is a reader. THE REQUIREMENT (`poolVerdict`;
 * the user, 2026-11-15: "a test or requirement that goes red when the best
 * strat is a dumb one"): the mix is mostly readers, and each fixed strategy
 * in the pool has a member that clearly beats it. Proved on mock games whose
 * best strategy is known (`test/pool.test.ts`).
 */
import { always, counterPlan, PLANS, poolDuel, tableKey, type Plan, type PoolDuel, type PoolMember, type ResponseTable, type Variant } from '@pimpampum/bench';
import { installSet, type RunContext } from './prepare.js';

/** X's score against Y for each pair asked, in order: the fights, however they are run. */
export type Evaluate = (pairs: readonly (readonly [ResponseTable, ResponseTable])[]) => Promise<number[]>;

export interface PoolOptions {
  /** The pool's first members; always attack, unless said. */
  start?: readonly ResponseTable[];
  /** Stop adding at this many members. */
  maxMembers: number;
  /** A new table must beat the mix by this much (in score) to be added. */
  minGain: number;
  /** A changed answer is kept when it scores this much more than the table it changes. */
  minStep: number;
  /** Called as the pool grows. */
  onStep?: (step: PoolStep, members: readonly ResponseTable[]) => void;
}

export const POOL_DEFAULTS: PoolOptions = { maxMembers: 14, minGain: 0.04, minStep: 0.02 };

export interface PoolStep {
  added: ResponseTable;
  /** Its score against the mix it was searched against, less an even ½. */
  gain: number;
  /** That mix, by member, as the pool stood. */
  against: number[];
}

export interface PoolResult {
  members: ResponseTable[];
  /** `score[i][j]`: member i's score against member j. */
  score: number[][];
  /** The equilibrium mix over the members, and how much the best member still gains on it. */
  mix: number[]; exploit: number;
  steps: PoolStep[];
  /** True: the last search found nothing that beats the mix; false: stopped at `maxMembers`. */
  converged: boolean;
}

/**
 * The equilibrium mix of a symmetric score table (`score[i][j]` + `score[j][i]`
 * = 1): multiplicative weights played against itself, averaged. `exploit`:
 * what the best member scores against the mix, less ½ (0 at the equilibrium).
 */
export function metaMix(score: readonly (readonly number[])[], rounds = 20_000): { mix: number[]; exploit: number } {
  const n = score.length;
  let x = Array<number>(n).fill(1 / n);
  const average = Array<number>(n).fill(0);
  const against = (mix: readonly number[]) => score.map(row => row.reduce((t, s, j) => t + (s - 0.5) * mix[j], 0));
  for (let t = 1; t <= rounds; t++) {
    const gain = against(x), eta = 2 / Math.sqrt(t);
    const next = x.map((p, i) => p * Math.exp(eta * gain[i]));
    const total = next.reduce((a, b) => a + b, 0);
    x = next.map(p => p / total);
    for (let i = 0; i < n; i++) average[i] += x[i] / rounds;
  }
  return { mix: average, exploit: Math.max(...against(average)) };
}

/** The plans a member can show: its entries, and what each collapses to when one of its heroes is down. */
function shows(t: ResponseTable): Set<Plan> {
  const out = new Set<Plan>();
  for (const plan of [t.first, ...PLANS.map(p => t.after[p])]) {
    out.add(plan);
    out.add(`${plan[0]}${plan[0]}` as Plan);
    out.add(`${plan[1]}${plan[1]}` as Plan);
  }
  return out;
}

type Context = 'first' | Plan;
const answer = (t: ResponseTable, c: Context): Plan => (c === 'first' ? t.first : t.after[c]);
const withAnswer = (t: ResponseTable, c: Context, plan: Plan): ResponseTable => (c === 'first' ? { ...t, first: plan } : { ...t, after: { ...t.after, [c]: plan } });

/** Members holding less of the mix than this are not searched against. */
const SUPPORT = 0.01;

export async function growPool(evaluate: Evaluate, options: Partial<PoolOptions> = {}): Promise<PoolResult> {
  const opts = { ...POOL_DEFAULTS, ...options };
  const members: ResponseTable[] = [...(opts.start ?? [always('AA')])];
  const score: number[][] = members.map(() => []);
  const fill = async (from: number) => {
    const pairs: [number, number][] = [];
    for (let i = from; i < members.length; i++) for (let j = 0; j < i; j++) pairs.push([i, j]);
    const scores = await evaluate(pairs.map(([i, j]) => [members[i], members[j]] as const));
    pairs.forEach(([i, j], k) => { (score[i] ??= [])[j] = scores[k]; (score[j] ??= [])[i] = 1 - scores[k]; });
    for (let i = 0; i < members.length; i++) (score[i] ??= [])[i] = 0.5;
  };
  await fill(1);
  const steps: PoolStep[] = [];
  let converged = false;
  while (members.length < opts.maxMembers) {
    const { mix } = metaMix(score);
    const support = mix.map((p, j) => ({ p, j })).filter(s => s.p >= SUPPORT);
    const weight = support.reduce((t, s) => t + s.p, 0);
    const valueOf = async (tables: readonly ResponseTable[]): Promise<number[]> => {
      const scores = await evaluate(tables.flatMap(t => support.map(s => [t, members[s.j]] as const)));
      return tables.map((_, k) => support.reduce((t, s, i) => t + s.p * scores[k * support.length + i], 0) / weight);
    };
    // From the member that already does best against the mix, one answer at a time.
    const standing = members.map((_, i) => support.reduce((t, s) => t + s.p * score[i][s.j], 0) / weight);
    let table = members[standing.indexOf(Math.max(...standing))];
    let value = Math.max(...standing);
    const seen = new Set<Plan>(support.flatMap(s => [...shows(members[s.j])]));
    const contexts: Context[] = ['first', ...PLANS.filter(p => seen.has(p))];
    for (const context of contexts) {
      const candidates = PLANS.filter(p => p !== answer(table, context)).map(p => withAnswer(table, context, p));
      const values = await valueOf(candidates);
      const best = values.indexOf(Math.max(...values));
      if (values[best] > value + opts.minStep) { table = candidates[best]; value = values[best]; }
    }
    // After a plan the mix cannot show, the table plays as it opens: the same score against the mix, and no answer left over from the member it grew from.
    table = { first: table.first, after: Object.fromEntries(PLANS.map(p => [p, seen.has(p) ? table.after[p] : table.first])) as Record<Plan, Plan> };
    const gain = value - 0.5;
    if (gain < opts.minGain || members.some(m => tableKey(m) === tableKey(table))) { converged = true; break; }
    members.push(table);
    await fill(members.length - 1);
    const step = { added: table, gain, against: mix };
    steps.push(step);
    opts.onStep?.(step, members);
  }
  return { members, score, ...metaMix(score), steps, converged };
}

/** Does the table answer everything the same way: a fixed strategy, whatever the other side shows? */
export const isFixed = (t: ResponseTable): boolean => PLANS.every(p => t.after[p] === t.first);

/** How many of the six plans it answers with the triangle's counter. */
export const countersPlayed = (t: ResponseTable): number => PLANS.filter(p => t.after[p] === counterPlan(p)).length;

/** A table in words: "always AA", or its opening and each answer that differs from it. */
export function describeTable(t: ResponseTable): string {
  if (isFixed(t)) return `always ${t.first}`;
  return `opens ${t.first}; ${PLANS.filter(p => t.after[p] !== t.first).map(p => `after ${p} plays ${t.after[p]}`).join(', ')}; else ${t.first}`;
}

/** The share of the equilibrium mix held by members that answer what they see. */
export const POOL_READER_SHARE = 0.5;

export interface PoolVerdict {
  /** The mix's share on readers, and whether it is the larger part. */
  readers: number; endsOnReaders: boolean;
  /** Each fixed member: its share of the mix, the member that does best against it, that score, and whether it is clearly past an even duel. */
  fixed: { table: ResponseTable; share: number; beatenBy: ResponseTable | null; score: number; clearly: boolean }[];
  /** The best strategy is not a dumb one: the mix ends on readers and every fixed member is clearly beaten. */
  ok: boolean;
  /** Why not, in words. */
  why: string[];
}

/** `games`: the fights behind each score, for "clearly" (2σ past an even duel); omit for scores that are exact. */
export function poolVerdict(r: Pick<PoolResult, 'members' | 'score' | 'mix'>, games?: number): PoolVerdict {
  const noise = games ? 2 * Math.sqrt(0.25 / games) : 0;
  const readers = r.members.reduce((t, m, i) => t + (isFixed(m) ? 0 : r.mix[i]), 0);
  const fixed = r.members.map((table, j) => ({ table, j })).filter(m => isFixed(m.table)).map(({ table, j }) => {
    const rivals = r.members.map((_, i) => i).filter(i => i !== j);
    const best = rivals.length ? rivals.reduce((a, b) => (r.score[b][j] > r.score[a][j] ? b : a)) : -1;
    const score = best < 0 ? 0.5 : r.score[best][j];
    return { table, share: r.mix[j], beatenBy: best < 0 ? null : r.members[best], score, clearly: score - noise > 0.5 };
  });
  const endsOnReaders = readers >= POOL_READER_SHARE;
  const why = [
    ...(endsOnReaders ? [] : [`the mix is ${Math.round(100 * (1 - readers))}% strategies that ignore the opponent (${fixed.filter(f => f.share >= 0.05).sort((a, b) => b.share - a.share).map(f => `${describeTable(f.table)} ${Math.round(100 * f.share)}%`).join(', ')})`]),
    ...fixed.filter(f => !f.clearly).map(f => `nothing in the pool clearly beats ${describeTable(f.table)}`),
  ];
  return { readers, endsOnReaders, fixed, ok: why.length === 0, why };
}

/** One pool duel in a child process (bench `isolated`). */
export async function poolDuelJob(set: RunContext['set'], x: PoolMember, y: PoolMember, level: number, games: number, variant: Variant = {}): Promise<PoolDuel> {
  await installSet(set);
  return poolDuel(x, y, level, games, variant);
}
