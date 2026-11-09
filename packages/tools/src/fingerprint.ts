// bench-exempt(sample): the batch IS the fingerprint — a different number of fights is a different hash, so GAMES cannot turn it down (`--fights` does, for tests only).
/**
 * THE BEHAVIOUR FINGERPRINT — one short hash of a fixed batch of seeded fights
 * in every set: hero mirrors at depth 1 and depth 0, and parties against every
 * creature, each played by the real AI. Everything the log records (every
 * roll, card, hit, death) and every fighter's end state go into the hash.
 *
 * A pure refactor leaves it unchanged; any change to what the game does moves
 * it, even one random draw taken in a different order. The simplify night run
 * (`scripts/night/simplify.md`) refuses to open a pull request that moves it.
 *
 *   pnpm fingerprint                     # rebuilds, then prints the hash
 *   ... fingerprint.ts --per-fight       # one digest per fight, to diff two runs
 *   ... fingerprint.ts --twice           # fails unless two runs agree
 */
import { createHash } from 'node:crypto';
import { CombatEngine, setAIControlled, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { flag, randomTeam, theRegistry, useSet } from '@pimpampum/bench';

const SETS = [
  { id: 'fantasy', root: '@pimpampum/set-fantasy', bench: '@pimpampum/set-fantasy/bench', export: 'FANTASY' },
  { id: 'elements', root: '@pimpampum/set-elements', bench: '@pimpampum/set-elements/bench', export: 'ELEMENTS' },
] as const;
const FIGHTS_PER_SET = Number(flag('--fights') ?? 150);
const BUDGETS = [3, 6, 10];
const MAX_ROUNDS = 12;

type Root = typeof import('@pimpampum/set-fantasy');

const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function play(a: Character[], b: Character[], depth: number): string {
  setAIControlled(a);
  setAIControlled(b);
  const engine = new CombatEngine(a, b, { registry: theRegistry(), maxRounds: MAX_ROUNDS, ...aiPolicy({ depth }) });
  const result = engine.runCombat();
  // Not everything a fight changes is logged (a skill learned from a close loss
  // is not), so each fighter's end state goes in too.
  const ends = [...a, ...b].map(c => ({
    name: c.name, pv: c.currentPV, fatigue: c.fatigue, skills: [...c.skills],
    statuses: [...c.statuses].map(([key, s]) => [key, s.value, s.remaining]),
  }));
  return JSON.stringify({ winner: result.winner, log: engine.logEntries, ends });
}

function fight(root: Root, seed: number): string {
  return withSeed(seed, () => {
    const budget = BUDGETS[seed % BUDGETS.length];
    const size = 1 + (seed % 3);
    switch (seed % 3) {
      case 0: return play(randomTeam('A', size, budget), randomTeam('B', size, budget), 1);
      case 1: return play(randomTeam('A', size, budget), randomTeam('B', size, budget), 0);
      default: {
        const creature = root.ENEMY_DEFINITIONS[seed % root.ENEMY_DEFINITIONS.length];
        const bodies = Array.from({ length: size }, (_, i) =>
          root.createEnemy(creature.id, { pv: 8 + 4 * size + (seed % 7), level: budget, name: `${creature.id} ${i + 1}` })!);
        return play(randomTeam('A', size, budget), bodies, 1);
      }
    }
  });
}

async function run(): Promise<{ hash: string; perSet: string[]; perFight: string[] }> {
  const perSet: string[] = [];
  const perFight: string[] = [];
  for (const spec of SETS) {
    const root = await import(spec.root) as Root;
    const bench = await import(spec.bench) as Record<string, Parameters<typeof useSet>[0]>;
    useSet(bench[spec.export]);
    const digests: string[] = [];
    for (let seed = 1; seed <= FIGHTS_PER_SET; seed++) {
      const d = digest(fight(root, seed));
      digests.push(d);
      perFight.push(`${spec.id} ${seed} ${d}`);
    }
    perSet.push(`${spec.id} ${digest(digests.join())}`);
  }
  return { hash: digest(perSet.join()), perSet, perFight };
}

const started = Date.now();
const first = await run();
if (process.argv.includes('--per-fight')) console.log(first.perFight.join('\n'));
console.log(first.perSet.join('\n'));
if (process.argv.includes('--twice')) {
  const second = await run();
  if (second.hash !== first.hash) {
    const diverged = first.perFight.find((line, i) => line !== second.perFight[i]);
    console.error(`NOT DETERMINISTIC: ${first.hash} then ${second.hash}; first divergence: ${diverged}`);
    process.exit(1);
  }
}
console.log(`fingerprint ${first.hash}  (${FIGHTS_PER_SET * SETS.length} fights, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
