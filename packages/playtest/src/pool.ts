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
 * members no member beats. The pool starts from the three dumbest strategies
 * (always attack, always defend, always Focus). Each step:
 *  1. solve the pool's score table for that mix (`metaMix`);
 *  2. search for the strategy (bench `Strategy`) that scores most against it:
 *     every family's grid of numbers (`gridOf`), and for the tables, from the
 *     one that already does best, one answer changed at a time, a change kept
 *     only when it clearly scores more;
 *  3. measure the best found again on fights the search did not see, add it
 *     when it still beats the mix, and fill its row from such fights; stop
 *     when nothing found does.
 * A table keeps an answer of its own only where one clearly scored more:
 * after a plan no member of the mix can show, it plays as it opens.
 * The fights are bench's `poolDuel`; here they are a function handed in, so
 * the loop is tested on games whose answer is known.
 *
 * WHAT IS READ AT THE END: who the mix is made of. THE REQUIREMENT
 * (`poolVerdict`; the user, 2026-11-15: "a test or requirement that goes red
 * when the best strat is a dumb one"): a strategy is DUMB when it plays the
 * same way whatever happens (always one plan, fixed odds, a script by round
 * number); it is aware when it follows the fight (a state player) or what the
 * other side showed (a table with answers of its own). Green when the mix is
 * mostly aware strategies and each of the three dumbest clearly LOSES to the
 * mix: one that scores even against it plays as well as the best, whoever
 * else in the pool beats it. Proved on mock games whose best strategy is
 * known (`test/pool.test.ts`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { always, counterPlan, inLanes, isolated, memberKey, PLANS, poolDuel, skillPrint, type Plan, type PoolDuel, type PoolMember, type ResponseTable, type Strategy, type Variant } from '@pimpampum/bench';
import { shiftDefenses } from './fixes.js';
import { installSet, withSubject, type ControlName, type RunContext } from './prepare.js';

/** X's score against Y for each pair asked, in order: the fights, however they
 *  are run. `fresh`: which set of fights (0 the search's; 1, 2: sets it never saw). */
export type Evaluate = (pairs: readonly (readonly [Strategy, Strategy])[], fresh?: number) => Promise<number[]>;

export interface PoolOptions {
  /** The pool's first members; the three dumbest, unless said. */
  start?: readonly Strategy[];
  /** The kinds of strategy the search may add; all, unless said. */
  families?: readonly Strategy['kind'][];
  /** Stop adding at this many members. */
  maxMembers: number;
  /** A new strategy must beat the mix by this much (in score) to be added. */
  minGain: number;
  /** A table's changed answer is kept when it scores this much more than the table it changes. */
  minStep: number;
  /** Called as the pool grows. */
  onStep?: (step: PoolStep, members: readonly Strategy[]) => void;
}

export const POOL_DEFAULTS: PoolOptions = { maxMembers: 14, minGain: 0.04, minStep: 0.02 };
/** The three dumbest strategies: spam, the turtle, all Focus. */
export const DUMBEST: readonly ResponseTable[] = [always('AA'), always('DD'), always('FF')];
/** A found strategy is added when, on fights the search never saw, it keeps this share of `minGain`. */
const CONFIRM = 0.75;
/** The best this many found are tried, in order, before the search gives up. */
const TRIES = 3;

export interface PoolStep {
  added: Strategy;
  /** Its score against the mix it was searched against, less an even ½: on the search's fights, and on the fights that confirmed it. */
  gain: number; confirmed: number;
  /** That mix, by member, as the pool stood. */
  against: number[];
}

export interface PoolResult {
  members: Strategy[];
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

const isTable = (m: Strategy): m is ResponseTable => m.kind === 'table';

/** Every strategy of a family the search tries: the numbers on a grid. */
export function gridOf(kind: Strategy['kind']): Strategy[] {
  switch (kind) {
    case 'table': return PLANS.map(always);
    case 'mixer': {
      const odds = [0, 0.25, 0.5, 0.75, 1];
      // The corners are always-attack, always-defend and always-Focus: tables.
      return odds.flatMap(attack => odds.filter(defense => attack + defense <= 1 && Math.max(attack, defense, 1 - attack - defense) < 1)
        .map(defense => ({ kind: 'mixer' as const, attack, defense })));
    }
    case 'state': {
      const shares = [0, 0.4, 0.7];
      // With no threshold it follows nothing: a script.
      return shares.flatMap(guardBelow => shares.flatMap(strikeBelow => (guardBelow + strikeBelow > 0 ? [0, 1, 2] : [])
        .map(focusRounds => ({ kind: 'state' as const, guardBelow, strikeBelow, focusRounds }))));
    }
    case 'script': {
      const openings: Plan[] = ['DF', 'FF', 'AF', 'AD', 'DD'], after: Plan[] = ['AA', 'AD'];
      return openings.flatMap(opening => after.filter(then => then !== opening).flatMap(then => [1, 2, 3].map(rounds => ({ kind: 'script' as const, opening, rounds, then }))));
    }
  }
}

export const FAMILIES: readonly Strategy['kind'][] = ['table', 'mixer', 'state', 'script'];

/** The plans a member can show: a table's entries and what each collapses to when one of its heroes is down; anything, for the rest. */
function shows(m: Strategy): Set<Plan> {
  if (!isTable(m)) return new Set(PLANS);
  const out = new Set<Plan>();
  for (const plan of [m.first, ...PLANS.map(p => m.after[p])]) {
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
  const families = opts.families ?? FAMILIES;
  const members: Strategy[] = [...(opts.start ?? DUMBEST)];
  const has = (m: Strategy) => members.some(x => memberKey(x) === memberKey(m));
  const score: number[][] = members.map(() => []);
  // The score table is filled from fights no search looked at: a strategy picked for scoring well on the search's fights scores too well on them.
  const fill = async (from: number) => {
    const pairs: [number, number][] = [];
    for (let i = from; i < members.length; i++) for (let j = 0; j < i; j++) pairs.push([i, j]);
    const scores = await evaluate(pairs.map(([i, j]) => [members[i], members[j]] as const), 1);
    pairs.forEach(([i, j], k) => { score[i][j] = scores[k]; score[j][i] = 1 - scores[k]; });
    for (let i = 0; i < members.length; i++) score[i][i] = 0.5;
  };
  await fill(1);
  const steps: PoolStep[] = [];
  let converged = false;
  while (members.length < opts.maxMembers) {
    const { mix } = metaMix(score);
    const support = mix.map((p, j) => ({ p, j })).filter(s => s.p >= SUPPORT);
    const weight = support.reduce((t, s) => t + s.p, 0);
    const valueOf = async (found: readonly Strategy[], fresh = 0): Promise<number[]> => {
      const scores = await evaluate(found.flatMap(m => support.map(s => [m, members[s.j]] as const)), fresh);
      return found.map((_, k) => support.reduce((t, s, i) => t + s.p * scores[k * support.length + i], 0) / weight);
    };
    // Every family's grid.
    const grid = families.flatMap(gridOf).filter(m => !has(m));
    const found = (await valueOf(grid)).map((value, k) => ({ strategy: grid[k], value }));
    // The tables, from the one that does best against the mix, one answer at a time.
    if (families.includes('table')) {
      const tables = [...members.filter(isTable), ...grid.filter(isTable)];
      const start = await valueOf(tables);
      let value = Math.max(...start), table = tables[start.indexOf(value)];
      const seen = new Set<Plan>(support.flatMap(s => [...shows(members[s.j])]));
      const contexts: Context[] = ['first', ...PLANS.filter(p => seen.has(p))];
      for (const context of contexts) {
        const candidates = PLANS.filter(p => p !== answer(table, context)).map(p => withAnswer(table, context, p));
        const values = await valueOf(candidates);
        const best = values.indexOf(Math.max(...values));
        if (values[best] > value + opts.minStep) { table = candidates[best]; value = values[best]; }
      }
      // After a plan the mix cannot show, the table plays as it opens: the same score against the mix, and no answer left over from the table it grew from.
      table = { kind: 'table', first: table.first, after: Object.fromEntries(PLANS.map(p => [p, seen.has(p) ? table.after[p] : table.first])) as Record<Plan, Plan> };
      const grown = table;
      if (!has(grown) && !found.some(f => memberKey(f.strategy) === memberKey(grown))) found.push({ strategy: grown, value });
    }
    // The best found, measured again on fights the search never saw.
    let added: PoolStep | null = null;
    for (const candidate of found.sort((a, b) => b.value - a.value).slice(0, TRIES)) {
      const gain = candidate.value - 0.5;
      if (gain < opts.minGain) break;
      const again = await Promise.all([1, 2].map(fresh => valueOf([candidate.strategy], fresh)));
      const confirmed = (again[0][0] + again[1][0]) / 2 - 0.5;
      if (confirmed < CONFIRM * opts.minGain) continue;
      added = { added: candidate.strategy, gain, confirmed, against: mix };
      break;
    }
    if (!added) { converged = true; break; }
    members.push(added.added);
    score.push([]);
    await fill(members.length - 1);
    steps.push(added);
    opts.onStep?.(added, members);
  }
  return { members, score, ...metaMix(score), steps, converged };
}

/** Does the table answer everything the same way: a fixed strategy, whatever the other side shows? */
export const isFixed = (t: ResponseTable): boolean => PLANS.every(p => t.after[p] === t.first);

/** How many of the six plans a table answers with the triangle's counter. */
export const countersPlayed = (t: ResponseTable): number => PLANS.filter(p => t.after[p] === counterPlan(p)).length;

/** What a strategy follows: nothing (dumb), the state of the fight, or what the other side showed. */
export type Awareness = 'dumb' | 'state' | 'reads';
export function awarenessOf(m: Strategy): Awareness {
  if (m.kind === 'table') return isFixed(m) ? 'dumb' : 'reads';
  if (m.kind === 'state') return m.guardBelow > 0 || m.strikeBelow > 0 ? 'state' : 'dumb';
  return 'dumb';
}

const share = (x: number) => `${Math.round(100 * x)}%`;

/** A strategy in words. */
export function describeStrategy(m: Strategy): string {
  switch (m.kind) {
    case 'table':
      if (isFixed(m)) return `always ${m.first}`;
      return `opens ${m.first}; ${PLANS.filter(p => m.after[p] !== m.first).map(p => `after ${p} plays ${m.after[p]}`).join(', ')}; else ${m.first}`;
    case 'mixer': return `each hero: attack ${share(m.attack)}, defense ${share(m.defense)}, Focus ${share(1 - m.attack - m.defense)}`;
    case 'state': return [
      ...(m.strikeBelow ? [`both attack when an enemy is under ${share(m.strikeBelow)} PV`] : []),
      ...(m.guardBelow ? [`one guards when one of its own is under ${share(m.guardBelow)}`] : []),
      m.focusRounds ? `else Focus through round ${m.focusRounds}, then attack` : 'else attack',
    ].join('; ');
    case 'script': return `${m.opening} for ${m.rounds} round${m.rounds === 1 ? '' : 's'}, then ${m.then}`;
  }
}

/** The share of the equilibrium mix that aware strategies must hold. */
export const POOL_AWARE_SHARE = 0.5;

export interface PoolVerdict {
  /** The mix's share by what its members follow. */
  shares: Record<Awareness, number>;
  /** Each of the three dumbest strategies in the pool: its share of the mix, its score against the mix (with its standard error) and whether that is clearly under an even duel; and the member that does best against it, with that score. */
  dumbest: { table: ResponseTable; share: number; againstMix: number; se: number; loses: boolean; beatenBy: Strategy | null; score: number }[];
  /** The best strategy is not a dumb one: the mix is mostly aware strategies and each of the dumbest clearly loses to it. */
  ok: boolean;
  /** Why not, in words. */
  why: string[];
}

/** `games`: the fights behind each score, for "clearly" (2σ under an even duel); omit for scores that are exact. */
export function poolVerdict(r: Pick<PoolResult, 'members' | 'score' | 'mix'>, games?: number): PoolVerdict {
  const shares: Record<Awareness, number> = { dumb: 0, state: 0, reads: 0 };
  r.members.forEach((m, i) => { shares[awarenessOf(m)] += r.mix[i]; });
  const dumbest = r.members.map((m, j) => ({ m, j })).filter((x): x is { m: ResponseTable; j: number } => DUMBEST.some(d => memberKey(d) === memberKey(x.m))).map(({ m, j }) => {
    const rivals = r.members.map((_, i) => i).filter(i => i !== j);
    const best = rivals.length ? rivals.reduce((a, b) => (r.score[b][j] > r.score[a][j] ? b : a)) : -1;
    const againstMix = r.mix.reduce((t, p, i) => t + p * r.score[j][i], 0);
    // Each duel is its own sample; the member's duel with itself is an even ½ by construction.
    const se = games ? Math.sqrt(r.mix.reduce((t, p, i) => t + (i === j ? 0 : p * p * 0.25 / games), 0)) : 0;
    return { table: m, share: r.mix[j], againstMix, se, loses: againstMix + 2 * se < 0.5 - 1e-9, beatenBy: best < 0 ? null : r.members[best], score: best < 0 ? 0.5 : r.score[best][j] };
  });
  const dumbMembers = r.members.map((m, i) => ({ m, share: r.mix[i] })).filter(x => awarenessOf(x.m) === 'dumb' && x.share >= 0.05).sort((a, b) => b.share - a.share);
  const why = [
    ...(shares.state + shares.reads >= POOL_AWARE_SHARE ? [] : [`the mix is ${share(shares.dumb)} strategies that play the same whatever happens (${dumbMembers.map(x => `${describeStrategy(x.m)} ${share(x.share)}`).join('; ')})`]),
    ...dumbest.filter(f => !f.loses).map(f => `${describeStrategy(f.table)} does not clearly lose to the mix (${share(f.againstMix)} against it)`),
  ];
  return { shares, dumbest, ok: why.length === 0, why };
}

/** One pool duel in a child process (bench `isolated`). `defenseShift`: every Defense card's dice that many rungs along, a candidate rule's content change. */
export async function poolDuelJob(set: RunContext['set'], x: PoolMember, y: PoolMember, level: number, games: number, variant: Variant = {}, fresh = 0, defenseShift = 0): Promise<PoolDuel> {
  await installSet(set);
  shiftDefenses(defenseShift);
  return poolDuel(x, y, level, games, variant, undefined, fresh);
}

/** One pool duel of a control kit, in a child process: every hero on both sides holds it (`control-kits.ts`). */
export async function controlPoolDuelJob(set: RunContext['set'], control: ControlName, x: PoolMember, y: PoolMember, level: number, games: number, variant: Variant = {}, fresh = 0): Promise<PoolDuel> {
  await installSet(set);
  return withSubject({ control }, s => poolDuel(x, y, level, games, variant, { kits: [s.id], print: `control:${skillPrint(s.id)}` }, fresh));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The built module the duels run in: this one, from `dist/`. */
const SELF = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'pool.js');

export interface PoolRun {
  set: RunContext['set']; level: number;
  /** Fights a duel. */
  games: number;
  /** A candidate rule (playtest `DEFENSE_RULES`: its rules and its defense shift), or every hero on one PV. */
  variant?: Variant; defenseShift?: number;
  /** A control kit every hero holds, in place of the set's main kits. */
  control?: ControlName;
  maxMembers?: number; families?: readonly Strategy['kind'][];
  onStep?: PoolOptions['onStep'];
}

export interface PoolReading {
  level: number; result: PoolResult; verdict: PoolVerdict;
  /** The production AI against the final mix (the members holding 1% of it or more), on fights the search never saw. */
  aiScore: number;
  /** Duels played (each pair once, whichever way round). */
  duels: number;
}

/** One level's pool grown, its verdict, and the production AI read against its mix: every duel a child process across bench's lanes. */
export async function measurePool(run: PoolRun): Promise<PoolReading> {
  const played = new Map<string, Promise<PoolDuel>>();
  const duel = (x: PoolMember, y: PoolMember, fresh = 0): Promise<PoolDuel> => {
    const [a, b] = memberKey(x) <= memberKey(y) ? [x, y] : [y, x];
    const k = `${fresh}:${memberKey(a)}:${memberKey(b)}`;
    let job = played.get(k);
    if (!job) played.set(k, job = inLanes([() => (run.control
      ? isolated<PoolDuel>(SELF, 'controlPoolDuelJob', [run.set, run.control, a, b, run.level, run.games, run.variant ?? {}, fresh])
      : isolated<PoolDuel>(SELF, 'poolDuelJob', [run.set, a, b, run.level, run.games, run.variant ?? {}, fresh, run.defenseShift ?? 0]))]).then(r => r[0]));
    return job.then(d => (a === x ? d : { ...d, score: 1 - d.score }));
  };
  const result = await growPool(async (pairs, fresh = 0) => (await Promise.all(pairs.map(([x, y]) => duel(x, y, fresh)))).map(d => d.score), {
    ...(run.maxMembers ? { maxMembers: run.maxMembers } : {}), ...(run.families ? { families: run.families } : {}), ...(run.onStep ? { onStep: run.onStep } : {}),
  });
  const support = result.members.map((m, i) => ({ m, p: result.mix[i] })).filter(s => s.p >= SUPPORT);
  const ai = await Promise.all(support.map(s => duel('ai', s.m, 1)));
  const aiScore = support.reduce((t, s, i) => t + s.p * ai[i].score, 0) / support.reduce((t, s) => t + s.p, 0);
  return { level: run.level, result, verdict: poolVerdict(result, run.games), aiScore, duels: played.size };
}
