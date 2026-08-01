/**
 * Train the value model by self-play, then report what it learned and how
 * strong the resulting search AI is.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/train-ai.ts
 */
import { AIStrategy, CombatEngine, assignStrategies, withSeed } from '@pimpampum/engine';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';
import { seedModel } from './ai/value.js';
import { trainIteration } from './ai/selfplay.js';
import { searchChooser, attackOnlyChooser, randomChooser } from './ai/search.js';

declare const process: { env: Record<string, string | undefined>; argv: string[] };
// tsx runs this as an ES module; pull fs in without needing @types/node.
const { writeFileSync } = await import('node:fs') as { writeFileSync(p: string, d: string): void };

const ITERATIONS = Number(process.env.ITERATIONS ?? 6);
const GAMES = Number(process.env.GAMES ?? 40);
const OUT = 'src/ai/weights.json';

/** The training matchup: a standard party against a goblin horde. */
function matchup() {
  return {
    players: buildReferenceParty({ count: 4, levels: 6, armor: 1 }),
    enemies: Array.from({ length: 6 }, (_, k) =>
      createEnemy('goblin', { level: 4, name: `Goblin ${k + 1}`, pv: 17 })!),
  };
}

const model = seedModel();

console.log(`Self-play training: ${ITERATIONS} iterations × ${GAMES} games\n`);
console.log('iter   loss    samples   winrate  rounds   time');
for (let i = 0; i < ITERATIONS; i++) {
  const t0 = Date.now();
  const r = withSeed(1000 + i, () => trainIteration({
    registry: REGISTRY,
    model,
    games: GAMES,
    samples: 4,
    passes: 1,
    matchup,
    epsilon: 0.2,
    epochs: 25,
  }));
  console.log(
    `${String(i + 1).padStart(3)}  ${r.loss.toFixed(4)}  ${String(r.samples).padStart(7)}   `
    + `${(r.winrate * 100).toFixed(0).padStart(5)}%  ${r.avgRounds.toFixed(1).padStart(5)}   ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

console.log('\nLearned value weights (by influence):');
console.log(model.describe());

writeFileSync(OUT, JSON.stringify(model.toJSON()));
console.log(`\nweights → ${OUT}`);

// --- How strong is it? Search vs the baselines, players' side only ---------
function play(chooser: ReturnType<typeof searchChooser> | null, games: number, seed: number): number {
  return withSeed(seed, () => {
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const { players, enemies } = matchup();
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40,
        actionChooser: chooser ?? undefined,
      });
      const w = engine.runCombat().winner;
      if (w === 0) wins++; else if (w === null) wins += 0.5;
    }
    return wins / games;
  });
}

const GG = 60;
const search = searchChooser({ registry: REGISTRY, model, samples: 6, passes: 2, depth: 1 }, [0]);
console.log('\nStrength check (players only use the policy; goblins use the built-in AI):\n');
console.log(`  built-in heuristic   ${(play(null, GG, 77) * 100).toFixed(0)}%`);
console.log(`  random legal play    ${(play(randomChooser([0]), GG, 77) * 100).toFixed(0)}%`);
console.log(`  attack-only          ${(play(attackOnlyChooser([0]), GG, 77) * 100).toFixed(0)}%`);
const t0 = Date.now();
console.log(`  SEARCH (learned)     ${(play(search, GG, 77) * 100).toFixed(0)}%   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
