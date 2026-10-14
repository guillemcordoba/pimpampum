/**
 * A ZERO-SUM MATRIX GAME, SOLVED EXACTLY — the referee's arithmetic.
 *
 * Each round of a fight is a simultaneous-move game: both sides commit cards
 * at once, so the right answer is not a card but a MIXED strategy (rock, paper,
 * scissors has no best pure play). For a zero-sum game the Nash equilibrium
 * is the minimax pair and is the solution of one linear program, which this
 * solves with a dense tableau simplex under Bland's rule (no cycling, and the
 * matrices here are at most a few hundred cells).
 *
 *   payoff[i][j] = what the ROW side gets when it plays i and the column side
 *   plays j; the column side gets the negation.
 *
 * The LP is the column player's: shift every payoff positive (by `shift`), then
 * maximise Σy subject to A·y ≤ 1, y ≥ 0. Its optimum is 1/v, its solution the
 * column strategy (scaled), and its dual — read off the slack columns of the
 * final objective row — the row strategy.
 */

export interface MatrixSolution {
  /** The game's value to the row side. */
  value: number;
  /** The row side's equilibrium (maximin) mixed strategy. */
  row: number[];
  /** The column side's equilibrium (minimax) mixed strategy. */
  col: number[];
}

const EPS = 1e-9;

/**
 * Solve, after merging duplicate rows and columns. The referee's matrices are
 * full of them (two targets that come to the same thing, a seat whose card
 * cannot matter), and duplicates are exactly the degeneracy a floating-point
 * simplex stumbles on. A duplicate gets probability 0; its twin carries it.
 */
export function solveZeroSum(payoff: number[][]): MatrixSolution {
  const rowKey = (r: number[]): string => r.map(x => x.toFixed(9)).join(',');
  const keepRows: number[] = [];
  const seenRows = new Set<string>();
  payoff.forEach((r, i) => { const k = rowKey(r); if (!seenRows.has(k)) { seenRows.add(k); keepRows.push(i); } });
  const n = payoff[0]?.length ?? 0;
  const keepCols: number[] = [];
  const seenCols = new Set<string>();
  for (let j = 0; j < n; j++) {
    const k = rowKey(keepRows.map(i => payoff[i][j]));
    if (!seenCols.has(k)) { seenCols.add(k); keepCols.push(j); }
  }
  const reduced = keepRows.map(i => keepCols.map(j => payoff[i][j]));
  let core: MatrixSolution;
  try {
    core = solveCore(reduced);
  } catch {
    core = { value: NaN, row: [], col: [] };
  }
  // The simplex is exact up to floating point; if floating point beat it,
  // regret matching (slow, but it cannot fail) takes over.
  const spread = Math.max(1, ...reduced.flat().map(Math.abs));
  if (!core.row.length || !(exploitability(reduced, core) <= 1e-6 * spread)) {
    core = solveByRegretMatching(reduced, 200_000);
  }
  const row = new Array(payoff.length).fill(0);
  keepRows.forEach((i, k) => { row[i] = core.row[k]; });
  const col = new Array(n).fill(0);
  keepCols.forEach((j, k) => { col[j] = core.col[k]; });
  return { value: core.value, row, col };
}

function solveCore(payoff: number[][]): MatrixSolution {
  const m = payoff.length;
  const n = payoff[0]?.length ?? 0;
  if (m === 0 || n === 0) throw new Error('solveZeroSum: empty matrix');
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of payoff) for (const x of r) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  // A constant game: every strategy is optimal; uniform is as good as any.
  if (hi - lo < 1e-12) return { value: lo, row: uniform(m), col: uniform(n) };
  // Scale to [1, 2] so the tolerances below mean the same thing for a 3-PV
  // game and a 300-PV one.
  const scale = hi - lo;
  const a = payoff.map(r => r.map(x => 1 + (x - lo) / scale));

  // Tableau: m constraint rows over n structural + m slack columns, then the
  // right-hand side; row m is the objective (reduced costs, maximising Σy).
  const cols = n + m + 1;
  const t: Float64Array[] = [];
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(cols);
    for (let j = 0; j < n; j++) row[j] = a[i][j];
    row[n + i] = 1;
    row[cols - 1] = 1;
    t.push(row);
  }
  const obj = new Float64Array(cols);
  for (let j = 0; j < n; j++) obj[j] = -1;
  t.push(obj);
  const basis = Array.from({ length: m }, (_, i) => n + i);

  for (let iter = 0; iter < 50_000; iter++) {
    // Bland: the lowest-index column with a negative reduced cost enters.
    let enter = -1;
    for (let j = 0; j < n + m; j++) if (t[m][j] < -EPS) { enter = j; break; }
    if (enter < 0) break;
    let leave = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const v = t[i][enter];
      if (v <= EPS) continue;
      const ratio = t[i][cols - 1] / v;
      if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && basis[i] < basis[leave])) {
        best = ratio; leave = i;
      }
    }
    // Unbounded cannot happen (A > 0 bounds every y); guard anyway.
    if (leave < 0) throw new Error(`solveZeroSum: unbounded LP on ${JSON.stringify(payoff)}`);
    const p = t[leave][enter];
    for (let j = 0; j < cols; j++) t[leave][j] /= p;
    for (let i = 0; i <= m; i++) {
      if (i === leave) continue;
      const f = t[i][enter];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < cols; j++) t[i][j] -= f * t[leave][j];
    }
    basis[leave] = enter;
  }

  const y = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) y[basis[i]] = t[i][cols - 1];
  const x = new Array(m).fill(0);
  for (let i = 0; i < m; i++) x[i] = Math.max(0, t[m][n + i]);
  const sum = y.reduce((s, v) => s + v, 0);
  const vScaled = 1 / sum;
  return {
    value: lo + (vScaled - 1) * scale,
    row: normalise(x),
    col: normalise(y),
  };
}

/** What each row earns against the column strategy `col`. */
export function rowValues(payoff: number[][], col: number[]): number[] {
  return payoff.map(r => r.reduce((s, x, j) => s + x * col[j], 0));
}

/** What each column concedes against the row strategy `row`. */
export function colValues(payoff: number[][], row: number[]): number[] {
  const n = payoff[0].length;
  const out = new Array(n).fill(0);
  payoff.forEach((r, i) => r.forEach((x, j) => { out[j] += x * row[i]; }));
  return out;
}

/**
 * How far a strategy pair is from equilibrium: the best a side could gain by
 * deviating, summed over both sides. Zero at a Nash equilibrium; the tests
 * hold the solver to it.
 */
export function exploitability(payoff: number[][], sol: Pick<MatrixSolution, 'row' | 'col'>): number {
  const rv = rowValues(payoff, sol.col);
  const cv = colValues(payoff, sol.row);
  return Math.max(...rv) - Math.min(...cv);
}

/**
 * REGRET MATCHING+ — an independent route to the same equilibrium: both sides
 * repeatedly play in proportion to their positive cumulative regret, and the
 * (linearly weighted) average strategies converge to a Nash equilibrium at
 * rate O(1/√T). Slow next to the simplex, but it has no pivots to go wrong:
 * it is the simplex's fallback and the tests' second opinion.
 */
export function solveByRegretMatching(payoff: number[][], iters = 20_000): MatrixSolution {
  const m = payoff.length;
  const n = payoff[0].length;
  const rr = new Array(m).fill(0);
  const cr = new Array(n).fill(0);
  const rAvg = new Array(m).fill(0);
  const cAvg = new Array(n).fill(0);
  const strat = (reg: number[]): number[] => {
    const pos = reg.map(x => Math.max(0, x));
    const s = pos.reduce((a, b) => a + b, 0);
    return s > 0 ? pos.map(x => x / s) : uniform(reg.length);
  };
  for (let t = 1; t <= iters; t++) {
    const x = strat(rr);
    const y = strat(cr);
    const rv = rowValues(payoff, y);
    const ev = rv.reduce((s, v, i) => s + v * x[i], 0);
    for (let i = 0; i < m; i++) rr[i] = Math.max(0, rr[i] + rv[i] - ev);
    const x2 = strat(rr);
    const cv = colValues(payoff, x2);
    const ec = cv.reduce((s, v, j) => s + v * y[j], 0);
    for (let j = 0; j < n; j++) cr[j] = Math.max(0, cr[j] + ec - cv[j]);
    for (let i = 0; i < m; i++) rAvg[i] += t * x2[i];
    for (let j = 0; j < n; j++) cAvg[j] += t * y[j];
  }
  const row = normalise(rAvg);
  const col = normalise(cAvg);
  const value = rowValues(payoff, col).reduce((s, v, i) => s + v * row[i], 0);
  return { value, row, col };
}

function uniform(k: number): number[] { return new Array(k).fill(1 / k); }

function normalise(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map(x => x / s) : uniform(v.length);
}
