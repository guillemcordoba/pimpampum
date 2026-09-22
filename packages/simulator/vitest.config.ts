import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /** Every test process installs the fantasy set before anything measures.
     *  See vitest.setup.ts — bench throws rather than guess at content. */
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    /**
     * FILES RUN IN PARALLEL, IN FORKED PROCESSES.
     *
     * This suite's wall time is the SUM of its files, and the files are wildly
     * uneven: the requirement controls and the balancer guards each run
     * thousands of combats, while `seams` and `requirements` finish in
     * milliseconds. Serially that is the better part of an hour. In parallel it
     * is however long the SLOWEST file takes, on a machine with cores to spare.
     * A suite nobody can afford to run is one nobody runs, and one nobody runs
     * rots in silence — which is the whole reason `bench/games.ts` exists.
     *
     * It used to be `pool: 'threads'` + `singleThread` + `fileParallelism:
     * false`, for a real reason: the balancer guards run whole encounters
     * synchronously — thousands of combats without ever yielding — so a worker
     * sat blocked for seconds, missed the reporter's `onTaskUpdate` RPC, and
     * vitest reported an unhandled error even though every test had passed.
     *
     * FORKS do not share that failure the way threads did: each file gets its
     * own process and its own event loop, so one file's blocking loop cannot
     * starve another's reporter channel. The generous timeouts cover the
     * remaining case — one call that legitimately takes minutes — instead of
     * letting it read as a failure.
     *
     * If the unhandled-RPC error ever comes back, go to `singleFork: true`
     * before giving up the parallelism: it is worth real minutes per run.
     */
    pool: 'forks',
    fileParallelism: true,
    /**
     * TWO TEMPOS, AND THE DEFAULT IS THE FAST ONE.
     *
     * `*.slow.test.ts` files measure — thousands of combats, minutes each.
     * Everything else asserts pure functions, engine seams and source
     * conventions, and finishes in milliseconds. Mixing them meant the only
     * way to check a rule was to wait for a sweep, so nobody checked rules.
     * It also hid a real hole: the "armour stops reducing damage" mutant
     * survived because the one test that catches it was locked inside a file
     * that took 311 seconds and could not go in the mutation kill set.
     *
     *   pnpm test         the fast tier — sub-second, run it constantly
     *   pnpm test:slow    the statistical tier
     *   pnpm test:all     both
     *
     * The slow tier is not optional, it is just not instant: run it before
     * trusting any content verdict, the same way `/analyze` is run after a
     * content change.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Gated by an env var rather than by a CLI `--exclude`, because vitest
      // MERGES the two and the slow tier could then never be selected back in.
      ...(process.env.SLOW === '1' ? [] : ['**/*.slow.test.ts']),
    ],
  },
});
