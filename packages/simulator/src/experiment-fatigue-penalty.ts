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
import { Character, CombatModifier, ModifierDuration, newCombatStats, setAIControlled, CombatEngine } from '@pimpampum/engine';
import { solveEncounter } from '@pimpampum/enemies';
import { REGISTRY, randomTeam, buildSolvedEncounter } from './tests/helpers.js';

const GAMES = 800;

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
  for (let i = 0; i < GAMES; i++) {
    const A = randomTeam('A', 3, 6);
    const B = randomTeam('B', 3, 6);
    setAIControlled(A); setAIControlled(B);
    const engine = new CombatEngine(A, B, { registry: REGISTRY, maxRounds: 40, aiDepth: 1 });
    penalize(A, amount, scope);
    const w = engine.runCombat(stats).winner;
    if (w === 0) a++; else if (w === null) d++;
  }
  const wr = 100 * a / GAMES;
  console.log(`  -${amount} on ${scope.padEnd(7)}  A winrate ${wr.toFixed(1).padStart(5)}%  draws ${(100 * d / GAMES).toFixed(1).padStart(4)}%  rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
}

/** Solved encounter (party fresh = 50%), then the party carries the penalty. */
function encounter(amount: number, scope: Scope, enc: ReturnType<typeof solveEncounter>): void {
  if (!enc) return;
  const stats = newCombatStats();
  let wins = 0, draws = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', 4, 7);
    penalize(party, amount, scope);
    const enemies = buildSolvedEncounter(enc);
    setAIControlled(party); setAIControlled(enemies);
    const engine = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40, aiDepth: 1 });
    penalize(party, amount, scope);
    const res = engine.runCombat(stats);
    if (res.winner === 0) wins++; else if (res.winner === null) draws++;
  }
  console.log(`  -${amount} on ${scope.padEnd(7)}  party winrate ${(100 * wins / GAMES).toFixed(1).padStart(5)}%  draws ${(100 * draws / GAMES).toFixed(1).padStart(4)}%  rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
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
