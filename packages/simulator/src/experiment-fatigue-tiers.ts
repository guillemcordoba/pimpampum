/**
 * The table behind the fatigue ladder (fatigue.ts): (a) what one fatigue
 * level costs a party at each difficulty tier, (b) whether a SYMMETRIC
 * penalty reproduces the 2026-07-17 freeze (the reason roll penalties were
 * once rejected) — it does, which is why enemies never carry fatigue.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-fatigue-tiers.ts
 */
import { Character, CombatEngine, newCombatStats, setAIControlled } from '@pimpampum/engine';
import { solveEncounter, TARGET_WINRATES } from '@pimpampum/enemies';
import { REGISTRY, randomTeam, buildSolvedEncounter } from './tests/helpers.js';

const GAMES = 500;

function penalize(team: Character[], level: number): void {
  for (const c of team) c.setFatigue(level);
}

console.log('Party winrate by difficulty tier × fatigue penalty (all rolls), 4 players @7:\n');
console.log('tier        asked    -0     -1     -2     -3     -4     -5');
for (const [name, target] of Object.entries(TARGET_WINRATES)) {
  const enc = solveEncounter([{ enemyId: 'goblin', count: 4 }, { enemyId: 'goblin-shaman', count: 1 }], { count: 4, levels: 7, armor: 1 }, target);
  if (!enc) { console.log(`${name}: unsolved`); continue; }
  const cells: string[] = [];
  for (let x = 0; x <= 5; x++) {
    let wins = 0;
    const stats = newCombatStats();
    for (let i = 0; i < GAMES; i++) {
      const party = randomTeam('P', 4, 7);
      const enemies = buildSolvedEncounter(enc);
      setAIControlled(party); setAIControlled(enemies);
      const engine = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40, aiDepth: 1 });
      penalize(party, x);
      if (engine.runCombat(stats).winner === 0) wins++;
    }
    cells.push(`${(100 * wins / GAMES).toFixed(0).padStart(3)}%`);
  }
  console.log(`${name.padEnd(10)} ${(100 * target).toFixed(0)}%   ${cells.join('  ')}`);
}

console.log('\nSYMMETRIC penalty (both mirror teams fatigued) — the freeze check, 3v3 @6:');
console.log('pen   draws   rounds   avg PV left on the winning team');
for (let x = 0; x <= 5; x++) {
  const stats = newCombatStats();
  let draws = 0, pvLeft = 0, decided = 0;
  for (let i = 0; i < GAMES; i++) {
    const A = randomTeam('A', 3, 6), B = randomTeam('B', 3, 6);
    setAIControlled(A); setAIControlled(B);
    const engine = new CombatEngine(A, B, { registry: REGISTRY, maxRounds: 40, aiDepth: 1 });
    penalize(A, x); penalize(B, x);
    const w = engine.runCombat(stats).winner;
    if (w === null) draws++;
    else { decided++; pvLeft += (w === 0 ? A : B).reduce((s, c) => s + Math.max(0, c.currentPV), 0); }
  }
  console.log(`-${x}   ${(100 * draws / GAMES).toFixed(1).padStart(5)}%  ${(stats.rounds / stats.combats).toFixed(1).padStart(5)}   ${decided ? (pvLeft / decided).toFixed(1) : '-'}`);
}
