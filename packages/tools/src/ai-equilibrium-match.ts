/**
 * THE EQUILIBRIUM PROTOTYPE AGAINST TODAY'S AI — on the audit's small
 * positions, where the prototype can afford to solve every round.
 *
 * Duplicate pairs (audit `match.ts`'s idea): each position is played twice on
 * the same seed with the two AIs swapped between the sides, so the dice and
 * the position's own lean cancel, and the PV margin left is who played
 * better. The positions are cut at their rounds left, so the margin — not
 * the win — is the score. A standing question while the prototype grows into
 * the live player (AI-EQUILIBRIUM-PLAN.md), so a harness.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-equilibrium-match.ts
 *      … --games 30 --slice 2x1-c3-r3 --catalogue composed
 */
import { withSeed, type CombatEngine } from '@pimpampum/engine';
import { aiPolicy, equilibriumPolicy, FAST_EQUILIBRIUM, MEDIUM_EQUILIBRIUM, type Policy } from '@pimpampum/ai';
import { buildEngine, generatePosition, pvDiff, twoHeaded, type GeneratorConfig, type Position } from '@pimpampum/ai/audit';
import { flag, games } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  '1x1-c4-r4': { shape: '1x1', cards: 4, roundsLeft: 4, multiShare: 0.8 },
  '2x1-c3-r3': { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '1x2-c3-r3': { shape: '1x2', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '2x2-c3-r2': { shape: '2x2', cards: 3, roundsLeft: 2, multiShare: 0.8 },
  // Real size, played to the real end: a party of four against four, five
  // cards a hand, health paced for about eight rounds.
  '2x2-c4-end': { shape: '2x2', cards: 4, roundsLeft: 6, multiShare: 0.8, toTheEnd: true },
  '3x3-c4-end': { shape: '3x3', cards: 4, roundsLeft: 7, multiShare: 0.8, toTheEnd: true },
  '4x4-c5-end': { shape: '4x4', cards: 5, roundsLeft: 8, multiShare: 0.8, toTheEnd: true },
};
const POSITIONS = games(20);
const FROM = Number(flag('--from') ?? 1);
const PER_POSITION = process.argv.includes('--per-position');
const CATALOGUE = (flag('--catalogue') ?? 'composed') as GeneratorConfig['catalogue'];
// The long fights to the end cost minutes a position: asked for by name only.
const slices = flag('--slice') ? [flag('--slice')!] : Object.keys(SLICES).filter(k => !k.endsWith('-end'));
/** The prototype's own knobs, to compare its configurations. */
const CONFIG = {
  ...(process.argv.includes('--fast') ? FAST_EQUILIBRIUM : {}),
  ...(process.argv.includes('--medium') ? MEDIUM_EQUILIBRIUM : {}),
  ...(flag('--samples') ? { samples: [Number(flag('--samples'))] } : {}),
  ...(flag('--playouts') ? { playouts: Number(flag('--playouts')) } : {}),
  ...(flag('--decisions') ? { decisions: flag('--decisions') as 'exact' | 'greedy' } : {}),
  ...(flag('--policy') ? { playoutPolicy: flag('--policy') as 'random' | 'greedy' } : {}),
  ...(flag('--playout-rounds') ? { playoutRounds: Number(flag('--playout-rounds')) } : {}),
  ...(flag('--playout-end') ? { playoutEnd: flag('--playout-end') as 'margin' | 'score' } : {}),
  ...(flag('--leaf') ? { leaf: flag('--leaf') as 'margin' | 'score' | 'playout' } : {}),
  ...(flag('--playout-targets') ? { playoutTargets: flag('--playout-targets') as 'random' | 'informed' } : {}),
};

function play(pos: Position, team0: Policy, team1: Policy, seed: number): number {
  return withSeed(seed, () => {
    const e: CombatEngine = buildEngine(pos, twoHeaded(team0, team1), { ai: true });
    e.runCombat();
    return pvDiff(e);
  });
}

console.log(`EQUILIBRI (prototip ${JSON.stringify(CONFIG)}) contra l'AI d'avui · cartes ${CATALOGUE} · ${POSITIONS} posicions per tall, parelles duplicades`);
for (const slice of slices) {
  const scores: number[] = [];
  let solved = 0, fallback = 0;
  const started = performance.now();
  for (let seed = FROM; seed < FROM + POSITIONS; seed++) {
    const pos = generatePosition(seed, { ...SLICES[slice], catalogue: CATALOGUE });
    const eqA = equilibriumPolicy(CONFIG);
    const asA = play(pos, eqA, aiPolicy({ depth: 1 }), 50_000 + seed);
    const eqB = equilibriumPolicy(CONFIG);
    const asB = -play(pos, aiPolicy({ depth: 1 }), eqB, 50_000 + seed);
    scores.push((asA + asB) / 2);
    if (PER_POSITION) console.log(JSON.stringify({ slice, catalogue: CATALOGUE, seed, score: (asA + asB) / 2 }));
    solved += eqA.stats.solved + eqB.stats.solved;
    fallback += eqA.stats.fallback + eqB.stats.fallback;
  }
  const n = scores.length;
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const se = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1) / n);
  const better = scores.filter(x => x > 0.5).length, worse = scores.filter(x => x < -0.5).length;
  console.log(`   ${slice.padEnd(10)} marge a favor de l'equilibri ${mean.toFixed(2)} ±${se.toFixed(2)} PV · millor ${better}, pitjor ${worse}, igual ${n - better - worse}`
    + ` · rondes resoltes ${solved}, a l'AI d'avui ${fallback} · ${((performance.now() - started) / 1000 / n).toFixed(1)} s per posició`);
}
