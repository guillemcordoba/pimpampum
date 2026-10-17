/**
 * THE REFEREE — what the best play in a position objectively is.
 *
 * A round is a simultaneous-move game: both sides commit their CARDS at once,
 * then the engine resolves them, and every decision the rules leave to a seat
 * during the resolution (whom an attack hits, whom a guard covers) is taken
 * then, by the seat, knowing everything that has happened so far. So every
 * round is a zero-sum MATRIX GAME over every combination of cards, whose cell
 * is the resolution solved as a tree — each in-round decision a max (side A)
 * or min (side B) over every legal answer — down to the round's end, and then
 * the value of the next round's position. The fight is a stack of them, solved
 * to its real end (a side down, or the position's round cap).
 *
 *   PAYOFF   the end-of-fight PV on team 0 minus PV on team 1 — the currency
 *            of `bench/regret.ts`. No leaf is ever scored by a heuristic.
 *
 * NOTHING about a decision is approximated: every card of every seat, every
 * target of every in-round decision, every round to the end. The one thing
 * sampled is CHANCE (the dice and the tie order), which cannot be enumerated:
 *
 *   CELLS     `samples[d]` seeded draws per card combination at depth `d`
 *             (common random numbers across a node's combinations).
 *   DECISIONS an in-round decision is taken on the MEAN of
 *             `decisionSamples[d]` continuations of the chance after it, never
 *             on one draw — a seat that chose on a single draw would be
 *             choosing on dice it has not seen.
 *
 * Both converge to the game's true value as they grow; their error is
 * measured by re-solving under other seeds (`check.ts`). A position whose
 * solve does not fit `budget` is NOT solved — reported as such, never
 * approximated. A position the referee cannot represent exactly (a card with
 * reveal options, chance at the start of a round) throws `Unsupported`.
 *
 * In-round decisions are found by REPLAY: the engine asks its `targetChooser`
 * synchronously, so the round is re-run from its start with a script of
 * answers, and the first unscripted question stops it and names its options.
 * At each answer the chance is re-seeded, so every continuation after a
 * decision is an independent draw and the replayed prefix is identical.
 */
import {
  Character, seededRng, setRng, withChance, withSeed,
  type ActionSelection, type CombatEngine, type TargetChooser,
} from '@pimpampum/engine';
import { solveZeroSum, rowValues, type MatrixSolution } from './zero-sum.js';

export interface RefereeOptions {
  /** Seeds every sample; same seed, same answer. */
  seed: number;
  /** Chance draws per card combination, by depth (index 0 = the root); the last repeats. */
  samples: number[];
  /** Chance draws an in-round decision is averaged over, by depth; the last repeats. */
  decisionSamples: number[];
  /** Give up past this many simulated rounds (the position is then unsolved). */
  budget: number;
  /** `sample`: chance is drawn (`samples`, `decisionSamples`). `enumerate`:
   *  every outcome of every draw is followed, weighted — exact, nothing
   *  sampled at all, and affordable only where chance is small (fixed dice:
   *  then only the order of speed ties is left to it). */
  chance: 'sample' | 'enumerate';
}

export const DEFAULT_REFEREE: RefereeOptions = {
  seed: 1, samples: [16, 4, 1], decisionSamples: [8, 4, 4], budget: 20_000_000, chance: 'sample',
};

/** One seat's committed card. */
export interface SeatOption { idx: number; actionIdx: number }
/** One side's choice for every seat that acts this round. */
export type Joint = SeatOption[];

export const jointKey = (j: Joint): string => j.map(o => `${o.idx}:${o.actionIdx}`).join('|');

export class BudgetExceeded extends Error {}
/** The position holds something the referee cannot solve exactly. */
export class Unsupported extends Error {}

export interface RootSolution {
  value: number;
  rows: Joint[];
  cols: Joint[];
  payoff: number[][];
  /** Standard error of each cell's mean over its samples. */
  cellSE: number[][];
  sol: MatrixSolution;
  /** Each row's value against the equilibrium column strategy. */
  rowValue: number[];
  /** Its standard error. */
  rowSE: number[];
  /** Simulated rounds spent. */
  sims: number;
}

interface CellStat { mean: number; se: number }

/** PV on team 0 minus PV on team 1. */
export function pvDiff(e: CombatEngine): number {
  let s = 0;
  for (const c of e.teams[0]) s += Math.max(0, c.currentPV);
  for (const c of e.teams[1]) s -= Math.max(0, c.currentPV);
  return s;
}

const finished = (e: CombatEngine): boolean => e.isOver() || e.round >= e.maxRounds;

/**
 * Everything about a between-rounds engine that the next rounds can read —
 * two states with the same signature are the same game from here on. Guards,
 * the queue and per-round flags are reset by `prepareRound`, so they are left
 * out; so are `lastWound`, `hitThisCombat` and the history, which no audit card
 * reads.
 */
export function signature(e: CombatEngine): string {
  const ref = (c: Character): string => `@${c.team}.${e.teams[c.team].indexOf(c)}`;
  const replacer = (_k: string, v: unknown): unknown => (v && typeof v === 'object' && 'currentPV' in (v as object) ? ref(v as Character) : v);
  const parts: string[] = [String(e.round)];
  for (const team of e.teams) {
    for (const c of team) {
      const st = [...c.statuses].map(([k, s]) => `${k}=${s.value}/${s.remaining}/${s.data ? JSON.stringify(s.data, replacer) : ''}`).sort();
      parts.push([
        c.currentPV, c.fatigue, c.skipTurns, [...c.skills.values()].join(','),
        c.actions.map(a => (a.consumed ? 1 : 0)).join(''),
        st.join(';'),
        c.modifiers.map(m => `${m.stat}:${m.value}:${JSON.stringify(m.duration)}`).join(';'),
        [...c.setAsideActions].join(';'),
      ].join('#'));
    }
  }
  return parts.join('|');
}

function hash(s: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** 64 bits of a long key, so the memo keeps 16 characters a state, not
 *  thousands. A collision is a 1-in-10¹⁰ event over a solve's 10⁵ states. */
function mix(s: string): number {
  let h = 0x85ebca6b;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995); h ^= h >>> 15; }
  return h >>> 0;
}
const digest = (s: string): string => `${hash(s, 0).toString(36)}.${mix(s).toString(36)}`;

/**
 * Everything about an engine IN THE MIDDLE of a round that the rest of the
 * fight can read, walked generically (every own field, so nothing is
 * forgotten by a hand-kept list): two states with the same key are the same
 * game from here on. Shared immutable things (card definitions, equipment,
 * status behaviours, anything holding functions) count by identity. Left out,
 * as `signature` leaves them out: the log, the history and the plays, which
 * no audit card reads.
 */
/** Identity numbers, handed out in visit order — so a fresh referee's keys,
 *  and the seeds drawn from them, are the same on every run. */
export type IdOf = (o: object) => number;
export function identities(): IdOf {
  const ids = new WeakMap<object, number>();
  let next = 0;
  return o => {
    let i = ids.get(o);
    if (i === undefined) { i = next++; ids.set(o, i); }
    return i;
  };
}
const SKIP = new Set(['registry', 'logEntries', 'silent', 'actionChooser', 'targetChooser', 'history', 'plays',
  'seatStreams', 'seatStreamSeed', 'teams']);
const BY_IDENTITY = new Set(['def', 'behavior', 'equipment']);

export function midRoundKey(e: CombatEngine, idOf: IdOf): string {
  const refs = new Map<Character, string>();
  e.teams.forEach((team, ti) => team.forEach((c, i) => refs.set(c, `@${ti}.${i}`)));
  const open = new Set<object>();
  const walk = (v: unknown, identity = false): string => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v !== 'object') return typeof v === 'function' ? 'f' : String(v);
    if (v instanceof Character) {
      const r = refs.get(v);
      if (!r) throw new Error('referee: a character outside the teams');
      return r;
    }
    if (identity && !Array.isArray(v)) return `#${idOf(v)}`;
    if (Object.values(v as object).some(x => typeof x === 'function')) return `#${idOf(v)}`;
    if (open.has(v)) throw new Error('referee: a cycle in the engine state');
    open.add(v);
    let out: string;
    if (Array.isArray(v)) out = `[${v.map(x => walk(x, identity)).join(',')}]`;
    else if (v instanceof Map) out = `M[${[...v].map(([k, x]) => `${walk(k)}:${walk(x)}`).join(',')}]`;
    else if (v instanceof Set) out = `S[${[...v].map(x => walk(x)).join(',')}]`;
    else {
      out = `{${Object.keys(v).filter(k => !SKIP.has(k))
        .map(k => `${k}:${walk((v as Record<string, unknown>)[k], BY_IDENTITY.has(k))}`).join(',')}}`;
    }
    open.delete(v);
    return out;
  };
  // The engine and its characters hold functions of their own, so their
  // fields are walked here rather than counted by identity.
  const body = (o: object): string => `{${Object.keys(o).filter(k => !SKIP.has(k))
    .map(k => `${k}:${walk((o as Record<string, unknown>)[k], BY_IDENTITY.has(k))}`).join(',')}}`;
  return `${body(e)}|${e.teams.map(t => t.map(body).join(';')).join('|')}`;
}

const toSelections = (team: number, j: Joint): ActionSelection[] =>
  j.map(o => ({ team, idx: o.idx, actionIdx: o.actionIdx }));

/** A scripted answer to an in-round decision: indices into the pool the engine
 *  offered, and the seed the chance after it is drawn from. */
interface Answer { pick: number[]; seed: number }
/** A scripted outcome of a chance draw (`chance: 'enumerate'`). */
interface Drawn { draw: number }
type Scripted = Answer | Drawn;
const isDraw = (s: Scripted): s is Drawn => 'draw' in s;

/** Thrown at the first unscripted chance draw with more than one outcome. */
class Draw {
  constructor(readonly outcomes: number) {}
}

/** Thrown by the scripted chooser at the first unscripted decision. */
class Ask {
  /** `key` is null when the state cannot name the decision (see `replay`).
   *  `resolving`: the card about to resolve is the one aiming (not one that
   *  aims at the reveal, nor an effect's own question). `ai`: what the AI
   *  under audit answered there, when it was asked. */
  constructor(
    readonly team: number, readonly poolSize: number, readonly count: number, readonly key: string | null,
    readonly actorIdx: number, readonly resolving: boolean, readonly ai?: number[],
  ) {}
}

/** One option of an in-round decision: its value and that value's standard error. */
export interface OptionStat { pick: number[]; mean: number; se: number }

/** The AI's answer to one of its own in-round decisions, judged. */
export interface AimVerdict {
  /** Team-0 seat that decided. */
  actorIdx: number;
  options: OptionStat[];
  ai: number[];
  best: number[];
  /** The best option's value minus the AI's. */
  loss: number;
  /** Standard error of that difference. */
  se: number;
}

/** The engine's queue, read for one fact: whether a card is still unaimed. */
const pendingOf = (e: CombatEngine): { actor: Character; action: { def: unknown }; targets: unknown[] | null }[] =>
  (e as unknown as { pending: { actor: Character; action: { def: unknown }; targets: unknown[] | null }[] }).pending;

/** Every way to pick `count` of `n` (pool indices, ascending). */
function subsets(n: number, count: number): number[][] {
  const out: number[][] = [];
  const walk = (from: number, acc: number[]): void => {
    if (acc.length === count) { out.push(acc); return; }
    for (let i = from; i <= n - (count - acc.length); i++) walk(i + 1, [...acc, i]);
  };
  walk(0, []);
  return out;
}

export class Referee {
  readonly opts: RefereeOptions;
  sims = 0;
  private table = new Map<string, number>();
  /** In-round decisions already solved, by the state they are taken in. */
  private decisions = new Map<string, number>();
  private readonly idOf = identities();

  constructor(opts: Partial<RefereeOptions> = {}) {
    this.opts = { ...DEFAULT_REFEREE, ...opts };
  }

  /** Value of a between-rounds state to team 0, with the whole remaining fight solved. */
  value(state: CombatEngine, depth: number): number {
    if (finished(state)) return pvDiff(state);
    const sig = signature(state);
    const hit = this.table.get(sig);
    if (hit !== undefined) return hit;
    const v = this.solve(state, depth).value;
    this.table.set(sig, v);
    return v;
  }

  /** Solve the round `state` is about to play; `mustInclude` are team-0 joints
   *  that must be among the candidates (kept for callers; every joint already is). */
  solve(state: CombatEngine, depth: number, mustInclude: Joint[] = []): RootSolution {
    const { sig, prepared, seats } = this.prepare(state);
    const K = this.opts.chance === 'enumerate' ? 1 : this.opts.samples[Math.min(depth, this.opts.samples.length - 1)];
    const cell = (row: Joint, col: Joint): CellStat => {
      const selections = [...toSelections(0, row), ...toSelections(1, col)];
      const vals: number[] = [];
      for (let s = 0; s < K; s++) {
        vals.push(this.round(prepared, selections, hash(sig, this.opts.seed * 31 + s + 1), [], depth));
      }
      const mean = vals.reduce((a, b) => a + b, 0) / K;
      const variance = K > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (K - 1) : 0;
      return { mean, se: Math.sqrt(variance / K) };
    };
    return this.matrix(seats, cell, mustInclude);
  }

  /** The round `state` is about to play, prepared, with every seat's legal cards. */
  private prepare(state: CombatEngine): { sig: string; prepared: CombatEngine; seats: [SeatOption[][], SeatOption[][]] } {
    const sig = signature(state);
    const prepared = state.clone();
    for (const c of [...prepared.teams[0], ...prepared.teams[1]]) c.aiControlled = true;
    // The matrix is built on the prepared round, so chance there would be one
    // draw standing in for all of them.
    let draws = 0;
    const prep = withSeed(hash(sig, this.opts.seed), () => {
      const gen = seededRng(hash(sig, this.opts.seed + 1));
      setRng(() => { draws++; return gen(); });
      return prepared.prepareRound();
    });
    if (draws) throw new Unsupported('chance at the start of a round');
    const skipping = new Set(prep.skipping.map(r => `${r.team}.${r.idx}`));
    const seatsOf = (team: number): SeatOption[][] => prepared.teams[team]
      .map((c, idx) => ({ c, idx }))
      .filter(({ c, idx }) => c.isAlive() && !skipping.has(`${team}.${idx}`))
      .map(({ c, idx }) => this.seatOptions(prepared, c, idx));
    return { sig, prepared, seats: [seatsOf(0), seatsOf(1)] };
  }

  private matrix(seats: [SeatOption[][], SeatOption[][]], cell: (row: Joint, col: Joint) => CellStat, mustInclude: Joint[]): RootSolution {
    const rows = cartesian(seats[0]);
    const cols = cartesian(seats[1]);
    for (const j of mustInclude) {
      if (!rows.some(r => jointKey(r) === jointKey(j))) throw new Error(`referee: ${jointKey(j)} is not a legal joint`);
    }
    const stats = rows.map(rw => cols.map(c => cell(rw, c)));
    const payoff = stats.map(r => r.map(c => c.mean));
    const sol = solveZeroSum(payoff);
    const cellSE = stats.map(r => r.map(c => c.se));
    const rowValue = rowValues(payoff, sol.col);
    const rowSE = cellSE.map(r => Math.sqrt(r.reduce((s, se, k) => s + (sol.col[k] * se) ** 2, 0)));
    return { value: sol.value, rows, cols, payoff, cellSE, sol, rowValue, rowSE, sims: this.sims };
  }

  /**
   * The value of playing `selections` from `prepared`, the round's chance
   * drawn from `seed0` and the decisions answered by `script` so far. At the
   * first unanswered decision: the best answer for the deciding side, each
   * judged on the mean of fresh draws of the chance after it.
   */
  private round(prepared: CombatEngine, selections: ActionSelection[], seed0: number, script: Scripted[], depth: number): number {
    const out = this.replay(prepared, selections, seed0, script);
    if (out instanceof Draw) {
      let total = 0;
      for (let k = 0; k < out.outcomes; k++) total += this.round(prepared, selections, seed0, [...script, { draw: k }], depth);
      return total / out.outcomes;
    }
    if (!(out instanceof Ask)) return this.value(out, depth + 1);
    const key = out.key === null ? null : `${depth}|${out.key}`;
    const hit = key === null ? undefined : this.decisions.get(key);
    if (hit !== undefined) return hit;
    const M = this.opts.decisionSamples[Math.min(depth, this.opts.decisionSamples.length - 1)];
    const stats = this.optionStats(prepared, selections, seed0, script, depth, out, M);
    const best = out.team === 0 ? Math.max(...stats.map(s => s.mean)) : Math.min(...stats.map(s => s.mean));
    if (key !== null) this.decisions.set(key, best);
    return best;
  }

  /** Every answer to the decision `ask`, each worth the mean of `samples`
   *  continuations of the chance after it (the same draws for every answer). */
  private optionStats(prepared: CombatEngine, selections: ActionSelection[], seed0: number, script: Scripted[], depth: number, ask: Ask, samples: number): OptionStat[] {
    // Seeded by the state, not the path: the same state is the same decision.
    const at = ask.key === null ? `${seed0}#${script.map(a => (isDraw(a) ? `d${a.draw}` : `${a.pick.join('+')}@${a.seed}`)).join('/')}` : `${depth}|${ask.key}`;
    // Enumerated chance: one continuation is the exact value.
    const n = this.opts.chance === 'enumerate' ? 1 : samples;
    const seeds = Array.from({ length: n }, (_, m) => hash(at, this.opts.seed * 131 + m));
    return subsets(ask.poolSize, ask.count).map(pick => {
      const vals = seeds.map(seed => this.round(prepared, selections, seed0, [...script, { pick, seed }], depth));
      const mean = vals.reduce((a, b) => a + b, 0) / n;
      const variance = n > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
      return { pick, mean, se: Math.sqrt(variance / n) };
    });
  }

  /**
   * THE AI'S OWN AIMING, judged. One sampled path through the round `state`
   * is about to play, with side A on `row` and side B on `col`: at every
   * decision side A's card makes as it resolves, `ai` is asked (on the live
   * engine, at the very moment the game would ask it), every answer is valued
   * on `samples` continuations, and the path goes on with the AI's answer.
   * Side B's decisions, and side A's others, take the referee's best.
   */
  judgeAims(state: CombatEngine, row: Joint, col: Joint, path: number, samples: number, ai: TargetChooser): AimVerdict[] {
    const { sig, prepared } = this.prepare(state);
    const selections = [...toSelections(0, row), ...toSelections(1, col)];
    const seed0 = hash(sig, this.opts.seed * 31 + 1000 + path);
    const script: Scripted[] = [];
    const out: AimVerdict[] = [];
    for (let step = 0; step < 64; step++) {
      const ask = this.replay(prepared, selections, seed0, script, ai);
      if (ask instanceof Draw) { script.push({ draw: (path + step) % ask.outcomes }); continue; }
      if (!(ask instanceof Ask)) return out;
      const stats = this.optionStats(prepared, selections, seed0, script, 0, ask, samples);
      const top = stats.reduce((b, s) => (ask.team === 0 ? s.mean > b.mean : s.mean < b.mean) ? s : b);
      let pick = top.pick;
      if (ask.team === 0 && ask.resolving && ask.ai) {
        const mine = stats.find(s => s.pick.join(',') === [...ask.ai!].sort((a, b) => a - b).join(','));
        if (mine) {
          out.push({ actorIdx: ask.actorIdx, options: stats, ai: mine.pick, best: top.pick, loss: top.mean - mine.mean, se: Math.hypot(top.se, mine.se) });
          pick = mine.pick;
        }
      }
      script.push({ pick, seed: hash(`${sig}#${path}#${script.length}`, this.opts.seed * 17) });
    }
    throw new Error('referee: a round with more than 64 decisions');
  }

  /** Re-run the round from its start under a script of answers: the state at
   *  its end, or the first decision (or, enumerating, chance draw) the script
   *  does not answer. */
  private replay(prepared: CombatEngine, selections: ActionSelection[], seed0: number, script: Scripted[], ai?: TargetChooser): CombatEngine | Ask | Draw {
    if (++this.sims > this.opts.budget) throw new BudgetExceeded(`over ${this.opts.budget} simulated rounds`);
    const sim = prepared.clone();
    let asked = 0;
    sim.targetChooser = (_e, actor, def, req, count, pool, speed) => {
      if (asked >= script.length) {
        // A card AIMING (its queue entry still unaimed) is decided by the engine
        // state alone. A choice an effect asks for mid-resolution may sit on
        // values the effect holds in its own locals, which no state key sees:
        // it is solved every time it is met, never shared.
        const aiming = pendingOf(sim).some(p => p.actor === actor && p.action.def === def && p.targets === null);
        const ref = (c: Character): string => `${c.team}.${sim.teams[c.team].indexOf(c)}`;
        const queue = pendingOf(sim);
        const current = queue[(sim as unknown as { pendingIndex: number }).pendingIndex];
        const resolving = aiming && current?.actor === actor && current.action.def === def;
        const key = aiming ? digest(`${midRoundKey(sim, this.idOf)}|${ref(actor)}:#${this.idOf(def)}:${req}:${count}:${pool.map(ref).join('+')}`) : null;
        // The AI is asked before anything is thrown, on the engine as it stands.
        const answer = ai && resolving && actor.team === 0 ? ai(sim, actor, def, req, count, pool, speed).map(c => pool.indexOf(c)) : undefined;
        throw new Ask(actor.team, pool.length, count, key, sim.teams[actor.team].indexOf(actor), resolving, answer);
      }
      const a = script[asked++];
      if (isDraw(a)) throw new Error('referee: a replay out of step with its script');
      // Inside withSeed: the generator it installed is restored when it returns.
      if (this.opts.chance === 'sample') setRng(seededRng(a.seed));
      return a.pick.map(i => pool[i]);
    };
    const play = (body: () => void): void => {
      if (this.opts.chance === 'sample') { withSeed(seed0, body); return; }
      withChance(outcomes => {
        if (outcomes === 1) return 0;
        if (asked >= script.length) throw new Draw(outcomes);
        const a = script[asked++];
        if (!isDraw(a)) throw new Error('referee: a replay out of step with its script');
        return a.draw;
      }, body);
    };
    try {
      play(() => {
        sim.planActions(selections);
        let step = sim.resolveNextAction();
        for (let guard = 0; step.kind !== 'done'; guard++) {
          if (step.kind === 'target' || step.kind === 'choice') throw new Unsupported(`a ${step.kind} prompt with every seat AI-controlled`);
          if (guard > 400) throw new Error('referee: a round that never ends');
          step = sim.resolveNextAction();
        }
        sim.finishRound();
      });
    } catch (err) {
      if (err instanceof Ask || err instanceof Draw) return err;
      throw err;
    }
    return sim;
  }

  /** A seat's legal cards. */
  seatOptions(e: CombatEngine, c: Character, idx: number): SeatOption[] {
    if (c.holdsStatusWith('choosesAfterReveal')) throw new Unsupported(`${c.name} chooses after the reveal`);
    const out: SeatOption[] = [];
    for (let i = 0; i < c.actions.length; i++) {
      if (!e.canPlayActionIdx(c, i)) continue;
      if (e.registry.effectsWith(c.actions[i].def.effects, 'revealOptions').length) {
        throw new Unsupported(`${c.actions[i].def.id} has reveal options`);
      }
      out.push({ idx, actionIdx: i });
    }
    if (!out.length) out.push({ idx, actionIdx: -1 });
    return out;
  }
}

function cartesian(seats: SeatOption[][]): Joint[] {
  let acc: Joint[] = [[]];
  for (const opts of seats) acc = acc.flatMap(j => opts.map(o => [...j, o]));
  return acc;
}
