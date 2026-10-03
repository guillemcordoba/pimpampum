/**
 * THE TEST TIERS, shared by every package's vitest config.
 *
 * TWO TEMPOS, AND THE DEFAULT IS THE FAST ONE.
 *
 * `*.slow.test.ts` files MEASURE — thousands of combats, minutes each.
 * Everything else asserts rules, seams, properties and pure functions, and
 * finishes in milliseconds. Mixing them meant the only way to check a rule was
 * to wait for a sweep, so nobody checked rules — and it hid a real hole: the
 * "armour stops reducing damage" mutant survived because the one test that
 * caught it was locked inside a file that took 311 seconds.
 *
 *   pnpm test         the fast tier, every package — run it constantly
 *   pnpm test:slow    the statistical tier
 *   pnpm test:all     both
 *
 * The slow tier is gated by an ENV VAR, not a CLI `--exclude`: vitest MERGES
 * the two, so an exclude in config could never be selected back in.
 *
 * FILES RUN IN PARALLEL, IN FORKED PROCESSES. A slow file runs whole
 * encounters synchronously — thousands of combats without yielding — and in a
 * worker THREAD that starved the reporter's `onTaskUpdate` RPC and read as an
 * unhandled error though every test passed. Forks give each file its own
 * process and event loop. vitest parallelises by FILE and never within one, so
 * a slow suite is split one question per file.
 *
 * NO RETRIES, EVER. A statistical test retried until green has quietly spent
 * its false-positive budget twice.
 */
import type { UserWorkspaceConfig } from 'vitest/config';

declare const process: { env: Record<string, string | undefined> };

export const SLOW = process.env.SLOW === '1';

export function tiers(name: string, extra: { setupFiles?: string[] } = {}): UserWorkspaceConfig {
  return {
    test: {
      name,
      include: ['test/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', ...(SLOW ? [] : ['**/*.slow.test.ts'])],
      setupFiles: extra.setupFiles ?? [],
      pool: 'forks',
      // A slow file holds a solved encounter matrix and thousands of fights in
      // memory; eight of them at once is more than an 8 GB machine has.
      poolOptions: { forks: { maxForks: SLOW ? 4 : undefined } },
      fileParallelism: true,
      retry: 0,
      // A full kit analysis on real content is legitimately long — its first
      // run timed out at a 30-minute hook limit with nothing wrong.
      testTimeout: SLOW ? 14_400_000 : 20_000,
      hookTimeout: SLOW ? 14_400_000 : 20_000,
    },
  };
}
