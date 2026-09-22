/**
 * Sizing experiment behind the discrete fatigue ladder (fatigue.ts): what is
 * one point of flat roll penalty actually worth, when only ONE side carries
 * it, and does it matter which rolls it touches?
 *
 * The 2026-07-17 rejection of roll penalties measured them accruing
 * symmetrically inside a mirror match — where, since damage is the margin,
 * -X on both sides cancels and only the min-0 floor survives, so fights froze.
 * DM-assigned fatigue is one-sided and static, which is a different question.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-fatigue-penalty.ts
 */
import {
  Character, CombatEngine, CombatModifier, ModifierDuration, newCombatStats,
  setAIControlled, withSeed,
} from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { buildSolvedEncounter, solveEncounter } from '@pimpampum/enemies';
import { games, pct, randomTeam, theRegistry, useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

const GAMES = games(800);

/** COMMON RANDOM NUMBERS: every penalty level meets the same teams and dice,
 *  so the ladder it prints is the penalty's doing and not the draw's. */
const SEED = 20260920;

type Scope = 'skill' | 'attack' | 'defense';

/** 'skill' (every roll) is what the real fatigue level does, so it goes
 *  through Character.fatigue; the partial scopes use an ad-hoc modifier. */
function penalize(team: Character[], amount: number, scope: Scope): void {
  if (amount === 0) return;
  for (const c of team) {
    if (scope === 'skill') c.setFatigue(amount);
    else c.addModifier(new CombatModifier(scope, -amount, ModifierDuration.RestOfCombat).withSource('fatiga'));
  }
}

/** Mirror match: team A fatigued, team B fresh. NOTE the penalty is applied
 *  AFTER constructing the engine — the constructor resets every modifier. */
function mirror(amount: number, scope: Scope): void {
  const stats = newCombatStats();
  let a = 0, d = 0;
  withSeed(SEED, () => {
    for (let i = 0; i < GAMES; i++) {
      const A = randomTeam('A', 3, 6);
      const B = randomTeam('B', 3, 6);
      setAIControlled(A); setAIControlled(B);
      const engine = new CombatEngine(A, B, { registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 1 }) });
      penalize(A, amount, scope);
      const w = engine.runCombat(stats).winner;
      if (w === 0) a++; else if (w === null) d++;
    }
  });
  console.log(`  -${amount} on ${scope.padEnd(7)}  A winrate ${pct(a / GAMES, GAMES)}  draws ${(100 * d / GAMES).toFixed(1).padStart(4)}%  rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
}

/** Solved encounter (party fresh = 50%), then the party carries the penalty. */
function encounter(amount: number, scope: Scope, enc: ReturnType<typeof solveEncounter>): void {
  if (!enc) return;
  const stats = newCombatStats();
  let wins = 0, draws = 0;
  withSeed(SEED, () => {
    for (let i = 0; i < GAMES; i++) {
      const party = randomTeam('P', 4, 7);
      const enemies = buildSolvedEncounter(enc);
      setAIControlled(party); setAIControlled(enemies);
      const engine = new CombatEngine(party, enemies, { registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 1 }) });
      // ONCE, and AFTER the constructor: it resets every modifier, so a call
      // before it is silently discarded. There used to be one on either side —
      // dead today, and a double penalty the day the constructor stops doing
      // that. A measurement must not depend on which of two calls survives.
      penalize(party, amount, scope);
      const res = engine.runCombat(stats);
      if (res.winner === 0) wins++; else if (res.winner === null) draws++;
    }
  });
  console.log(`  -${amount} on ${scope.padEnd(7)}  party winrate ${pct(wins / GAMES, GAMES)}  draws ${(100 * draws / GAMES).toFixed(1).padStart(4)}%  rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
}

console.log(`Mirror (3v3, budget 6, ${GAMES} games) — A fatigued, B fresh:`);
for (const scope of ['skill', 'attack', 'defense'] as Scope[]) {
  for (let x = 0; x <= 5; x++) mirror(x, scope);
}

console.log('\nSolved encounter (4 players @7, target 50%) — party fatigued:');
const enc = solveEncounter([{ enemyId: 'goblin', count: 4 }, { enemyId: 'goblin-shaman', count: 1 }], { count: 4, levels: 7, armor: 1 }, 0.5);
for (const scope of ['skill', 'attack', 'defense'] as Scope[]) {
  for (let x = 0; x <= 5; x++) encounter(x, scope, enc);
}
