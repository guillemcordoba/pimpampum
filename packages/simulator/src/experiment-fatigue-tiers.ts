/**
 * The table behind the fatigue ladder (fatigue.ts): (a) what one fatigue
 * level costs a party at each difficulty tier, (b) whether a SYMMETRIC
 * penalty reproduces the 2026-07-17 freeze (the reason roll penalties were
 * once rejected) — it does, which is why enemies never carry fatigue.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-fatigue-tiers.ts
 */
import {
  Character, CombatEngine, newCombatStats, setAIControlled, withSeed,
} from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { buildSolvedEncounter, solveEncounter, TARGET_WINRATES } from '@pimpampum/enemies';
import { exact, games, pct, pctCoarse, randomTeam, SMOKE, theRegistry, useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

const GAMES = games(500);

/** COMMON RANDOM NUMBERS: each column of the ladder meets the same teams and
 *  dice, so the step from -2 to -3 is the penalty's and not the draw's. */
const SEED = 20260920;

function penalize(team: Character[], level: number): void {
  for (const c of team) c.setFatigue(level);
}

console.log('Party winrate by difficulty tier × fatigue penalty (all rolls), 4 players @7:\n');
console.log('tier        asked      -0       -1       -2       -3       -4       -5');
for (const [name, target] of (SMOKE ? Object.entries(TARGET_WINRATES).slice(0, 1) : Object.entries(TARGET_WINRATES))) {
  const enc = solveEncounter([{ enemyId: 'goblin', count: 4 }, { enemyId: 'goblin-shaman', count: 1 }], { count: 4, levels: 7, armor: 1 }, target);
  if (!enc) { console.log(`${name}: unsolved`); continue; }
  const cells: string[] = [];
  for (let x = 0; x <= 5; x++) {
    let wins = 0;
    const stats = newCombatStats();
    withSeed(SEED, () => {
      for (let i = 0; i < GAMES; i++) {
        const party = randomTeam('P', 4, 7);
        const enemies = buildSolvedEncounter(enc);
        setAIControlled(party); setAIControlled(enemies);
        const engine = new CombatEngine(party, enemies, { registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 1 }) });
        penalize(party, x);
        if (engine.runCombat(stats).winner === 0) wins++;
      }
    });
    cells.push(pctCoarse(wins / GAMES, GAMES).padStart(7));
  }
  console.log(`${name.padEnd(10)} ${exact(target).padStart(4)}   ${cells.join('  ')}`);
}

console.log('\nSYMMETRIC penalty (both mirror teams fatigued) — the freeze check, 3v3 @6:');
console.log('pen   draws   rounds   avg PV left on the winning team');
for (let x = 0; x <= 5; x++) {
  const stats = newCombatStats();
  let draws = 0, pvLeft = 0, decided = 0;
  withSeed(SEED, () => {
    for (let i = 0; i < GAMES; i++) {
      const A = randomTeam('A', 3, 6), B = randomTeam('B', 3, 6);
      setAIControlled(A); setAIControlled(B);
      const engine = new CombatEngine(A, B, { registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 1 }) });
      penalize(A, x); penalize(B, x);
      const w = engine.runCombat(stats).winner;
      if (w === null) draws++;
      else { decided++; pvLeft += (w === 0 ? A : B).reduce((s, c) => s + Math.max(0, c.currentPV), 0); }
    }
  });
  console.log(`-${x}   ${pct(draws / GAMES, GAMES)}  ${(stats.rounds / stats.combats).toFixed(1).padStart(5)}   ${decided ? (pvLeft / decided).toFixed(1) : '-'}`);
}
