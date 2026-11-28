/**
 * SCRATCH (2026-11-28, the ranking experiments): Lin and Wu's two tables
 * (arXiv 2408.17180), small enough to train here.
 *
 *  - the NEURAL RATING TABLE: a network reads a whole side (which members,
 *    how many of each) and gives it one rating; a fight is the difference of
 *    two ratings. Unlike a sum of member ratings it can say that two members
 *    are worth more together than apart.
 *  - the COUNTER TABLE: sides are sorted into a few categories by what the
 *    ratings fail to predict of their fights, and a small category-against-
 *    category table holds the correction. The paper learns the categories with
 *    a vector-quantised network; here they are clustered (k-means on each
 *    side's leftover against every category, re-fitted a few times), which is
 *    the same table reached a plainer way.
 *
 * bench-exempt(seeded): initial weights and folds from `mulberry`.
 */
import { ELO, logLoss, mulberry, shuffled, type Game } from './fit.js';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const sideKey = (side: readonly string[]): string => [...side].sort().join(' + ');

export interface RatingNet {
  members: string[];
  /** A side's rating, in Elo points. */
  rate(side: readonly string[]): number;
  predict(g: Pick<Game, 'a' | 'b'>): number;
}

export interface NetOptions { hidden?: number; epochs?: number; rate?: number; decay?: number; seed?: number }

/** rating(side) = a linear sum of its members (the Bradley-Terry part) + a one-hidden-layer network on the same counts. */
export function trainRatingNet(games: readonly Game[], members: readonly string[], options: NetOptions = {}): RatingNet {
  const o = { hidden: 12, epochs: 300, rate: 0.02, decay: 1e-3, seed: 1, ...options };
  const n = members.length, h = o.hidden;
  const idx = new Map(members.map((m, i) => [m, i]));
  const rand = mulberry(o.seed);
  const enc = (side: readonly string[]): number[] => { const x = new Array<number>(n).fill(0); for (const m of side) x[idx.get(m)!]++; return x; };
  // Parameters, flat: linear (n), W1 (h×n), b1 (h), w2 (h).
  const size = n + h * n + h + h;
  const p = Array.from({ length: size }, (_, i) => (i < n ? 0 : (rand() - 0.5) * 0.4));
  const W1 = n, B1 = n + h * n, W2 = B1 + h;
  const forward = (x: number[], hid?: number[]): number => {
    let r = 0;
    for (let i = 0; i < n; i++) r += p[i] * x[i];
    for (let k = 0; k < h; k++) {
      let z = p[B1 + k];
      for (let i = 0; i < n; i++) if (x[i]) z += p[W1 + k * n + i] * x[i];
      const a = Math.tanh(z);
      if (hid) hid[k] = a;
      r += p[W2 + k] * a;
    }
    return r;
  };
  const data = games.map(g => ({ a: enc(g.a), b: enc(g.b), s: g.s }));
  const m1 = new Array<number>(size).fill(0), m2 = new Array<number>(size).fill(0);
  const ha = new Array<number>(h).fill(0), hb = new Array<number>(h).fill(0);
  let step = 0;
  const batch = 64;
  for (let epoch = 0; epoch < o.epochs; epoch++) {
    const order = shuffled(data, rand);
    for (let at = 0; at < order.length; at += batch) {
      const grad = new Array<number>(size).fill(0);
      const chunk = order.slice(at, at + batch);
      for (const d of chunk) {
        const err = sigmoid(forward(d.a, ha) - forward(d.b, hb)) - d.s;
        for (const [x, hid, sign] of [[d.a, ha, 1], [d.b, hb, -1]] as const) {
          const e = err * sign;
          for (let i = 0; i < n; i++) if (x[i]) grad[i] += e * x[i];
          for (let k = 0; k < h; k++) {
            grad[W2 + k] += e * hid[k];
            const back = e * p[W2 + k] * (1 - hid[k] * hid[k]);
            grad[B1 + k] += back;
            for (let i = 0; i < n; i++) if (x[i]) grad[W1 + k * n + i] += back * x[i];
          }
        }
      }
      step++;
      for (let j = 0; j < size; j++) {
        // The network's weights decay; the linear part does not, so with nothing to add the net falls back to a sum.
        const g = grad[j] / chunk.length + (j >= n ? o.decay * p[j] : 0);
        m1[j] = 0.9 * m1[j] + 0.1 * g;
        m2[j] = 0.999 * m2[j] + 0.001 * g * g;
        p[j] -= o.rate * (m1[j] / (1 - 0.9 ** step)) / (Math.sqrt(m2[j] / (1 - 0.999 ** step)) + 1e-8);
      }
    }
  }
  const raw = (side: readonly string[]) => forward(enc(side));
  return { members: [...members], rate: side => raw(side) * ELO, predict: g => sigmoid(raw(g.a) - raw(g.b)) };
}

export interface CounterCategories {
  /** Each side seen (by `sideKey`) → its category. */
  category: Map<string, number>;
  /** `table[i][j]`: what a side of category i gains against one of category j, beyond the ratings (Elo; antisymmetric). */
  table: number[][];
  predict(g: Pick<Game, 'a' | 'b'>): number;
}

/**
 * Sort the sides into `m` categories by what `base` fails to predict of their
 * fights, and fit the m×m correction. A side never seen falls in category 0
 * with no correction.
 */
export function counterCategories(games: readonly Game[], base: (g: Pick<Game, 'a' | 'b'>) => number, m: number, seed = 1, rounds = 6): CounterCategories {
  const rand = mulberry(seed);
  const sides = [...new Set(games.flatMap(g => [sideKey(g.a), sideKey(g.b)]))];
  const at = new Map(sides.map((s, i) => [s, i]));
  const rows = games.map(g => ({ a: at.get(sideKey(g.a))!, b: at.get(sideKey(g.b))!, off: Math.log(Math.max(1e-9, base(g)) / Math.max(1e-9, 1 - base(g))), s: g.s }));
  let cat = sides.map(() => Math.floor(rand() * m));
  let table = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const fitTable = (): void => {
    // Logistic regression on the category pair with the base as offset: a few Newton steps per cell, cells independent given the offsets.
    const t = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    for (let it = 0; it < 25; it++) {
      const g = Array.from({ length: m }, () => new Array<number>(m).fill(0)), hh = Array.from({ length: m }, () => new Array<number>(m).fill(0));
      for (const r of rows) {
        const i = cat[r.a], j = cat[r.b];
        if (i === j) continue;
        const [lo, hi, sign] = i < j ? [i, j, 1] : [j, i, -1];
        const pr = sigmoid(r.off + sign * t[lo][hi]);
        g[lo][hi] += sign * (r.s - pr); hh[lo][hi] += pr * (1 - pr);
      }
      for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) t[i][j] += Math.max(-1, Math.min(1, (g[i][j] - 0.5 * t[i][j]) / (hh[i][j] + 0.5)));
    }
    table = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i < j ? t[i][j] : i > j ? -t[j][i] : 0)));
  };
  for (let round = 0; round < rounds; round++) {
    fitTable();
    // Move each side to the category that best explains its own fights, the others held.
    let moved = 0;
    for (let s = 0; s < sides.length; s++) {
      const mine = rows.filter(r => r.a === s || r.b === s);
      let best = cat[s], bestLoss = Infinity;
      for (let c = 0; c < m; c++) {
        let loss = 0;
        for (const r of mine) {
          const i = r.a === s ? c : cat[r.a], j = r.b === s ? c : cat[r.b];
          const pr = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(r.off + table[i][j])));
          loss -= r.s * Math.log(pr) + (1 - r.s) * Math.log(1 - pr);
        }
        if (loss < bestLoss - 1e-9) { bestLoss = loss; best = c; }
      }
      if (best !== cat[s]) { cat[s] = best; moved++; }
    }
    if (!moved && round) break;
  }
  fitTable();
  const category = new Map(sides.map((s, i) => [s, cat[i]]));
  const final = table;
  return {
    category, table: final.map(r => r.map(x => x * ELO)),
    predict: g => {
      const i = category.get(sideKey(g.a)), j = category.get(sideKey(g.b));
      const pb = Math.min(1 - 1e-9, Math.max(1e-9, base(g)));
      return sigmoid(Math.log(pb / (1 - pb)) + (i === undefined || j === undefined ? 0 : final[i][j]));
    },
  };
}

/** Held-out log loss of any model: `train` returns a predictor from the training games. */
export function heldOut(games: readonly Game[], train: (gs: Game[]) => (g: Game) => number, folds = 4, seed = 1): number {
  const order = shuffled(games, mulberry(seed));
  let total = 0;
  for (let f = 0; f < folds; f++) {
    const test = order.filter((_, i) => i % folds === f);
    total += logLoss(test, train(order.filter((_, i) => i % folds !== f))) * test.length;
  }
  return total / games.length;
}
