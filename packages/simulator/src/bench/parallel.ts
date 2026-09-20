/**
 * FILLING THE CACHE IN PARALLEL.
 *
 * A kit's report card is a few hundred independent CELL measurements — one per
 * (level, policy, cell) — and this box has 32 cores doing one at a time. The
 * obvious fix is to run them at once, and the obvious risk is putting
 * concurrency inside a measurement layer whose whole value is being trusted.
 *
 * So the parallelism NEVER touches the measurement. Child processes only
 * populate `bench/cache.ts`; the real run then executes exactly as it always
 * did and finds every answer already there. Three things follow:
 *
 *  - the numbers are bit-identical to a serial run, because they ARE a serial
 *    run — just one that happened in another process a moment earlier;
 *  - a child that fails, hangs or is killed costs nothing but time: the entry
 *    is simply missing and the main run computes it itself;
 *  - none of this is on the path when the cache is warm.
 *
 * It is a pure optimisation with a correctness floor, which is the only shape
 * of concurrency worth having here.
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '../..');
const TSX = path.join(PKG, 'node_modules', '.bin', 'tsx');
const ENTRY = path.join(HERE, 'warm-one.ts');

/** One unit of work a child can do. Kept small and JSON-shaped so the child
 *  can reconstruct it without sharing anything but the content itself. */
export type WarmJob =
  | { kind: 'shape'; label: string }
  | { kind: 'baseline'; label: string; companyIdx: number }
  | {
    kind: 'matrix';
    mode: 'player' | 'enemy';
    id: string;
    count?: number;
    level: number;
    games: number;
    policy: string;
    seedOffset: number;
    /** Warm ONE cell. The cell is the unit the cache stores and the unit that
     *  parallelises: a whole-matrix job would pin a level to a single core, and
     *  the level sweep is the dominant cost. */
    cellIdx: number;
    /** Card id the subject does NOT hold — an ABLATION cell. It is part of the
     *  cache key, so leaving it off this type would have every ablation warm
     *  the full kit's cell instead and then miss, silently, in the run. */
    without?: string;
  };

/** Leave a couple of cores for the machine; more children than cores just adds
 *  context switching to a CPU-bound job. */
const LANES = Math.max(1, Math.min(os.cpus().length - 2, 24));

/** Disable with `BENCH_SERIAL=1` when a crash needs a readable stack. */
const ENABLED = process.env.BENCH_SERIAL !== '1' && process.env.BENCH_NO_CACHE !== '1';

/**
 * One child, one BATCH of jobs.
 *
 * Batched rather than one child per job because a cell can be shorter than the
 * process that would host it: at one child per cell the startup — module load,
 * registry build, engine fingerprint — cost more CPU than the measurements did,
 * and wall time did not improve at all. One child per lane pays that once each.
 */
function runBatch(jobs: WarmJob[]): Promise<void> {
  return new Promise(resolve => {
    execFile(
      TSX, [ENTRY, JSON.stringify(jobs)],
      { cwd: PKG, timeout: 1_800_000, env: process.env, maxBuffer: 8 << 20 },
      () => resolve(),   // a failed child is a cache miss, not an error
    );
  });
}

/** Deal round-robin, so a lane that draws only cheap jobs is not left idle
 *  while another holds every expensive one. */
function deal(jobs: WarmJob[], n: number): WarmJob[][] {
  const out: WarmJob[][] = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => out[i % n].push(j));
  return out.filter(b => b.length > 0);
}

/**
 * Run `jobs` across the lanes, resolving when all have been attempted.
 *
 * Nothing is returned and nothing is asserted: the caller carries on and reads
 * the cache, which either has the entry or does not.
 */
export async function warm(jobs: WarmJob[], onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!ENABLED || jobs.length === 0) return;
  const batches = deal(jobs, Math.min(LANES, jobs.length));
  let done = 0;
  await Promise.all(batches.map(async b => {
    await runBatch(b);
    onProgress?.(done += b.length, jobs.length);
  }));
}

export const lanes = LANES;
