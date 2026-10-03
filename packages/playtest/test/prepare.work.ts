/**
 * The measuring half of `prepare.slow.test.ts`, run in its own process (bench's
 * `isolated`): one analysis, warmed in parallel or run serially, in a cache of
 * its own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cacheStatus } from '@pimpampum/bench';
import { analyze, installSet, prepare, withSubject, type KitReport, type RunContext } from '../src/index.js';

export async function analysed(ctx: RunContext, games: number, serial: boolean): Promise<{ report: KitReport; misses: number }> {
  process.env.BENCH_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-test-'));
  delete process.env.BENCH_NO_CACHE;
  if (serial) process.env.BENCH_SERIAL = '1'; else delete process.env.BENCH_SERIAL;
  try {
    await installSet(ctx.set);
    return await withSubject(ctx.subject, async subject => {
      await prepare(ctx, subject, games);
      cacheStatus.hits = 0; cacheStatus.misses = 0;
      const report = analyze(subject, games, ctx.budget);
      return { report, misses: cacheStatus.misses };
    });
  } finally {
    fs.rmSync(process.env.BENCH_CACHE_DIR, { recursive: true, force: true });
  }
}
