/**
 * HOW NOISY IS A SOLVE — the same settings, two sets of dice, graded in each
 * other's game.
 *
 * Two careful solves of one long-fight round disagreed by ~10 PV (NEXT-STEPS
 * §58): the round's game is estimated from sampled playouts, and in a long
 * fight those vary so much that a few samples cannot pin it down. Noise is
 * not bias — a quiet leaf can be quietly wrong; `ai-shortcut-gap.ts` on the
 * long slices grades bias exactly — but a solve cannot be better than its
 * noise. Rule-native cards only (the real kits are not migrated yet).
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-noise.ts --games 12 --only greedy
 */
import { DEFAULT_EQUILIBRIUM } from '@pimpampum/ai';
import { buildEngine, generatePosition, jointKey, Referee, type GeneratorConfig, type RefereeOptions, type RootSolution } from '@pimpampum/ai/audit';
import { flag, games, SMOKE } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  '2x2-c4': { shape: '2x2', cards: 4, roundsLeft: 6, multiShare: 0.8, toTheEnd: true },
  '3x3-c4': { shape: '3x3', cards: 4, roundsLeft: 7, multiShare: 0.8, toTheEnd: true },
};
const slice = flag('--slice') ?? '2x2-c4';
const POSITIONS = games(12);
const FROM = Number(flag('--from') ?? 1);
const only = flag('--only');

const BASE: Partial<RefereeOptions> = { ...DEFAULT_EQUILIBRIUM, budget: Infinity, ...(SMOKE ? { samples: [1], decisionSamples: [1] } : {}) };
const CONFIGS: Record<string, Partial<RefereeOptions>> = {
  'random playouts ×8, 4 samples (careful)': BASE,
  'random playouts ×8, 16 samples': { ...BASE, samples: [16] },
  'random playouts ×32, 4 samples': { ...BASE, playouts: 32 },
  'random playouts ×8, 2 rounds': { ...BASE, playoutRounds: 2 },
  'greedy playouts ×4': { ...BASE, playoutPolicy: 'greedy', playouts: 4 },
  'greedy playouts ×4, 2 rounds': { ...BASE, playoutPolicy: 'greedy', playouts: 4, playoutRounds: 2 },
  'evaluator leaf': { ...BASE, leaf: 'score' },
  'PV margin leaf': { ...BASE, leaf: 'margin' },
};

const mixOf = (joints: RootSolution['rows'], p: number[]) => new Map(joints.map((j, i) => [jointKey(j), p[i]] as const).filter(([, x]) => x > 0));
const rows = new Map<string, { noise: number[]; seconds: number[] }>();
const row = (k: string) => { let r = rows.get(k); if (!r) rows.set(k, r = { noise: [], seconds: [] }); return r; };

for (let seed = FROM; seed < FROM + POSITIONS; seed++) {
  const pos = generatePosition(seed, { ...SLICES[slice], catalogue: 'composed' });
  const state = () => buildEngine(pos, { actionChooser: () => null });
  for (const [name, opts] of Object.entries(CONFIGS)) {
    if (only && !name.includes(only)) continue;
    const t = performance.now();
    const a = new Referee({ ...opts, seed: 1 }), b = new Referee({ ...opts, seed: 2 });
    const ra = a.solve(state(), 0), rb = b.solve(state(), 0);
    const seconds = (performance.now() - t) / 2000;
    if (SMOKE) { row(name).seconds.push(seconds); continue; }
    // Each solve's mixes graded in the other's game, both ways.
    const gb = a.grade(state(), { rows: mixOf(rb.rows, rb.sol.row), cols: mixOf(rb.cols, rb.sol.col) });
    const ga = b.grade(state(), { rows: mixOf(ra.rows, ra.sol.row), cols: mixOf(ra.cols, ra.sol.col) });
    row(name).noise.push(((gb.rowGap ?? 0) + (gb.colGap ?? 0) + (ga.rowGap ?? 0) + (ga.colGap ?? 0)) / 4);
    row(name).seconds.push(seconds);
  }
  if (process.argv.includes('--per-position')) {
    console.log(JSON.stringify({ slice, seed, ...Object.fromEntries([...rows].map(([k, r]) => [k, { noise: r.noise.at(-1), seconds: r.seconds.at(-1) }])) }));
  }
}

const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((x, y) => x + (y - m) ** 2, 0) / (xs.length - 1) / xs.length) : NaN; };
console.log(`NOISE OF A SOLVE · ${slice} · ${POSITIONS} positions · two seeds graded in each other's game`);
for (const [name, r] of rows) {
  console.log(`   ${name.padEnd(40)} ${r.noise.length ? `${mean(r.noise).toFixed(2)} ±${se(r.noise).toFixed(2)}` : 'n/a'} PV   ${mean(r.seconds).toFixed(1)} s per solve`);
}
