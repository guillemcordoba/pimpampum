/**
 * FILLING THE CACHE IN PARALLEL.
 *
 * A kit's report card is dozens of independent CELL measurements — the
 * full-kit run and the card values, per cell — and a machine has many cores
 * doing one at a time. The
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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The calibration's units of work — the only jobs bench itself knows about. A
 * caller warms its own measurements with its own job type (playtest's
 * `AnalysisJob`); `warm` only needs them to be JSON, since a job crosses a
 * process boundary and has to be rebuilt on the other side from the content.
 */
export type WarmJob =
  | { kind: 'shape'; shapeIdx: number }
  | { kind: 'baseline'; shapeIdx: number; companyIdx: number };

/**
 * WHO RUNS A BATCH: an executable and its arguments, to which the JSON batch is
 * appended. The worker is the CALLER's — it has to install the same set the
 * caller measures (`useSet`) and pass each job to the matching function — so
 * bench does not name one. It used to: a hard-coded `warm-one.ts` path that a
 * package move deleted, after which every child failed at launch, every
 * failure was swallowed as a cache miss, and every "parallel" sweep quietly ran
 * serially for as long as nobody timed one.
 */
export type WarmWorker = string[];

/** Leave a couple of cores for the machine; more children than cores just adds
 *  context switching to a CPU-bound job. `BENCH_LANES` caps it lower. */
const LANES = Math.max(1, Math.min(os.cpus().length - 2, 24, Number(process.env.BENCH_LANES) || Infinity));

/**
 * FAST WHEN THE USER IS AWAY, GENTLE WHEN THEY ARE WORKING.
 *
 * `pnpm idle-watch` (tools/scripts/idle-watch.sh) writes `active` or `idle` to
 * this file as the desktop reports keyboard and mouse activity. While it says
 * `active`, only `BENCH_LANES_BUSY` lanes (default 4) take new batches; the
 * others wait. With no watcher running the file is absent and every lane runs,
 * as before. A batch already running finishes either way, so the machine frees
 * up within one batch of the user coming back.
 */
const USER_STATE = path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), 'pimpampum-user-state');
const BUSY_LANES = Math.max(1, Number(process.env.BENCH_LANES_BUSY) || 4);
export function lanesNow(): number {
  try {
    return fs.readFileSync(USER_STATE, 'utf8').trim() === 'active' ? Math.min(BUSY_LANES, LANES) : LANES;
  } catch {
    return LANES;
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Disable with `BENCH_SERIAL=1` when a crash needs a readable stack. */
const enabled = (): boolean => process.env.BENCH_SERIAL !== '1' && process.env.BENCH_NO_CACHE !== '1';

/**
 * One child, one BATCH of jobs.
 *
 * Batched rather than one child per job because a cell can be shorter than the
 * process that would host it: at one child per cell the startup — module load,
 * registry build, engine fingerprint — cost more CPU than the measurements did.
 * A few batches per lane (see `batches`) pay it a few times each.
 */
function runBatch<J>(worker: WarmWorker, jobs: J[]): Promise<string | null> {
  return new Promise(resolve => {
    const child = execFile(
      worker[0], [...worker.slice(1), JSON.stringify(jobs)],
      // A guard against a HUNG worker, not a budget: at 30 minutes it killed
      // real batches mid-measurement, and every killed batch was then computed
      // again serially — slower than not warming at all. Same ceiling as
      // `isolated()`.
      { timeout: 14_400_000, env: process.env, maxBuffer: 8 << 20 },
      (err, _stdout, stderr) => resolve(!err ? null
        : err.killed ? `a worker was killed (${err.signal ?? 'timeout'}) after its time limit`
          : (String(stderr).trim().split('\n').pop() || `worker exited with code ${err.code}`)),
    );
    // Lowest priority: whatever the user runs comes first.
    try { if (child.pid) os.setPriority(child.pid, 19); } catch { /* not permitted: run as is */ }
  });
}

/**
 * Cut the jobs into SMALL batches for a pool, in the order given.
 *
 * It used to deal one batch per lane, round-robin, up front — and a lane that
 * drew cheap cells finished and sat idle while the others ground through the
 * expensive ones (measured: one of six lanes idle for most of a cold
 * analysis). Several batches per lane, pulled by whichever lane is free, keeps
 * every lane busy to the end; the extra process start-ups cost seconds against
 * batches that run for minutes.
 */
const BATCHES_PER_LANE = 4;
function batches<J>(jobs: J[], lanes: number): J[][] {
  const size = Math.max(1, Math.ceil(jobs.length / (lanes * BATCHES_PER_LANE)));
  const out: J[][] = [];
  for (let i = 0; i < jobs.length; i += size) out.push(jobs.slice(i, i + size));
  return out;
}

/**
 * Run `jobs` across the lanes, resolving when all have been attempted. Give
 * them MOST EXPENSIVE FIRST where you can: the pool takes them in order, so a
 * long job left to the end runs alone while every other lane idles.
 *
 * A failed batch still costs nothing but time — the serial run computes what is
 * missing — but it is REPORTED, and a worker that does not exist is an error:
 * silence here once hid the parallelism being switched off entirely.
 */
export async function warm<J>(
  jobs: J[], worker: WarmWorker, onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!enabled() || jobs.length === 0) return;
  const script = worker.find(a => a.endsWith('.ts') || a.endsWith('.js') || a.endsWith('.mjs'));
  for (const f of [worker[0], script].filter((f): f is string => !!f && f.includes('/'))) {
    if (!fs.existsSync(f)) throw new Error(`bench/parallel: warm worker ${f} does not exist.`);
  }
  const queue = batches(jobs, LANES);
  const total = queue.length;
  let done = 0;
  const failures: string[] = [];
  // A pool of LANES runners, each pulling the next batch when it finishes one.
  // Runner i only takes a batch while i is within today's budget (lanesNow).
  await Promise.all(Array.from({ length: Math.min(LANES, queue.length) }, async (_, i) => {
    for (;;) {
      while (i >= lanesNow() && queue.length) await sleep(5_000);
      const b = queue.shift();
      if (!b) break;
      const failed = await runBatch(worker, b);
      if (failed) failures.push(failed);
      onProgress?.(done += b.length, jobs.length);
    }
  }));
  if (failures.length) {
    console.warn(`bench/parallel: ${failures.length} of ${total} warm batches failed; `
      + `the run will compute those serially. First error: ${failures[0]}`);
  }
}

export const lanes = LANES;
