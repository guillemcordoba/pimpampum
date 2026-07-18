/**
 * Objects (equipment) balance pass: per-item win correlation from mirror
 * games with random equipment. An item whose correlation sits well under 50%
 * is a trap pick (dominated or overpriced); well over 50% is a must-pick.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-objects.ts
 */
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 6000;

const byItem = new Map<string, { games: number; wins: number }>();
const none = { games: 0, wins: 0 };
for (let i = 0; i < GAMES; i++) {
  const a = randomTeam('A', 2, 6);
  const b = randomTeam('B', 2, 6);
  const w = runMatch(a, b);
  for (const [team, won] of [[a, w === 0], [b, w === 1]] as const) {
    for (const c of team) {
      if (c.equipment.length === 0) { none.games++; if (won) none.wins++; }
      for (const eq of c.equipment) {
        const e = byItem.get(eq.id) ?? { games: 0, wins: 0 };
        e.games++;
        if (won) e.wins++;
        byItem.set(eq.id, e);
      }
    }
  }
}
console.log('Per-item win correlation (mirror 2v2, random equipment):');
[...byItem.entries()]
  .map(([id, e]) => ({ id, pct: 100 * e.wins / e.games, games: e.games }))
  .sort((x, y) => y.pct - x.pct)
  .forEach(s => console.log(`  ${s.id.padEnd(20)} ${s.pct.toFixed(1)}% (${s.games})`));
if (none.games) console.log(`  ${'(cap objecte)'.padEnd(20)} ${(100 * none.wins / none.games).toFixed(1)}% (${none.games})`);
