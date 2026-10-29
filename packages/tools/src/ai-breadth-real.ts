/**
 * SEARCH BREADTH AT REAL SIZE — what the fast settings' search shortcuts
 * cost on real rounds, where the exact referee cannot reach.
 *
 * Real rounds are snapshotted from mirrored calibration fights (today's AI
 * on both sides, rounds 1–3), each solved by a STRONG reference (no pool cap,
 * a fine stop, many samples) and by variants of the fast settings that relax
 * one knob at a time. Every solve shares the reference's leaf and decisions,
 * so only the search's breadth differs. Each variant's mixes are graded in
 * the reference's game (`Referee.grade`: what a best reply to them gains), and
 * the share of Defense in them is reported — the equilibrium player defended
 * far less than today's AI in real fights (NEXT-STEPS §57).
 *
 * The reference is not the truth, only the best solve affordable at this
 * size: a variant can only be judged as far from it, never as right.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-breadth-real.ts --games 3
 */
import { ActionType, CombatEngine, setAIControlled, withSeed } from '@pimpampum/engine';
import { aiPolicy, FAST_EQUILIBRIUM } from '@pimpampum/ai';
import { jointKey, Referee, type RefereeOptions, type RootSolution } from '@pimpampum/ai/audit';
import { calibrationParty, games, SMOKE, theRegistry, theSet, useSet } from '@pimpampum/bench';
import { chosenSet } from './sets.js';

const chosen = await chosenSet();
useSet(chosen.gameSet);
const FIGHTS = games(3);
const ROUNDS = SMOKE ? 1 : 3;

const LEAF: Partial<RefereeOptions> = { leaf: 'playout', playouts: 4, playoutPolicy: 'greedy', playoutRounds: 2, decisions: 'greedy', decisionLeaf: 'margin' };
const REFERENCE: Partial<RefereeOptions> = { strategies: 'oracle', horizon: 1, ...LEAF, bestResponse: 'seat', epsilon: 0.5, samples: [SMOKE ? 2 : 8], decisionSamples: [SMOKE ? 1 : 4], budget: Infinity };
const FAST: Partial<RefereeOptions> = { ...FAST_EQUILIBRIUM, ...LEAF };
const VARIANTS: Record<string, Partial<RefereeOptions>> = {
  'fast': FAST,
  'fast, ε 0.5': { ...FAST, epsilon: 0.5 },
  'fast, pool 8': { ...FAST, pool: 8 },
  'fast, 4 samples': { ...FAST, samples: [4], decisionSamples: [4] },
};

/** Rounds 1..ROUNDS of a mirrored fight with today's AI on both sides, each
 *  snapshotted with its round opened. */
function snapshots(seed: number): CombatEngine[] {
  return withSeed(seed, () => {
    const today = aiPolicy({ depth: 1 });
    const a = theSet().buildParty(calibrationParty(seed % 2));
    const b = theSet().buildParty(calibrationParty(seed % 2));
    setAIControlled(a);
    setAIControlled(b);
    const e = new CombatEngine(a, b, { registry: theRegistry(), maxRounds: 40, ...today });
    const out: CombatEngine[] = [];
    for (let r = 0; r < ROUNDS && !e.isOver(); r++) {
      e.prepareRound();
      out.push(e.clone());
      e.planActions();
      let step = e.resolveNextAction();
      for (let guard = 0; step.kind !== 'done' && guard < 400; guard++) step = e.resolveNextAction();
      e.finishRound();
    }
    return out;
  });
}

const defenseShare = (e: CombatEngine, root: RootSolution, team: number): number => {
  const joints = team === 0 ? root.rows : root.cols, mix = team === 0 ? root.sol.row : root.sol.col;
  return joints.reduce((acc, j, i) => acc + mix[i] * j.filter(o => o.actionIdx >= 0
    && e.teams[team][o.idx].actions[o.actionIdx].def.actionType === ActionType.Defensa).length / Math.max(1, j.length), 0);
};
const mixOf = (joints: RootSolution['rows'], p: number[]) => new Map(joints.map((j, i) => [jointKey(j), p[i]] as const).filter(([, x]) => x > 0));

const rows = new Map<string, { gaps: number[]; defense: number[]; seconds: number[] }>();
const row = (k: string) => { let r = rows.get(k); if (!r) rows.set(k, r = { gaps: [], defense: [], seconds: [] }); return r; };

for (let f = 1; f <= FIGHTS; f++) {
  for (const state of snapshots(41_000 + f)) {
    const judge = new Referee({ ...REFERENCE, seed: 1 });
    let t = performance.now();
    const ref = judge.solve(state, 0);
    row('reference').seconds.push((performance.now() - t) / 1000);
    row('reference').defense.push((defenseShare(state, ref, 0) + defenseShare(state, ref, 1)) / 2);
    row('reference').gaps.push(0);
    for (const [name, opts] of Object.entries(VARIANTS)) {
      t = performance.now();
      const root = new Referee({ ...opts, seed: 2 }).solve(state, 0);
      const seconds = (performance.now() - t) / 1000;
      // Grading is an exact best reply over every joint of the other side —
      // most of the cost; the smoke run (GAMES=2) only checks the harness runs.
      if (!SMOKE) {
        const g = judge.grade(state, { rows: mixOf(root.rows, root.sol.row), cols: mixOf(root.cols, root.sol.col) });
        row(name).gaps.push(((g.rowGap ?? 0) + (g.colGap ?? 0)) / 2);
      }
      row(name).defense.push((defenseShare(state, root, 0) + defenseShare(state, root, 1)) / 2);
      row(name).seconds.push(seconds);
    }
    console.log(`  posició ${rows.get('reference')!.gaps.length} feta`);
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length) : NaN; };
console.log(`AMPLADA DE CERCA A MIDA REAL · joc ${chosen.id} · ${rows.get('reference')?.gaps.length ?? 0} rondes reals`);
console.log('   cerca                 bretxa vs referència     quota de Defensa    s per solució');
for (const [name, r] of rows) {
  console.log(`   ${name.padEnd(20)} ${`${mean(r.gaps).toFixed(2)} ±${se(r.gaps).toFixed(2)}`.padStart(18)}   ${mean(r.defense).toFixed(2).padStart(14)}   ${mean(r.seconds).toFixed(1).padStart(12)}`);
}
