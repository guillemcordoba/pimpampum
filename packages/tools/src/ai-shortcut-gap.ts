/**
 * WHAT EACH SHORTCUT COSTS — the exact layer grading the cheap ones.
 *
 * The equilibrium AI is built exact-layer-first (AI-EQUILIBRIUM-PLAN.md): the
 * referee solves a position exactly (every card, every in-round decision,
 * every round to the end), and every shortcut the live player takes to reach
 * real fights is measured against it. On each position the exact referee can
 * solve, each candidate solves it its own cheap way, and its mixes are handed
 * back to the exact referee, which says how much a perfect opponent gains
 * against them (`Referee.grade`) — the gap, in PV of margin. Today's AI is
 * graded the same way, as the line every shortcut is compared with.
 *
 * A STANDING question — every AI or content change can move a shortcut's gap
 * — so a harness, not an experiment.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-shortcut-gap.ts
 *      … --games 12 --slice 2x1-c3-r3 --budget 4000000
 */
import {
  aiPicks, BudgetExceeded, buildEngine, generatePosition, jointKey, Referee, Unsupported,
  type GeneratorConfig, type RefereeOptions, type Position,
} from '@pimpampum/ai/audit';
import { flag, games } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  '1x1-c4-r4': { shape: '1x1', cards: 4, roundsLeft: 4, multiShare: 0.8 },
  '2x1-c3-r3': { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '1x2-c3-r3': { shape: '1x2', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '2x2-c3-r2': { shape: '2x2', cards: 3, roundsLeft: 2, multiShare: 0.8 },
};

/** The shortcuts, one at a time and then stacked the way a live player would. */
const CANDIDATES: Record<string, Partial<RefereeOptions>> = {
  'oracle ε=0.5': { epsilon: 0.5 },
  'per-seat best response': { bestResponse: 'seat' },
  'decision samples 1': { decisionSamples: [1] },
  'chance samples 4,2,1': { samples: [4, 2, 1] },
  'horizon 2': { horizon: 2 },
  'horizon 1': { horizon: 1 },
  'horizon 1 · evaluator leaf': { horizon: 1, leaf: 'score' },
  'horizon 1 · random-playout leaf': { horizon: 1, leaf: 'playout' },
  'horizon 2 · evaluator leaf': { horizon: 2, leaf: 'score' },
  'stacked: h1 · seat · dec 1 · 4 samples': { horizon: 1, bestResponse: 'seat', decisionSamples: [1], samples: [4] },
};

const POSITIONS = games(8);
const BUDGET = Number(flag('--budget') ?? 4_000_000);
const slices = flag('--slice') ? [flag('--slice')!] : Object.keys(SLICES);
/** `--only leaf`: just the candidates whose name holds this text. */
const only = flag('--only');

interface Row { name: string; gaps: number[]; seconds: number[]; sims: number[] }
const rows = new Map<string, Row>();
const row = (name: string): Row => {
  let r = rows.get(name);
  if (!r) rows.set(name, r = { name, gaps: [], seconds: [], sims: [] });
  return r;
};
const fresh = (pos: Position) => buildEngine(pos, { actionChooser: () => null });

let skipped = 0;
for (const slice of slices) {
  const gen = SLICES[slice];
  if (!gen) throw new Error(`--slice ${slice}: unknown (${Object.keys(SLICES).join(', ')})`);
  for (let seed = 1; seed <= POSITIONS; seed++) {
    const pos = generatePosition(seed, gen);
    const exact = new Referee({ strategies: 'oracle', budget: BUDGET });
    let t = performance.now();
    try {
      exact.solve(fresh(pos), 0);
    } catch (e) {
      if (e instanceof BudgetExceeded || e instanceof Unsupported) { skipped++; continue; }
      throw e;
    }
    const exactRow = row('exact (L1)');
    exactRow.gaps.push(0);
    exactRow.seconds.push((performance.now() - t) / 1000);
    exactRow.sims.push(exact.sims);
    const grading = { ...exact.opts, budget: Infinity };
    const judge = new Referee(grading);

    for (const [name, opts] of Object.entries(CANDIDATES)) {
      if (only && !name.includes(only)) continue;
      const cheap = new Referee({ strategies: 'oracle', budget: BUDGET, ...opts });
      t = performance.now();
      let root;
      try { root = cheap.solve(fresh(pos), 0); } catch (e) { if (e instanceof BudgetExceeded) continue; throw e; }
      const seconds = (performance.now() - t) / 1000;
      const mix = (joints: typeof root.rows, p: number[]) =>
        new Map(joints.map((j, i) => [jointKey(j), p[i]] as const).filter(([, x]) => x > 0));
      const g = judge.grade(fresh(pos), { rows: mix(root.rows, root.sol.row), cols: mix(root.cols, root.sol.col) });
      const r = row(name);
      r.gaps.push(((g.rowGap ?? 0) + (g.colGap ?? 0)) / 2);
      r.seconds.push(seconds);
      r.sims.push(cheap.sims);
    }

    // Today's AI, side A only: its picks over seeds, as a mix.
    t = performance.now();
    const picks = aiPicks(pos, 4);
    const total = [...picks.values()].reduce((s, p) => s + p.count, 0);
    const seats = fresh(pos).teams[0].map((c, idx) => ({ c, idx })).filter(({ c }) => c.isAlive());
    const aiMix = new Map([...picks.values()].map(p =>
      [jointKey(p.actions.map((actionIdx, k) => ({ idx: seats[k].idx, actionIdx }))), p.count / total] as const));
    const seconds = (performance.now() - t) / 1000;
    try {
      const g = judge.grade(fresh(pos), { rows: aiMix });
      const r = row('today\'s AI (depth 1), side A');
      r.gaps.push(g.rowGap ?? 0);
      r.seconds.push(seconds / 4);
      r.sims.push(0);
    } catch { /* a pass or an illegal joint: not gradeable here */ }
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
console.log(`BRETXA DE CADA DRECERA contra el referee exacte · ${slices.join(', ')} · ${POSITIONS} posicions per tall`
  + ` · ${skipped} fora de pressupost`);
console.log('   drecera                                    posicions   bretxa mitjana   p90     s mitjans   rondes simulades');
for (const r of rows.values()) {
  console.log(`   ${r.name.padEnd(42)} ${String(r.gaps.length).padStart(5)}   ${mean(r.gaps).toFixed(2).padStart(10)}   ${quantile(r.gaps, 0.9).toFixed(2).padStart(6)}`
    + `   ${mean(r.seconds).toFixed(2).padStart(9)}   ${Math.round(mean(r.sims)).toString().padStart(10)}`);
}
