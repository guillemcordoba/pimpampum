/**
 * HOW MANY COMBATS A HARNESS RUNS — and why every one of them must let you
 * say "two".
 *
 * A harness with a hardcoded sample size cannot be run casually, so it is never
 * run casually, so nothing notices when it dies. That is not a hypothesis:
 * `experiment-berserk` and `experiment-balance-pass` both CRASHED on a berserk
 * card that had been renamed, and had been crashing for however long, because
 * checking them cost 2,500 and 4,000 combats respectively. Meanwhile the three
 * harnesses that stayed honest — `kit-analyzer`, `ai-benchmark`, `measure-swing`
 * — were exactly the ones with a `GAMES` override.
 *
 * So: every harness reads its sample size through here, and
 * `tests/harnesses.test.ts` runs all of them at `GAMES=2`. It checks nothing
 * about the NUMBERS — two combats measure nothing — only that each harness
 * still runs against today's content. A renamed card, a deleted skill or a
 * changed log format then breaks the build the day it happens.
 */
declare const process: { env: Record<string, string | undefined>; argv: string[] };

/**
 * The sample size, from `--games`, then `GAMES`, then the harness's own
 * default.
 *
 * `fallback` is the number the harness actually wants — size it by the claim it
 * makes (`gamesFor` in `report.ts` says what a threshold costs), not by what is
 * quick.
 */
export function games(fallback: number): number {
  const i = process.argv.indexOf('--games');
  const flag = i >= 0 ? process.argv[i + 1] : undefined;
  const n = Number(flag ?? process.env.GAMES ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Same, for the solver's search budget — solves dominate the cost of any
 *  harness that calls `solveEncounter`, so the smoke run turns this down too. */
export function searchGames(fallback: number): number {
  const n = Number(process.env.SEARCH_GAMES ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** True when running under the smoke test: sizes are meaningless, so a harness
 *  may skip an expensive extra pass that proves nothing at n=2. */
export const SMOKE = process.env.BENCH_SMOKE === '1';
