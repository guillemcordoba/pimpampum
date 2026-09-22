// bench-exempt(interval): this harness prints its own 95% confidence interval
// and z-score by hand, which is stricter than the 1σ the shared formatter
// quotes — it is the exemplar the rest of the package was brought up to, not
// an exception to it.
/**
 * Seat-bias check: identical generators on both seats — any deviation of
 * team A's share of decided games from 50% is engine seat bias.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-seat.ts
 */
import { withSeed } from '@pimpampum/engine';
import { games, randomTeam, runMatch, useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

const GAMES = games(8000);
/** Seeded so a re-run answers the same question. Seat bias is a property of
 *  the engine, so it must not move between runs of this script. */
const SEED = 20260920;
let a = 0, b = 0, d = 0;
withSeed(SEED, () => {
  for (let i = 0; i < GAMES; i++) {
    const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6));
    if (w === 0) a++; else if (w === 1) b++; else d++;
  }
});
const decided = a + b;
const share = a / decided;
const se = Math.sqrt(0.25 / decided);
console.log(`games ${GAMES}  A ${a}  B ${b}  draws ${d}`);
console.log(`A share of decided: ${(100 * share).toFixed(2)}%  (±${(100 * 1.96 * se).toFixed(2)}pp 95% CI)  z=${((share - 0.5) / se).toFixed(1)}`);
