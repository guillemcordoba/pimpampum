/**
 * THE REFEREE — what the best play in a position objectively is.
 *
 * A round is a simultaneous-move game: both sides commit their cards (and, in
 * this abstraction, their targets) at once, then the engine resolves them. So
 * every round is a zero-sum MATRIX GAME, whose payoff is the value of the
 * position it leads to, and the fight is a stack of them. This solves the
 * stack by recursion, each node for its Nash equilibrium (the optimal MIXED
 * strategy, `zero-sum.ts`), down to the real end of the fight.
 *
 *   PAYOFF   the end-of-fight PV on team 0 minus PV on team 1 — the currency
 *            of `bench/regret.ts`. A fight ends when a side is down or at the
 *            position's round cap. No leaf is ever scored by a heuristic: a
 *            delayed blow, a device, a mark all land before the score is read.
 *
 * The approximations, each a knob, all documented in ARCHITECTURE.md:
 *
 *   CHANCE   K seeded samples per joint action (common random numbers across
 *            the joint actions of a node); identical outcomes collapse in a
 *            transposition table keyed by the full game state, so a node whose
 *            dice cannot change the state is solved once, exactly.
 *   TARGETS  chosen with the card, at the reveal, from at most `maxTargets`
 *            candidates (the weakest first). The engine lets a real seat aim at
 *            resolution, with more information; the referee does not.
 *   SIZE     a side with more than `maxJoint` joint actions is solved by DOUBLE
 *            ORACLE: the equilibrium of a restricted game, grown by each side's
 *            best response (coordinate ascent over its seats) until neither
 *            side can improve — exact if the best responses are, which for a
 *            multi-seat side they need not be.
 *   DEPTH    past `solvedRounds` rounds the rest of the fight is played out by
 *            uniformly random legal play (still to the real end, so every
 *            pending effect lands). Infinity by default: the whole fight solved.
 */
import {
  ActionType, availableActionIndices, getActionTargetCount, getActionTargetRequirement, random, withSeed,
  type ActionSelection, type Character, type CombatEngine, type TargetRef,
} from '@pimpampum/engine';
import { solveZeroSum, rowValues, type MatrixSolution } from './zero-sum.js';

export interface RefereeOptions {
  /** Seeds every sample; same seed, same answer. */
  seed: number;
  /** Samples per joint action, by depth (index 0 = the root); the last repeats. */
  samples: number[];
  /** A side with at most this many joint actions is enumerated in full. */
  maxJoint: number;
  /** Candidate targets per single-target card. */
  maxTargets: number;
  /** Rounds solved as matrix games before random play takes the rest. */
  solvedRounds: number;
  /** Random playouts per position once `solvedRounds` is reached. */
  rolloutSamples: number;
  /** Double-oracle iterations per node. */
  oracleIters: number;
  /** Give up past this many simulated rounds (the position is then unsolved). */
  budget: number;
}

export const DEFAULT_REFEREE: RefereeOptions = {
  seed: 1, samples: [16, 4, 1], maxJoint: 16, maxTargets: 3, solvedRounds: Infinity,
  rolloutSamples: 8, oracleIters: 6, budget: 20_000_000,
};

/** One seat's committed card and targets. */
export interface SeatOption { idx: number; actionIdx: number; targets?: TargetRef[] }
/** One side's choice for every seat that acts this round. */
export type Joint = SeatOption[];

export const jointKey = (j: Joint): string => j.map(o =>
  `${o.idx}:${o.actionIdx}@${o.targets ? o.targets.map(t => `${t.team}.${t.idx}`).join('+') : '-'}`).join('|');

export class BudgetExceeded extends Error {}

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
  /** Whether both sides were enumerated in full at the root. */
  exactRoot: boolean;
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

/** Play the round `prepared` has begun with these selections, to its end. */
function playPrepared(sim: CombatEngine, selections: ActionSelection[]): void {
  sim.planActions(selections);
  let step = sim.resolveNextAction();
  for (let guard = 0; step.kind !== 'done' && guard < 400; guard++) {
    if (step.kind === 'target') sim.setResolveTarget([]);
    else if (step.kind === 'choice') sim.setResolveChoice();
    step = sim.resolveNextAction();
  }
  sim.finishRound();
}

const toSelections = (team: number, j: Joint): ActionSelection[] =>
  j.map(o => ({ team, idx: o.idx, actionIdx: o.actionIdx, targets: o.targets }));

/** A random legal card per seat, random targets — the playout past `solvedRounds`. */
function randomPlayout(e: CombatEngine): void {
  for (const c of [...e.teams[0], ...e.teams[1]]) c.aiControlled = true;
  e.actionChooser = (eng, actor) => {
    const legal = availableActionIndices(actor, eng.registry);
    return legal.length ? legal[Math.floor(random() * legal.length)] : null;
  };
  e.targetChooser = (_eng, _actor, _def, _req, count, pool) => {
    const left = [...pool];
    const out: Character[] = [];
    while (out.length < count && left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]);
    return out;
  };
  while (!finished(e)) {
    e.prepareRound();
    playPrepared(e, []);
  }
}

export class Referee {
  readonly opts: RefereeOptions;
  sims = 0;
  private table = new Map<string, number>();

  constructor(opts: Partial<RefereeOptions> = {}) {
    this.opts = { ...DEFAULT_REFEREE, ...opts };
  }

  /** Value of a between-rounds state to team 0, with the whole remaining fight solved. */
  value(state: CombatEngine, depth: number): number {
    if (finished(state)) return pvDiff(state);
    const sig = signature(state);
    const hit = this.table.get(sig);
    if (hit !== undefined) return hit;
    const v = depth >= this.opts.solvedRounds ? this.playout(state, sig) : this.solve(state, depth).value;
    this.table.set(sig, v);
    return v;
  }

  private playout(state: CombatEngine, sig: string): number {
    let total = 0;
    for (let s = 0; s < this.opts.rolloutSamples; s++) {
      const seed = hash(sig, this.opts.seed * 7919 + s);
      total += withSeed(seed, () => {
        const sim = state.clone();
        sim.seatStreamSeed = seed;
        randomPlayout(sim);
        this.sims += sim.round - state.round;
        return pvDiff(sim);
      });
    }
    return total / this.opts.rolloutSamples;
  }

  /** Solve the round `state` is about to play; `mustInclude` are team-0 joints
   *  that must be among the candidates (the AI's picks, at the root). */
  solve(state: CombatEngine, depth: number, mustInclude: Joint[] = []): RootSolution {
    const sig = signature(state);
    const nodeSeed = hash(sig, this.opts.seed);
    const prepared = state.clone();
    const prep = withSeed(nodeSeed, () => prepared.prepareRound());
    const skipping = new Set(prep.skipping.map(r => `${r.team}.${r.idx}`));
    const seatsOf = (team: number): SeatOption[][] => prepared.teams[team]
      .map((c, idx) => ({ c, idx }))
      .filter(({ c, idx }) => c.isAlive() && !skipping.has(`${team}.${idx}`))
      .map(({ c, idx }) => this.seatOptions(prepared, c, team, idx));
    const seats: [SeatOption[][], SeatOption[][]] = [seatsOf(0), seatsOf(1)];

    const K = this.opts.samples[Math.min(depth, this.opts.samples.length - 1)];
    const cells = new Map<string, CellStat>();
    const cell = (row: Joint, col: Joint): CellStat => {
      const key = `${jointKey(row)}#${jointKey(col)}`;
      const hit = cells.get(key);
      if (hit) return hit;
      const vals: number[] = [];
      for (let s = 0; s < K; s++) {
        const seed = hash(sig, this.opts.seed * 31 + s + 1);
        const sim = prepared.clone();
        sim.seatStreamSeed = seed;
        withSeed(seed, () => playPrepared(sim, [...toSelections(0, row), ...toSelections(1, col)]));
        if (++this.sims > this.opts.budget) throw new BudgetExceeded(`over ${this.opts.budget} simulated rounds`);
        vals.push(this.value(sim, depth + 1));
      }
      const mean = vals.reduce((a, b) => a + b, 0) / K;
      const variance = K > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (K - 1) : 0;
      const stat = { mean, se: Math.sqrt(variance / K) };
      cells.set(key, stat);
      return stat;
    };

    const product = (opts: SeatOption[][]): number => opts.reduce((n, o) => n * o.length, 1);
    const exact = product(seats[0]) <= this.opts.maxJoint && product(seats[1]) <= this.opts.maxJoint;
    let rows: Joint[];
    let cols: Joint[];
    const r = seededDraw(nodeSeed);
    const randomJoint = (opts: SeatOption[][]): Joint => opts.map(o => o[Math.floor(r() * o.length)]);
    if (exact) {
      rows = cartesian(seats[0]);
      cols = cartesian(seats[1]);
      for (const j of mustInclude) if (!rows.some(r => jointKey(r) === jointKey(j))) rows.push(j);
    } else {
      // Start from every seat's first option and one seeded random joint per side.
      rows = uniqueJoints([seats[0].map(o => o[0]), randomJoint(seats[0]), ...mustInclude]);
      cols = uniqueJoints([seats[1].map(o => o[0]), randomJoint(seats[1])]);
    }

    let payoff = rows.map(rw => cols.map(c => cell(rw, c).mean));
    let sol = solveZeroSum(payoff);
    if (!exact) {
      for (let it = 0; it < this.opts.oracleIters; it++) {
        const tol = 1e-6;
        // Coordinate ascent finds a LOCAL best response; two starts (the best
        // row in play and a random one) miss fewer of the global ones.
        const rowBR = this.bestResponse(seats[0], [rows[argmax(rowValues(payoff, sol.col))], randomJoint(seats[0])],
          j => cols.reduce((s, c, k) => s + (sol.col[k] > 1e-9 ? sol.col[k] * cell(j, c).mean : 0), 0), 1);
        const colVals = cols.map((_, k) => rows.reduce((s, rw, i) => s + sol.row[i] * payoff[i][k], 0));
        const colBR = this.bestResponse(seats[1], [cols[argmin(colVals)], randomJoint(seats[1])],
          j => rows.reduce((s, rw, i) => s + (sol.row[i] > 1e-9 ? sol.row[i] * cell(rw, j).mean : 0), 0), -1);
        let grew = false;
        if (rowBR.value > sol.value + tol && !rows.some(x => jointKey(x) === jointKey(rowBR.joint))) { rows.push(rowBR.joint); grew = true; }
        if (colBR.value < sol.value - tol && !cols.some(x => jointKey(x) === jointKey(colBR.joint))) { cols.push(colBR.joint); grew = true; }
        if (!grew) break;
        payoff = rows.map(rw => cols.map(c => cell(rw, c).mean));
        sol = solveZeroSum(payoff);
      }
    }
    const cellSE = rows.map(rw => cols.map(c => cell(rw, c).se));
    const rowValue = rowValues(payoff, sol.col);
    const rowSE = cellSE.map(r => Math.sqrt(r.reduce((s, se, k) => s + (sol.col[k] * se) ** 2, 0)));
    return { value: sol.value, rows, cols, payoff, cellSE, sol, rowValue, rowSE, exactRoot: exact, sims: this.sims };
  }

  /** Coordinate ascent (sign +1) or descent (−1) over one side's seats, from
   *  each start; the best end point wins. */
  private bestResponse(seats: SeatOption[][], starts: Joint[], value: (j: Joint) => number, sign: number): { joint: Joint; value: number } {
    let top: { joint: Joint; value: number } | null = null;
    for (const start of starts) {
      const found = this.ascend(seats, start, value, sign);
      if (!top || sign * (found.value - top.value) > 1e-9) top = found;
    }
    return top!;
  }

  private ascend(seats: SeatOption[][], start: Joint, value: (j: Joint) => number, sign: number): { joint: Joint; value: number } {
    let joint = [...start];
    let best = value(joint);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      seats.forEach((opts, k) => {
        for (const o of opts) {
          if (o === joint[k]) continue;
          const trial = [...joint];
          trial[k] = o;
          const v = value(trial);
          if (sign * (v - best) > 1e-9) { best = v; joint = trial; improved = true; }
        }
      });
      if (!improved) break;
    }
    return { joint, value: best };
  }

  /** A seat's legal cards, each with its candidate targets. */
  seatOptions(e: CombatEngine, c: Character, team: number, idx: number): SeatOption[] {
    const out: SeatOption[] = [];
    const ref = (x: Character): TargetRef => ({ team: x.team, idx: e.teams[x.team].indexOf(x) });
    const frac = (x: Character): number => x.currentPV / Math.max(1, x.maxPV);
    for (let i = 0; i < c.actions.length; i++) {
      if (!e.canPlayActionIdx(c, i)) continue;
      const def = c.actions[i].def;
      const req = getActionTargetRequirement(def, e.registry);
      const count = getActionTargetCount(def);
      const mates = e.teams[team];
      let pool: Character[] = [];
      if (req === 'enemy') {
        // A taunted attacker's pool is the engine's to narrow: let it aim.
        pool = def.actionType === ActionType.Atac && c.holdsStatusWith('attackTargetsOnly')
          ? [] : e.enemiesOf(c).sort((a, b) => a.currentPV - b.currentPV);
      } else if (req === 'ally') pool = mates.filter(x => x.isAlive()).sort((a, b) => frac(a) - frac(b));
      else if (req === 'ally_other') pool = mates.filter(x => x.isAlive() && x !== c).sort((a, b) => frac(a) - frac(b));
      else if (req === 'fallen_ally') pool = mates.filter(x => !x.isAlive());
      else if (req === 'defense') pool = [...mates.filter(x => x.isAlive()).sort((a, b) => frac(a) - frac(b)), ...e.enemiesOf(c)];
      if (pool.length <= count || count !== 1) { out.push({ idx, actionIdx: i }); continue; }
      for (const t of pool.slice(0, this.opts.maxTargets)) out.push({ idx, actionIdx: i, targets: [ref(t)] });
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

function uniqueJoints(js: Joint[]): Joint[] {
  const seen = new Set<string>();
  return js.filter(j => { const k = jointKey(j); if (seen.has(k)) return false; seen.add(k); return true; });
}

const argmax = (xs: number[]): number => xs.reduce((b, x, i) => (x > xs[b] ? i : b), 0);
const argmin = (xs: number[]): number => xs.reduce((b, x, i) => (x < xs[b] ? i : b), 0);

function seededDraw(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
