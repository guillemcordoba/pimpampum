/**
 * WHAT EACH FAST SHORTCUT COSTS PER ROUND — on positions too big or too long
 * for the exact referee, judged against a CAREFUL solve instead.
 *
 * In long fights the fast settings lost to today's AI while the careful ones
 * (`DEFAULT_EQUILIBRIUM`: every joint, a fine stop, more samples, decisions on
 * the full leaf) beat it — a round's sloppiness compounds over eight rounds
 * (NEXT-STEPS §57). So, on the audit's imaginary cards (rule-native; the real
 * kits are not migrated yet), each position is solved carefully as the
 * reference and by variants that each switch on ONE fast shortcut, and every
 * variant's mixes are graded in the reference's game (`Referee.grade`). The
 * reference is the best affordable solve, not the truth.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-breadth.ts --slice 2x2-c4 --games 12
 */
import { ActionType, type CombatEngine } from '@pimpampum/engine';
import { DEFAULT_EQUILIBRIUM, FAST_EQUILIBRIUM } from '@pimpampum/ai';
import { buildEngine, generatePosition, jointKey, Referee, type GeneratorConfig, type RefereeOptions, type RootSolution } from '@pimpampum/ai/audit';
import { flag, games, SMOKE } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  '2x2-c4': { shape: '2x2', cards: 4, roundsLeft: 6, multiShare: 0.8, toTheEnd: true },
  '3x3-c4': { shape: '3x3', cards: 4, roundsLeft: 7, multiShare: 0.8, toTheEnd: true },
  '4x4-c5': { shape: '4x4', cards: 5, roundsLeft: 8, multiShare: 0.8, toTheEnd: true },
};
const slice = flag('--slice') ?? '2x2-c4';
const CATALOGUE = (flag('--catalogue') ?? 'composed') as GeneratorConfig['catalogue'];
const POSITIONS = games(12);
const FROM = Number(flag('--from') ?? 1);
const PER_POSITION = process.argv.includes('--per-position');

const REFERENCE: Partial<RefereeOptions> = { ...DEFAULT_EQUILIBRIUM, budget: Infinity, ...(SMOKE ? { samples: [1], decisionSamples: [1] } : {}) };
const VARIANTS: Record<string, Partial<RefereeOptions>> = {
  // THE NOISE FLOOR: the reference's own settings on other dice. A shortcut
  // only costs what it adds above this.
  'careful, another seed': REFERENCE,
  'fast (all shortcuts)': FAST_EQUILIBRIUM,
  'careful + decisions on the round margin': { ...REFERENCE, decisionLeaf: 'margin' },
  'careful + pool 4': { ...REFERENCE, pool: 4 },
  'careful + ε 2': { ...REFERENCE, epsilon: 2 },
  'careful + 2 samples': { ...REFERENCE, samples: [2], decisionSamples: [2] },
  'careful + per-seat best response': { ...REFERENCE, bestResponse: 'seat' },
  'careful + 4 playouts': { ...REFERENCE, playouts: 4 },
};

const mixOf = (joints: RootSolution['rows'], p: number[]) => new Map(joints.map((j, i) => [jointKey(j), p[i]] as const).filter(([, x]) => x > 0));
const defenseShare = (e: CombatEngine, root: RootSolution): number => {
  const share = (joints: RootSolution['rows'], mix: number[], team: number) => joints.reduce((acc, j, i) => acc + mix[i]
    * j.filter(o => o.actionIdx >= 0 && e.teams[team][o.idx].actions[o.actionIdx].def.actionType === ActionType.Defensa).length / Math.max(1, j.length), 0);
  return (share(root.rows, root.sol.row, 0) + share(root.cols, root.sol.col, 1)) / 2;
};

const rows = new Map<string, { gaps: number[]; defense: number[]; seconds: number[] }>();
const row = (k: string) => { let r = rows.get(k); if (!r) rows.set(k, r = { gaps: [], defense: [], seconds: [] }); return r; };

for (let seed = FROM; seed < FROM + POSITIONS; seed++) {
  const pos = generatePosition(seed, { ...SLICES[slice], catalogue: CATALOGUE });
  const state = (): CombatEngine => buildEngine(pos, { actionChooser: () => null });
  const judge = new Referee({ ...REFERENCE, seed: 1 });
  let t = performance.now();
  const ref = judge.solve(state(), 0);
  row('careful (reference)').seconds.push((performance.now() - t) / 1000);
  row('careful (reference)').defense.push(defenseShare(state(), ref));
  row('careful (reference)').gaps.push(0);
  for (const [name, opts] of Object.entries(VARIANTS)) {
    t = performance.now();
    const root = new Referee({ ...opts, seed: 2 }).solve(state(), 0);
    row(name).seconds.push((performance.now() - t) / 1000);
    row(name).defense.push(defenseShare(state(), root));
    // An exact best reply over every joint of the other side — most of the
    // cost; the smoke run (GAMES=2) only checks the harness runs.
    if (!SMOKE) {
      const g = judge.grade(state(), { rows: mixOf(root.rows, root.sol.row), cols: mixOf(root.cols, root.sol.col) });
      row(name).gaps.push(((g.rowGap ?? 0) + (g.colGap ?? 0)) / 2);
    }
  }
  if (PER_POSITION) console.log(JSON.stringify({ slice, seed, ...Object.fromEntries([...rows].map(([k, r]) => [k, { gap: r.gaps.at(-1), defense: r.defense.at(-1), seconds: r.seconds.at(-1) }])) }));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length) : NaN; };
console.log(`COST OF EACH FAST SHORTCUT per round · cards ${CATALOGUE} · ${slice} · ${POSITIONS} positions, graded in the careful solve's game`);
console.log('   search                                      gap vs careful (PV)   defense share   s per solve');
for (const [name, r] of rows) {
  const gap = r.gaps.length ? `${mean(r.gaps).toFixed(2)} ±${se(r.gaps).toFixed(2)}` : 'n/a';
  console.log(`   ${name.padEnd(42)} ${gap.padStart(16)}   ${mean(r.defense).toFixed(2).padStart(12)}   ${mean(r.seconds).toFixed(1).padStart(10)}`);
}
