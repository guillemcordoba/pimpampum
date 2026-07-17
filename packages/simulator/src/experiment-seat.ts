/**
 * Seat-bias check: identical generators on both seats — any deviation of
 * team A's share of decided games from 50% is engine seat bias.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-seat.ts
 */
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 8000;
let a = 0, b = 0, d = 0;
for (let i = 0; i < GAMES; i++) {
  const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6));
  if (w === 0) a++; else if (w === 1) b++; else d++;
}
const decided = a + b;
const share = a / decided;
const se = Math.sqrt(0.25 / decided);
console.log(`games ${GAMES}  A ${a}  B ${b}  draws ${d}`);
console.log(`A share of decided: ${(100 * share).toFixed(2)}%  (±${(100 * 1.96 * se).toFixed(2)}pp 95% CI)  z=${((share - 0.5) / se).toFixed(1)}`);
