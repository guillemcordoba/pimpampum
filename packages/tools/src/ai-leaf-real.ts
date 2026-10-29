/**
 * LEAVES GRADED ON REAL CARDS — which way of scoring the board at the
 * horizon does the exact referee agree with, on a set's own kits?
 *
 * The leaves were graded on the audit's imaginary cards (`ai-shortcut-gap.ts`),
 * where random playouts looked best; in real fights they lost to today's AI
 * and today's evaluator did not (NEXT-STEPS §57). So the same grading, on
 * positions built from real kits: one or two heroes of a calibration party
 * against one or two of the set's own creatures, mid-fight PV, the fight cut a
 * few rounds on so the exact referee can solve it. Every candidate is one
 * round deep with exact in-round decisions — only the leaf differs — and is
 * graded by what a perfect opponent gains against its mixes (`Referee.grade`).
 * Today's AI is graded the same way, as the line to beat.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-leaf-real.ts
 *      … --set elements --games 20 --shape 2x1 --rounds 2
 */
import { CombatEngine, random, setAIControlled, withSeed, type Character } from '@pimpampum/engine';
import { bestResponse, DEFAULT_LOOKAHEAD } from '@pimpampum/ai';
import { BudgetExceeded, jointKey, Referee, Unsupported, type RefereeOptions } from '@pimpampum/ai/audit';
import { calibrationParty, companyCount, flag, games, SMOKE, theRegistry, theSet, useSet } from '@pimpampum/bench';
import { chosenSet } from './sets.js';

const chosen = await chosenSet();
useSet(chosen.gameSet);
const POSITIONS = games(12);
const SHAPE = (flag('--shape') ?? '1x1').split('x').map(Number) as [number, number];
const ROUNDS = Number(flag('--rounds') ?? 2);
const BUDGET = Number(flag('--budget') ?? (SMOKE ? 200_000 : 4_000_000));
const only = flag('--only');

const LEAVES: Record<string, Partial<RefereeOptions>> = {
  'PV margin': { leaf: 'margin' },
  'today\'s evaluator': { leaf: 'score' },
  'random playouts ×8': { leaf: 'playout', playouts: 8 },
  'random playouts ×8, 1 round': { leaf: 'playout', playouts: 8, playoutRounds: 1 },
  'random playouts ×8, 2 rounds': { leaf: 'playout', playouts: 8, playoutRounds: 2 },
  'greedy playouts ×4': { leaf: 'playout', playouts: 4, playoutPolicy: 'greedy' },
  'greedy playouts ×4, 2 rounds': { leaf: 'playout', playouts: 4, playoutPolicy: 'greedy', playoutRounds: 2 },
  'greedy ×4, 2 rounds, then evaluator': { leaf: 'playout', playouts: 4, playoutPolicy: 'greedy', playoutRounds: 2, playoutEnd: 'score' },
};

/** A real-kit position: a slice of a calibration party against the set's own
 *  creatures, mid-fight, its round opened. */
function position(seed: number): CombatEngine {
  return withSeed(seed, () => {
    const party = theSet().buildParty(calibrationParty(seed % companyCount()));
    const heroes = [...party].sort(() => random() - 0.5).slice(0, SHAPE[0]);
    const pools = theSet().calibration.shapes.flatMap(s => s.pool);
    const foes: Character[] = [];
    for (let k = 0; k < SHAPE[1]; k++) {
      const g = pools[Math.floor(random() * pools.length)];
      foes.push(...theSet().buildEncounter([{ enemyId: g.enemyId, count: 1, level: g.level, pv: 8 + Math.floor(random() * 9) }]));
    }
    setAIControlled(heroes);
    setAIControlled(foes);
    const e = new CombatEngine(heroes, foes, { registry: theRegistry(), maxRounds: ROUNDS, actionChooser: () => null });
    // Mid-fight: after the engine, which resets everyone for a new combat.
    for (const c of [...heroes, ...foes]) c.currentPV = Math.max(1, Math.round(c.maxPV * (0.4 + 0.6 * random())));
    for (const c of heroes) if (random() < 0.2) c.setFatigue(1);
    e.prepareRound();
    return e;
  });
}

interface Row { gaps: number[]; seconds: number[] }
const rows = new Map<string, Row>();
const row = (k: string): Row => { let r = rows.get(k); if (!r) rows.set(k, r = { gaps: [], seconds: [] }); return r; };
const mixOf = (joints: { idx: number; actionIdx: number }[][], p: number[]) =>
  new Map(joints.map((j, i) => [jointKey(j), p[i]] as const).filter(([, x]) => x > 0));
let skipped = 0;

for (let seed = 1; seed <= POSITIONS; seed++) {
  const e = position(seed);
  const exactOpts: Partial<RefereeOptions> = { strategies: 'oracle', budget: BUDGET };
  const judge = new Referee({ ...exactOpts, budget: Infinity });
  try {
    new Referee(exactOpts).solve(e, 0);
  } catch (err) {
    if (err instanceof BudgetExceeded || err instanceof Unsupported) { skipped++; continue; }
    throw err;
  }
  for (const [name, opts] of Object.entries(LEAVES)) {
    if (only && !name.includes(only)) continue;
    const t = performance.now();
    let root;
    try { root = new Referee({ ...exactOpts, horizon: 1, ...opts }).solve(e, 0); } catch (err) { if (err instanceof BudgetExceeded) continue; throw err; }
    const seconds = (performance.now() - t) / 1000;
    const g = judge.grade(e, { rows: mixOf(root.rows, root.sol.row), cols: mixOf(root.cols, root.sol.col) });
    row(name).gaps.push(((g.rowGap ?? 0) + (g.colGap ?? 0)) / 2);
    row(name).seconds.push(seconds);
  }
  // Today's AI, side A: its joint picks over four seeds, as a mix.
  const picks = new Map<string, number>();
  const seats = e.teams[0].map((c, idx) => ({ c, idx })).filter(({ c }) => c.isAlive() && !e.isSkippingRound(c));
  for (let s = 0; s < 4; s++) {
    const sim = e.clone();
    const choices = withSeed(9_100 + s, () => bestResponse(sim, 0, DEFAULT_LOOKAHEAD).choices);
    const key = jointKey(seats.map(({ idx }) => ({ idx, actionIdx: choices.get(sim.teams[0][idx]) ?? -1 })));
    picks.set(key, (picks.get(key) ?? 0) + 0.25);
  }
  try { row('today\'s AI (side A)').gaps.push(judge.grade(e, { rows: picks }).rowGap ?? 0); } catch { /* a joint the referee does not list */ }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length) : NaN; };
console.log(`FULLES SOBRE CARTES REALS · joc ${chosen.id} · ${SHAPE.join('x')} · tall a ${ROUNDS} rondes · ${POSITIONS} posicions (${skipped} fora de pressupost)`);
console.log('   fulla                                posicions   bretxa (PV)        s per solució');
for (const [name, r] of rows) {
  console.log(`   ${name.padEnd(36)} ${String(r.gaps.length).padStart(5)}   ${mean(r.gaps).toFixed(2).padStart(6)} ±${se(r.gaps).toFixed(2)}   ${r.seconds.length ? mean(r.seconds).toFixed(2).padStart(10) : '         —'}`);
}
