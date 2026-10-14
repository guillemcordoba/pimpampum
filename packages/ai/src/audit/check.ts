/**
 * THE CHECK — does the production AI play something the referee rules out?
 *
 * The AI (`bestResponse` at `DEFAULT_LOOKAHEAD`, the setting `aiPolicy({depth:1})`
 * plays with) chooses team 0's cards in the position, over several seeds since
 * its rollouts sample. The referee then solves the same position with the AI's
 * picks guaranteed among its candidates, and each pick is judged:
 *
 *   MISMATCH  the pick has equilibrium probability ≈ 0, AND against the
 *             equilibrium opponent it earns less than the game value by more
 *             than `epsilon` PV and more than `z` standard errors of the
 *             referee's root sampling — and it stays so when the position is
 *             re-solved under `confirm` independent referee seeds. The
 *             replicates are what catch the error the root's standard error
 *             cannot see (a deterministic first round over a sampled second).
 *
 * Targets are not judged: the AI aims at resolution, so a pick is credited with
 * the best target variant the referee considered for it.
 *
 * ONE ROUND MORE FOR THE AI. The referee scores the fight at its round cap; the
 * AI's evaluator treats a board AT `maxRounds` as a draw worth 0 (a real-game
 * rule for 50-round stalls). Shown the true cap, the AI would see every
 * last-round play as worth nothing and the audit would report that artefact.
 * So the AI's engine has `maxRounds + 1` — its depth-1 search never reaches it.
 */
import { withSeed, type Character } from '@pimpampum/engine';
import { pickResolveTargets, selectAction } from '../policy.js';
import { bestResponse, DEFAULT_LOOKAHEAD } from '../lookahead.js';
import { ARCHETYPES } from './catalogue.js';
import { buildEngine, type Position } from './position.js';
import { BudgetExceeded, Referee, jointKey, type Joint, type RefereeOptions, type RootSolution } from './referee.js';

export interface CheckOptions {
  /** Seeds the AI is asked under. */
  aiSeeds: number;
  /** PV a pick must lose by, at least, to count. */
  epsilon: number;
  /** …and this many standard errors of the referee's estimate. */
  z: number;
  /** Equilibrium probability below which a pick counts as ruled out. */
  pMax: number;
  /** Independent re-solves a flagged pick must survive. */
  confirm: number;
  /** Re-solve this many extra times whatever happens (to measure the referee's error). */
  replicates: number;
  referee: Partial<RefereeOptions>;
}

export const DEFAULT_CHECK: CheckOptions = { aiSeeds: 4, epsilon: 1, z: 2, pMax: 0.02, confirm: 2, replicates: 0, referee: {} };

export interface PickVerdict {
  /** Card archetypes per acting seat, e.g. `strike,guard`. */
  cards: string[];
  /** How many of the AI's seeds chose it. */
  count: number;
  eqProb: number;
  /** Its value against the equilibrium opponent. */
  value: number;
  /** Game value minus that. */
  loss: number;
  /** Noise threshold the loss had to clear. */
  noise: number;
  /** Flagged by the first solve. */
  screened: boolean;
  /** …and by every confirming re-solve. */
  mismatch: boolean;
  /** Its loss in each re-solve. */
  replicateLoss: number[];
}

export interface CheckResult {
  position: Position;
  solved: boolean;
  error?: string;
  value?: number;
  /** The game value in each re-solve. */
  replicateValues?: number[];
  exactRoot?: boolean;
  /** Per acting seat of team 0: archetype → equilibrium probability. */
  eqCards?: Record<string, number>[];
  /** The referee's best pure row and its value. */
  best?: { cards: string[]; value: number };
  picks: PickVerdict[];
  /** Every card combination the referee weighed for team 0 (targets folded
   *  in, best variant kept): what a fixture replays the AI against. */
  combos?: { actions: number[]; cards: string[]; eqProb: number; loss: number }[];
  /** Share of the AI's seeds whose pick is a (confirmed) mismatch. */
  mismatchShare: number;
  sims: number;
  ms: number;
}

const archOf = (c: Character, actionIdx: number): string =>
  actionIdx < 0 ? 'pass' : c.actions[actionIdx].def.id.split('.')[0];

/** The AI's card per acting seat of team 0, over `seeds` seeds. */
export function aiPicks(pos: Position, seeds: number): Map<string, { actions: number[]; count: number }> {
  const out = new Map<string, { actions: number[]; count: number }>();
  for (let s = 0; s < seeds; s++) {
    withSeed(9_000_000 + s, () => {
      const engine = buildEngine(pos, {
        actionChooser: (e, a) => selectAction(e, a).actionIdx, targetChooser: pickResolveTargets,
      }, { extraRounds: 1, ai: true });
      const prep = engine.prepareRound();
      const skipping = new Set(prep.skipping.filter(r => r.team === 0).map(r => r.idx));
      const choices = bestResponse(engine, 0, DEFAULT_LOOKAHEAD).choices;
      const actions = engine.teams[0]
        .map((c, i) => ({ c, i }))
        .filter(({ c, i }) => c.isAlive() && !skipping.has(i))
        .map(({ c }) => choices.get(c) ?? -1);
      const key = actions.join(',');
      const e = out.get(key) ?? { actions, count: 0 };
      e.count++;
      out.set(key, e);
    });
  }
  return out;
}

interface Judged { loss: number; value: number; eqProb: number; noise: number; flagged: boolean }

/** Audit one position. */
export function checkPosition(pos: Position, opts: Partial<CheckOptions> = {}): CheckResult {
  const o = { ...DEFAULT_CHECK, ...opts };
  const t0 = performance.now();
  const picks = [...aiPicks(pos, o.aiSeeds).values()];
  const state = buildEngine(pos, { actionChooser: () => null });
  const baseSeed = o.referee.seed ?? 1;
  let sims = 0;

  // The AI's picks, with every target variant the referee would consider.
  const probe = state.clone();
  const prep = probe.prepareRound();
  const skipping = new Set(prep.skipping.filter(r => r.team === 0).map(r => r.idx));
  const acting = probe.teams[0].map((c, i) => ({ c, i })).filter(({ c, i }) => c.isAlive() && !skipping.has(i));
  const seatOpts = acting.map(({ c, i }) => new Referee(o.referee).seatOptions(probe, c, 0, i));
  const variantsOf = (actions: number[]): Joint[] => {
    let acc: Joint[] = [[]];
    actions.forEach((a, k) => {
      const opts = seatOpts[k].filter(x => x.actionIdx === a);
      const use = opts.length ? opts : [{ idx: acting[k].i, actionIdx: a }];
      acc = acc.flatMap(j => use.map(x => [...j, x]));
    });
    return acc;
  };
  const must = picks.flatMap(p => variantsOf(p.actions));
  const solveWith = (seed: number): RootSolution => {
    const referee = new Referee({ ...o.referee, seed });
    try {
      return referee.solve(state, 0, must);
    } finally {
      sims += referee.sims;
    }
  };
  const judge = (root: RootSolution, actions: number[]): Judged => {
    const bestRow = root.rowValue.reduce((b, v, i) => (v > root.rowValue[b] ? i : b), 0);
    const keys = new Set(variantsOf(actions).map(jointKey));
    const idxs = root.rows.map((r, i) => (keys.has(jointKey(r)) ? i : -1)).filter(i => i >= 0);
    const eqProb = idxs.reduce((s, i) => s + root.sol.row[i], 0);
    const mine = idxs.reduce((b, i) => (b < 0 || root.rowValue[i] > root.rowValue[b] ? i : b), -1);
    const value = mine >= 0 ? root.rowValue[mine] : -Infinity;
    const loss = root.value - value;
    const noise = o.z * Math.hypot(mine >= 0 ? root.rowSE[mine] : 0, root.rowSE[bestRow]);
    return { loss, value, eqProb, noise, flagged: eqProb < o.pMax && loss > Math.max(o.epsilon, noise) };
  };

  let root: RootSolution;
  try {
    root = solveWith(baseSeed);
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return { position: pos, solved: false, error: err.message, picks: [], mismatchShare: 0, sims, ms: performance.now() - t0 };
  }
  const first = picks.map(p => judge(root, p.actions));
  const anyFlag = first.some(j => j.flagged);
  const extra = Math.max(o.replicates, anyFlag ? o.confirm : 0);
  const replicas: RootSolution[] = [];
  for (let r = 1; r <= extra; r++) {
    try { replicas.push(solveWith(baseSeed + 1000 * r)); } catch (err) { if (!(err instanceof BudgetExceeded)) throw err; }
  }
  const confirmers = replicas.slice(0, o.confirm);

  const verdicts: PickVerdict[] = [];
  let mismatched = 0;
  let total = 0;
  picks.forEach((p, k) => {
    const j = first[k];
    const again = replicas.map(rep => judge(rep, p.actions));
    // Every solve must flag it, AND the mean loss over the solves must clear ε
    // by z standard errors of ITS OWN spread across them: the root's standard
    // error cannot see the noise of the sampled rounds below it, and the
    // re-solves can (measured per-solve loss sd ≈ 3-4 PV, NEXT-STEPS §51).
    const losses = [j.loss, ...again.slice(0, o.confirm).map(x => x.loss)];
    const mean = losses.reduce((a, b) => a + b, 0) / losses.length;
    const sd = losses.length > 1 ? Math.sqrt(losses.reduce((s, x) => s + (x - mean) ** 2, 0) / (losses.length - 1)) : 0;
    const mismatch = j.flagged && confirmers.length === o.confirm && again.slice(0, o.confirm).every(x => x.flagged)
      && mean > o.epsilon + o.z * sd / Math.sqrt(losses.length);
    verdicts.push({
      cards: p.actions.map((a, s) => archOf(acting[s].c, a)), count: p.count,
      eqProb: j.eqProb, value: j.value, loss: j.loss, noise: j.noise,
      screened: j.flagged, mismatch, replicateLoss: again.map(x => x.loss),
    });
    total += p.count;
    if (mismatch) mismatched += p.count;
  });

  const cardsOf = (jt: Joint): string[] => jt.map((x, k) => archOf(acting[k]?.c ?? probe.teams[0][x.idx], x.actionIdx));
  const bestRow = root.rowValue.reduce((b, v, i) => (v > root.rowValue[b] ? i : b), 0);
  const byCombo = new Map<string, { actions: number[]; cards: string[]; eqProb: number; value: number }>();
  root.rows.forEach((r, i) => {
    const actions = r.map(x => x.actionIdx);
    const key = actions.join(',');
    const c = byCombo.get(key) ?? { actions, cards: cardsOf(r), eqProb: 0, value: -Infinity };
    c.eqProb += root.sol.row[i];
    c.value = Math.max(c.value, root.rowValue[i]);
    byCombo.set(key, c);
  });
  const combos = [...byCombo.values()].map(c => ({ actions: c.actions, cards: c.cards, eqProb: c.eqProb, loss: root.value - c.value }));
  const eqCards = acting.map((_, k) => {
    const m: Record<string, number> = {};
    root.rows.forEach((r, i) => {
      const a = cardsOf(r)[k];
      m[a] = (m[a] ?? 0) + root.sol.row[i];
    });
    for (const a of Object.keys(m)) if (m[a] < 1e-6) delete m[a];
    return m;
  });
  return {
    position: pos, solved: true, value: root.value, replicateValues: replicas.map(r => r.value),
    exactRoot: root.exactRoot, eqCards,
    best: { cards: cardsOf(root.rows[bestRow]), value: root.rowValue[bestRow] },
    picks: verdicts, combos, mismatchShare: total ? mismatched / total : 0, sims, ms: performance.now() - t0,
  };
}

/** Archetype summaries, for reports. */
export const ARCHETYPE_SUMMARY: Record<string, string> = Object.fromEntries(
  Object.values(ARCHETYPES).map(a => [a.id, a.summary]),
);
