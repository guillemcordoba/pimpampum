/**
 * SCRATCH (2026-11-28, the ranking experiments; deleted once a method is
 * chosen): the rating maths, on plain game records. Nothing here knows the
 * game: a game is two teams of named members and a score.
 *
 * bench-exempt(seeded): the only randomness is `mulberry`, seeded by the caller.
 */

/** One game: `s` is side a's score (1 won, 0.5 drawn or stalled, 0 lost). A
 *  member listed twice counts twice. */
export interface Game { a: string[]; b: string[]; s: number }

export const ELO = 400 / Math.LN10;
/** The weight that holds each member's counters to a zero sum. */
const CYCLES_ONLY = 1e4;
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function mulberry(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function membersOf(games: readonly Game[]): string[] {
  return [...new Set(games.flatMap(g => [...g.a, ...g.b]))].sort();
}

// --- linear algebra, small and dense -----------------------------------------

/** Solve A x = b and return A's inverse too (Gauss-Jordan, partial pivoting). */
function invert(A: number[][]): number[][] {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) throw new Error('fit: singular system');
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(row => row.slice(n));
}

// --- the batch fit: Bradley-Terry with summed teams, and a counter table -----

export interface FitOptions {
  /** Ridge on the ratings (logit units): only what pins the free constant. */
  ridge?: number;
  /** false: ratings are left where the fit put them (zero means "adds nothing"), for members that are things a side holds rather than rivals. */
  centre?: boolean;
  /** Members whose ratings are held to a zero sum: the reference a fit without centring is read against (a party of fixed size and its opposition share a free constant otherwise). */
  anchor?: readonly string[];
  /** A counter term for each pair of members on opposite sides, with this ridge; off when undefined. */
  counterRidge?: number;
  /** Extra columns: a feature's value for a game, signed for side a (e.g. seat). */
  features?: Record<string, (g: Game) => number>;
}

export interface Fit {
  members: string[];
  /** Rating in Elo points, mean zero over the members, with its standard error. */
  rating: Record<string, number>;
  se: Record<string, number>;
  /** The counter table in Elo points: `counter[x][y]` is what x gains against y beyond the two ratings (antisymmetric). */
  counter?: Record<string, Record<string, number>>;
  counterSe?: Record<string, Record<string, number>>;
  feature: Record<string, { value: number; se: number }>;
  /** The fitted chance side a wins game g. */
  predict(g: Pick<Game, 'a' | 'b'>): number;
  /** Mean log loss on the games fitted. */
  loss: number;
}

/** Each game as a sparse row of the design: column -> value. */
function design(games: readonly Game[], members: readonly string[], o: FitOptions): { rows: Map<number, number>[]; cols: number; pairCol: (i: number, j: number) => number; featNames: string[] } {
  const idx = new Map(members.map((m, i) => [m, i]));
  const n = members.length;
  const pairs = o.counterRidge === undefined ? 0 : (n * (n - 1)) / 2;
  /** Column of the pair (i<j). */
  const pairCol = (i: number, j: number): number => n + (i * (2 * n - i - 1)) / 2 + (j - i - 1);
  const featNames = Object.keys(o.features ?? {});
  const rows = games.map(g => {
    const row = new Map<number, number>();
    const add = (c: number, v: number) => row.set(c, (row.get(c) ?? 0) + v);
    for (const m of g.a) add(idx.get(m)!, 1);
    for (const m of g.b) add(idx.get(m)!, -1);
    if (pairs) {
      for (const x of g.a) for (const y of g.b) {
        const i = idx.get(x)!, j = idx.get(y)!;
        if (i === j) continue;
        if (i < j) add(pairCol(i, j), 1); else add(pairCol(j, i), -1);
      }
    }
    featNames.forEach((f, k) => { const v = o.features![f](g); if (v) add(n + pairs + k, v); });
    return row;
  });
  return { rows, cols: n + pairs + featNames.length, pairCol, featNames };
}

/**
 * The counter table for a big roster, in two steps: the plain ratings, then
 * each pair's counter as a one-number logistic fit with the ratings as the
 * offset, and each member's counters shifted to sum to nothing (what they
 * summed to was a rating, and is left out). Games must be one member a side.
 */
export function fitTwoStage(games: readonly Game[], options: FitOptions, given?: readonly string[]): Fit {
  const plain = fit(games, { ...options, counterRidge: undefined }, given);
  const ms = plain.members, n = ms.length, idx = new Map(ms.map((m, i) => [m, i]));
  const lambda = options.counterRidge!;
  const by = new Map<number, { off: number; s: number; sign: number }[]>();
  for (const g of games) {
    if (g.a.length !== 1 || g.b.length !== 1) throw new Error('fitTwoStage: one member a side');
    const i = idx.get(g.a[0])!, j = idx.get(g.b[0])!;
    if (i === j) continue;
    const key = i < j ? i * n + j : j * n + i, sign = i < j ? 1 : -1;
    const p = Math.min(1 - 1e-9, Math.max(1e-9, plain.predict(g)));
    (by.get(key) ?? by.set(key, []).get(key)!).push({ off: Math.log(p / (1 - p)), s: g.s, sign });
  }
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0)), V = Array.from({ length: n }, () => new Array<number>(n).fill(1 / lambda));
  for (const [key, rows] of by) {
    const i = Math.floor(key / n), j = key % n;
    let c = 0, h = lambda;
    for (let it = 0; it < 30; it++) {
      let g = -lambda * c;
      h = lambda;
      for (const r of rows) { const p = sigmoid(r.off + r.sign * c); g += r.sign * (r.s - p); h += p * (1 - p); }
      const d = Math.max(-2, Math.min(2, g / h));
      c += d;
      if (Math.abs(d) < 1e-8) break;
    }
    C[i][j] = c; C[j][i] = -c; V[i][j] = V[j][i] = 1 / h;
  }
  const rowMean = C.map(r => r.reduce((a, b) => a + b, 0) / n);
  const counter: Record<string, Record<string, number>> = {}, counterSe: Record<string, Record<string, number>> = {};
  ms.forEach((x, i) => {
    counter[x] = {}; counterSe[x] = {};
    ms.forEach((y, j) => { if (i !== j) { counter[x][y] = (C[i][j] - (rowMean[i] - rowMean[j])) * ELO; counterSe[x][y] = Math.sqrt(V[i][j]) * ELO; } });
  });
  const predict = (g: Pick<Game, 'a' | 'b'>): number => {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, plain.predict(g)));
    return sigmoid(Math.log(p / (1 - p)) + (counter[g.a[0]]?.[g.b[0]] ?? 0) / ELO);
  };
  return { ...plain, counter, counterSe, predict, loss: logLoss(games, predict) };
}

export function fit(games: readonly Game[], options: FitOptions = {}, given?: readonly string[]): Fit {
  // A big roster of single members: the joint Newton step inverts a matrix of
  // members² columns, hours of it. Then the ratings are fitted first and each
  // pair's counter on its own, the ratings held.
  if (options.counterRidge !== undefined && (given?.length ?? membersOf(games).length) > 22) return fitTwoStage(games, options, given);
  const o = { ridge: 1e-3, ...options };
  const members = given ? [...given] : membersOf(games);
  const n = members.length;
  const { rows, cols, pairCol, featNames } = design(games, members, o);
  const pairs = o.counterRidge === undefined ? 0 : (n * (n - 1)) / 2;
  const lambda = (c: number): number => (c < n ? o.ridge : c < n + pairs ? o.counterRidge! : 1e-6);
  const w = new Array<number>(cols).fill(0);
  let H: number[][] = [];
  for (let iter = 0; iter < 60; iter++) {
    const grad = new Array<number>(cols).fill(0);
    H = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
    for (let g = 0; g < games.length; g++) {
      let z = 0;
      for (const [c, v] of rows[g]) z += w[c] * v;
      const p = sigmoid(z);
      const r = games[g].s - p, v2 = p * (1 - p);
      for (const [c, v] of rows[g]) {
        grad[c] += r * v;
        for (const [d, u] of rows[g]) H[c][d] += v2 * v * u;
      }
    }
    for (let c = 0; c < cols; c++) { grad[c] -= lambda(c) * w[c]; H[c][c] += lambda(c); }
    if (o.anchor?.length) {
      const at = o.anchor.map(m => members.indexOf(m)).filter(i => i >= 0);
      const total = at.reduce((t, i) => t + w[i], 0);
      for (const i of at) { grad[i] -= CYCLES_ONLY * total; for (const j of at) H[i][j] += CYCLES_ONLY; }
    }
    // The table holds cycles only: a member's counters sum to nothing. A
    // counter of the form u(x) − u(y) is a rating under another name (on
    // summed teams it IS one), and left free it shares the ratings' evidence
    // and neither is measured.
    if (pairs) {
      for (let i = 0; i < n; i++) {
        const v: [number, number][] = [];
        for (let j = 0; j < n; j++) if (j !== i) v.push(i < j ? [pairCol(i, j), 1] : [pairCol(j, i), -1]);
        const dot = v.reduce((t, [c, s]) => t + s * w[c], 0);
        for (const [c, s] of v) { grad[c] -= CYCLES_ONLY * dot * s; for (const [d, u] of v) H[c][d] += CYCLES_ONLY * s * u; }
      }
    }
    const inv = invert(H);
    let step = 0;
    for (let c = 0; c < cols; c++) {
      let d = 0;
      for (let k = 0; k < cols; k++) d += inv[c][k] * grad[k];
      // Damped: a separable member (never lost) must not run away in one step.
      d = Math.max(-3, Math.min(3, d));
      w[c] += d;
      step = Math.max(step, Math.abs(d));
    }
    if (step < 1e-7) break;
  }
  const cov = invert(H);
  // Centre the ratings: a member's rating is its distance from the field's mean.
  const mean = w.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const covMeanRow = (i: number): number => cov[i].slice(0, n).reduce((a, b) => a + b, 0) / n;
  const covMean = Array.from({ length: n }, (_, i) => covMeanRow(i)).reduce((a, b) => a + b, 0) / n;
  const rating: Record<string, number> = {}, se: Record<string, number> = {};
  members.forEach((m, i) => {
    rating[m] = (o.centre === false ? w[i] : w[i] - mean) * ELO;
    se[m] = Math.sqrt(Math.max(0, o.centre === false ? cov[i][i] : cov[i][i] - 2 * covMeanRow(i) + covMean)) * ELO;
  });
  let counter: Fit['counter'], counterSe: Fit['counterSe'];
  if (pairs) {
    counter = Object.fromEntries(members.map(m => [m, {} as Record<string, number>]));
    counterSe = Object.fromEntries(members.map(m => [m, {} as Record<string, number>]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const c = pairCol(i, j);
      counter[members[i]][members[j]] = w[c] * ELO; counter[members[j]][members[i]] = -w[c] * ELO;
      counterSe[members[i]][members[j]] = counterSe[members[j]][members[i]] = Math.sqrt(Math.max(0, cov[c][c])) * ELO;
    }
  }
  const feature = Object.fromEntries(featNames.map((f, k) => [f, { value: w[n + pairs + k] * ELO, se: Math.sqrt(Math.max(0, cov[n + pairs + k][n + pairs + k])) * ELO }]));
  const zOf = (g: Pick<Game, 'a' | 'b'>): number => {
    const [row] = design([{ ...g, s: 0 }], members, o).rows;
    let z = 0;
    for (const [c, v] of row) z += w[c] * v;
    return z;
  };
  const predict = (g: Pick<Game, 'a' | 'b'>): number => sigmoid(zOf(g));
  return { members, rating, se, counter, counterSe, feature, predict, loss: logLoss(games, predict) };
}

export function logLoss(games: readonly Game[], predict: (g: Game) => number): number {
  let t = 0;
  for (const g of games) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(g)));
    t -= g.s * Math.log(p) + (1 - g.s) * Math.log(1 - p);
  }
  return t / Math.max(1, games.length);
}

/** Held-out log loss of a fit, `folds`-fold: what the model predicts of games it did not see. */
export function heldOutLoss(games: readonly Game[], options: FitOptions, folds = 5, seed = 1): number {
  const order = shuffled(games, mulberry(seed));
  const members = membersOf(games);
  let total = 0;
  for (let f = 0; f < folds; f++) {
    const test = order.filter((_, i) => i % folds === f), train = order.filter((_, i) => i % folds !== f);
    total += logLoss(test, fit(train, options, members).predict) * test.length;
  }
  return total / games.length;
}

/**
 * Does a counter table predict unseen games better than the ratings alone?
 * The table's ridge is chosen on the held-out loss; `gain` is the loss the
 * best table takes off, in thousandths of a nat a game, with the spread of
 * that gain over reshuffled folds.
 */
export function counterGain(games: readonly Game[], ridges: readonly number[] = [300, 100, 30, 10, 3, 1, 0.3], seeds = 3, base: FitOptions = {}): { plain: number; best: number; ridge: number; gain: number; gainSd: number } {
  const gains: number[] = [];
  let plain = 0, best = Infinity, ridge = ridges[0];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const bySeed = Array.from({ length: seeds }, (_, s) => ({ plain: heldOutLoss(games, base, 5, s + 1), by: ridges.map(r => heldOutLoss(games, { ...base, counterRidge: r }, 5, s + 1)) }));
  plain = mean(bySeed.map(x => x.plain));
  ridges.forEach((r, k) => { const l = mean(bySeed.map(x => x.by[k])); if (l < best) { best = l; ridge = r; } });
  const k = ridges.indexOf(ridge);
  for (const x of bySeed) gains.push((x.plain - x.by[k]) * 1000);
  const g = mean(gains);
  return { plain, best, ridge, gain: g, gainSd: Math.sqrt(mean(gains.map(x => (x - g) ** 2))) };
}

// --- online: Elo, game by game -----------------------------------------------

/** One pass of Elo over the games in the order given: every member of a side moves by K × (score − expected). */
export function onlineElo(games: readonly Game[], k = 16, start: Record<string, number> = {}): Record<string, number> {
  const r: Record<string, number> = { ...start };
  const of = (m: string) => r[m] ?? 0;
  for (const g of games) {
    const d = g.a.reduce((t, m) => t + of(m), 0) - g.b.reduce((t, m) => t + of(m), 0);
    const delta = k * (g.s - sigmoid(d / ELO));
    for (const m of g.a) r[m] = of(m) + delta;
    for (const m of g.b) r[m] = of(m) - delta;
  }
  return centred(r);
}

export function centred(r: Record<string, number>): Record<string, number> {
  const ms = Object.keys(r);
  const mean = ms.reduce((t, m) => t + r[m], 0) / Math.max(1, ms.length);
  return Object.fromEntries(ms.map(m => [m, r[m] - mean]));
}

// --- online: TrueSkill, two teams ----------------------------------------------

const phi = (x: number): number => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
/** Normal CDF (Abramowitz-Stegun 26.2.17 through erfc's continued form is overkill: this is accurate to 1e-7). */
function Phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = phi(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}

export interface TrueSkillOptions { mu?: number; sigma?: number; beta?: number; drawMargin?: number }
export interface Belief { mu: number; var: number }

/** TrueSkill over the games in order: a side's performance is the sum of its members' (a member fielded twice counts twice). */
export function trueSkill(games: readonly Game[], options: TrueSkillOptions = {}): { belief: Record<string, Belief>; elo: Record<string, number>; eloSe: Record<string, number> } {
  const o = { mu: 0, sigma: 3, beta: 1, drawMargin: 0.1, ...options };
  const b: Record<string, Belief> = {};
  const of = (m: string) => (b[m] ??= { mu: o.mu, var: o.sigma ** 2 });
  let bodies = 4;
  for (const g of games) {
    const count = (side: string[]) => { const c = new Map<string, number>(); for (const m of side) c.set(m, (c.get(m) ?? 0) + 1); return c; };
    const A = count(g.a), B = count(g.b);
    bodies = g.a.length + g.b.length;
    let c2 = bodies * o.beta ** 2, dmu = 0;
    for (const [m, k] of A) { c2 += k * k * of(m).var; dmu += k * of(m).mu; }
    for (const [m, k] of B) { c2 += k * k * of(m).var; dmu -= k * of(m).mu; }
    const c = Math.sqrt(c2), e = o.drawMargin * Math.sqrt(bodies) * o.beta / c;
    let v: number, w: number, sign: number;
    if (g.s === 0.5) {
      const t = dmu / c, den = Math.max(1e-12, Phi(e - t) - Phi(-e - t));
      v = (phi(-e - t) - phi(e - t)) / den;
      w = v * v + ((e - t) * phi(e - t) + (e + t) * phi(e + t)) / den;
      sign = 1;
    } else {
      sign = g.s > 0.5 ? 1 : -1;
      const t = sign * dmu / c, den = Math.max(1e-12, Phi(t - e));
      v = phi(t - e) / den;
      w = v * (v + t - e);
    }
    for (const [side, dir] of [[A, sign], [B, -sign]] as const) for (const [m, k] of side) {
      const x = of(m);
      x.mu += dir * (k * x.var / c) * v;
      x.var = Math.max(1e-6, x.var * (1 - (k * k * x.var / c2) * w));
    }
  }
  // A probit gap of d/(sqrt(bodies) beta) reads as a logistic gap of about 1.702 times that.
  const scale = (1.702 / (Math.sqrt(bodies) * o.beta)) * ELO;
  const elo = centred(Object.fromEntries(Object.entries(b).map(([m, x]) => [m, x.mu * scale])));
  const eloSe = Object.fromEntries(Object.entries(b).map(([m, x]) => [m, Math.sqrt(x.var) * scale]));
  return { belief: b, elo, eloSe };
}

// --- one member against one member: the pair matrix, and what ranks on it -----

/** `logit[i][j]`: the log odds that i beats j (antisymmetric), from a fit: the two ratings plus the counter term. */
export function pairLogits(f: Fit): number[][] {
  return f.members.map(x => f.members.map(y => (x === y ? 0 : (f.rating[x] - f.rating[y] + (f.counter?.[x]?.[y] ?? 0)) / ELO)));
}

/**
 * How much of the pair matrix is a ladder: the share of its squared size that
 * the best one-number-per-member reading explains (the rest is cycles).
 */
export function ladderShare(logit: readonly (readonly number[])[]): number {
  const n = logit.length;
  const r = logit.map(row => row.reduce((a, b) => a + b, 0) / n);
  let total = 0, cyc = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { total += logit[i][j] ** 2; cyc += (logit[i][j] - (r[i] - r[j])) ** 2; }
  return total ? 1 - cyc / total : 1;
}

/**
 * Nash averaging (Balduzzi et al. 2018): the mix no member beats on the
 * antisymmetric pair matrix, and each member's score against that mix. The
 * mix is the entropy-smoothed one as the smoothing goes to nothing, so clones
 * share their mass instead of adding to it.
 */
export function nashAverage(logit: readonly (readonly number[])[], iters = 40_000): { mix: number[]; rating: number[] } {
  const n = logit.length;
  let p = new Array<number>(n).fill(1 / n);
  const avg = new Array<number>(n).fill(0);
  const cum = new Array<number>(n).fill(0);
  // Hedge on the cumulative payoff: the average mix converges to an equilibrium of the antisymmetric game.
  for (let t = 1; t <= iters; t++) {
    const eta = 2 / Math.sqrt(t);
    for (let i = 0; i < n; i++) { let u = 0; for (let j = 0; j < n; j++) u += logit[i][j] * p[j]; cum[i] += u; }
    const top = Math.max(...cum.map(c => c * eta));
    const e = cum.map(c => Math.exp(c * eta - top));
    const z = e.reduce((a, b) => a + b, 0);
    p = e.map(x => x / z);
    for (let i = 0; i < n; i++) avg[i] += p[i];
  }
  const mix = avg.map(x => x / iters);
  return { mix, rating: logit.map(row => row.reduce((t, x, j) => t + x * mix[j], 0) * ELO) };
}

/**
 * α-Rank, one population (Omidshafiei et al. 2019): the long-run share of time
 * a population of `m` spends on each member when single mutants take over with
 * the odds their win rate against the resident gives them.
 */
export function alphaRank(win: readonly (readonly number[])[], alpha = 30, m = 50): number[] {
  const n = win.length;
  const T = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    let stay = 1;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = win[j][i] - win[i][j];
      const fix = Math.abs(d) < 1e-9 ? 1 / m : (1 - Math.exp(-alpha * d)) / (1 - Math.exp(-m * alpha * d));
      T[i][j] = fix / (n - 1);
      stay -= T[i][j];
    }
    T[i][i] = stay;
  }
  let pi = new Array<number>(n).fill(1 / n);
  for (let it = 0; it < 20_000; it++) {
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) next[j] += pi[i] * T[i][j];
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pi[i]);
    pi = next;
    if (diff < 1e-12) break;
  }
  return pi;
}

// --- reading two rankings against each other ---------------------------------

export function spearman(a: Record<string, number>, b: Record<string, number>): number {
  const ms = Object.keys(a).filter(m => m in b);
  const rank = (r: Record<string, number>) => { const s = [...ms].sort((x, y) => r[x] - r[y]); return new Map(s.map((m, i) => [m, i])); };
  const ra = rank(a), rb = rank(b), n = ms.length;
  if (n < 2) return 1;
  const d2 = ms.reduce((t, m) => t + (ra.get(m)! - rb.get(m)!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** Root mean square gap between two ratings of the same members, both centred. */
export function rmsGap(a: Record<string, number>, b: Record<string, number>): number {
  const ms = Object.keys(a).filter(m => m in b);
  const ca = centred(Object.fromEntries(ms.map(m => [m, a[m]]))), cb = centred(Object.fromEntries(ms.map(m => [m, b[m]])));
  return Math.sqrt(ms.reduce((t, m) => t + (ca[m] - cb[m]) ** 2, 0) / Math.max(1, ms.length));
}

/** A member's raw score: the mean score of the sides it was on. */
export function rawScore(games: readonly Game[]): Record<string, { score: number; n: number }> {
  const t: Record<string, { score: number; n: number }> = {};
  for (const g of games) {
    for (const m of new Set(g.a)) { (t[m] ??= { score: 0, n: 0 }).score += g.s; t[m].n++; }
    for (const m of new Set(g.b)) { (t[m] ??= { score: 0, n: 0 }).score += 1 - g.s; t[m].n++; }
  }
  for (const m of Object.keys(t)) t[m].score /= t[m].n;
  return t;
}
