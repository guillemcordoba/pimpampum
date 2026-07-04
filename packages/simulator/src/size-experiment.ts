/**
 * Validation run for the LIVE size implementation (SIZE_TABLE in the engine):
 * uniform-size team duels + mixed-size per-size win correlation.
 *
 * Run with: pnpm --filter @pimpampum/simulator exec tsx src/size-experiment.ts
 */
import { newCombatStats, ALL_SIZES, CharacterSize, SIZE_TABLE } from '@pimpampum/engine';
import { randomPlayer, runMatch } from './tests/helpers.js';

const TEAM_SIZE = 3;
const BUDGET = 40;
const DUEL_GAMES = 1000;
const MIXED_GAMES = 2000;

function uniformTeam(prefix: string, size: CharacterSize) {
  return Array.from({ length: TEAM_SIZE }, (_, i) => randomPlayer(`${prefix}${i + 1}`, BUDGET, true, size));
}

function pct(n: number, of: number): string {
  return (100 * n / of).toFixed(1) + '%';
}

function duel(sizeA: CharacterSize, sizeB: CharacterSize): void {
  const stats = newCombatStats();
  let aWins = 0, bWins = 0, draws = 0;
  for (let i = 0; i < DUEL_GAMES; i++) {
    const winner = runMatch(uniformTeam('A', sizeA), uniformTeam('B', sizeB), stats);
    if (winner === 0) aWins++; else if (winner === 1) bWins++; else draws++;
  }
  console.log(
    `   ${sizeA.padEnd(6)} vs ${sizeB.padEnd(6)}  ` +
    `${pct(aWins, DUEL_GAMES).padStart(6)} / ${pct(bWins, DUEL_GAMES).padStart(6)}  ` +
    `draws ${pct(draws, DUEL_GAMES).padStart(6)}  avg rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
}

function mixed(): void {
  const bySize = new Map<CharacterSize, { games: number; wins: number }>(
    ALL_SIZES.map(s => [s, { games: 0, wins: 0 }]));
  const stats = newCombatStats();
  let draws = 0;

  for (let i = 0; i < MIXED_GAMES; i++) {
    const make = (prefix: string) => {
      const sizes: CharacterSize[] = [];
      const team = Array.from({ length: TEAM_SIZE }, (_, j) => {
        const s = ALL_SIZES[Math.floor(Math.random() * ALL_SIZES.length)];
        sizes.push(s);
        return randomPlayer(`${prefix}${j + 1}`, BUDGET, true, s);
      });
      return { team, sizes };
    };
    const a = make('A'), b = make('B');
    const winner = runMatch(a.team, b.team, stats);
    if (winner === null) { draws++; continue; }
    for (const s of a.sizes) { const e = bySize.get(s)!; e.games++; if (winner === 0) e.wins++; }
    for (const s of b.sizes) { const e = bySize.get(s)!; e.games++; if (winner === 1) e.wins++; }
  }

  console.log(`   mixed teams (${MIXED_GAMES} games, draws ${pct(draws, MIXED_GAMES)}, avg rounds ${(stats.rounds / stats.combats).toFixed(1)}) — per-size win correlation:`);
  for (const s of ALL_SIZES) {
    const e = bySize.get(s)!;
    console.log(`     ${s.padEnd(6)} ${pct(e.wins, e.games).padStart(6)}  (${e.games} character-games)`);
  }
}

const desc = ALL_SIZES.map(s => `${s} ${SIZE_TABLE[s].pvModifier >= 0 ? '+' : ''}${SIZE_TABLE[s].pvModifier} PV/${SIZE_TABLE[s].speedModifier >= 0 ? '+' : ''}${SIZE_TABLE[s].speedModifier} vel`).join(', ');
console.log(`Live size validation — ${TEAM_SIZE}v${TEAM_SIZE} @ budget ${BUDGET} (${desc})`);
duel('gran', 'petit');
duel('gran', 'mitja');
duel('petit', 'mitja');
mixed();
