/**
 * ONE LANE BUDGET FOR THE WHOLE MACHINE.
 *
 * A lane is one core's worth of measuring. Each pool used to count its own:
 * sixteen kit suites and the gate in one vitest run were seventeen pools of 24
 * workers, a load of 419 on 32 cores (2026-11-11), every process paying for
 * the others' context switches. Now a lane is a FILE in `$XDG_RUNTIME_DIR`,
 * and whoever wants to compute takes one first: every pool on the machine,
 * whichever process, worktree or session it runs in, draws on the same
 * `lanes` slots.
 *
 * A LANE IS FOR A LEAF: a job that computes. A job that only waits for other
 * lanes (a parent awaiting its pool) must not hold one, or enough of them
 * would hold every lane while their workers wait for one forever. And a
 * worker asleep on an entry another process is computing (cache.ts) gives its
 * lane back until it wakes (`offLane`).
 *
 * Not on the budget: the process that reads the warmed cache afterwards (one
 * core, mostly idle), and the `ai-*` harnesses' own `--lanes` (4 by default).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { threadId } from 'node:worker_threads';

const RUNTIME = process.env.XDG_RUNTIME_DIR ?? os.tmpdir();

/** Leave a couple of cores for the machine; more workers than cores just adds
 *  context switching to a CPU-bound job. `BENCH_LANES` caps it lower. */
export const lanes = Math.max(1, Math.min(os.cpus().length - 2, 24, Number(process.env.BENCH_LANES) || Infinity));

/**
 * FAST WHEN THE USER IS AWAY, GENTLE WHEN THEY ARE WORKING.
 *
 * `pnpm idle-watch` (scripts/idle-watch.sh) writes `active` or `idle` to
 * this file as the desktop reports keyboard and mouse activity. While it says
 * `active`, only `BENCH_LANES_BUSY` lanes (default 4) can be taken, machine-wide.
 * With no watcher running the file is absent and every lane runs.
 * A job already running finishes either way, so the machine frees
 * up within one batch of the user coming back.
 */
const USER_STATE = path.join(RUNTIME, 'pimpampum-user-state');
const BUSY_LANES = Math.max(1, Number(process.env.BENCH_LANES_BUSY) || 4);
export function lanesNow(): number {
  try {
    return fs.readFileSync(USER_STATE, 'utf8').trim() === 'active' ? Math.min(BUSY_LANES, lanes) : lanes;
  } catch {
    return lanes;
  }
}

// --- a lock that is a file -------------------------------------------------

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function ownerOf(file: string): number | null {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || null;
  } catch {
    return null;
  }
}

let tmpCount = 0;
/** The file appears whole or not at all: written aside, then hard-linked,
 *  which fails when the name exists. */
function createWith(file: string, owner: number): boolean {
  const tmp = `${file}.${process.pid}.${threadId}.${tmpCount++}.tmp`;
  fs.writeFileSync(tmp, String(owner));
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Remove a dead owner's lock. Two processes may bury the same one: the second
 *  would carry off the lock the first has just taken, so it looks at what it
 *  moved and puts a live one back. */
function bury(file: string, dead: number): void {
  const grave = `${file}.${process.pid}.grave`;
  try {
    fs.renameSync(file, grave);
  } catch {
    return;
  }
  if (ownerOf(grave) !== dead) {
    try { fs.linkSync(grave, file); } catch { /* retaken meanwhile: two holders, for one job's length */ }
  }
  fs.rmSync(grave, { force: true });
}

/**
 * Take the lock `file` for `owner` (a pid), or say it is held. The lock is the
 * file itself, holding its owner's pid, so it is free again the moment that
 * process is dead: nothing to clean up after a crash or a kill.
 * Throws when the directory cannot be written.
 */
export function tryLock(file: string, owner: number = process.pid): boolean {
  for (let attempt = 0; attempt < 3; attempt++) {
    const holder = ownerOf(file);
    if (holder !== null) {
      if (alive(holder)) return false;
      bury(file, holder);
    }
    if (createWith(file, owner)) return true;
  }
  return false;
}

export function unlock(file: string, owner: number = process.pid): void {
  if (ownerOf(file) === owner) fs.rmSync(file, { force: true });
}

/** Whether a live process holds the lock. */
export function locked(file: string): boolean {
  const holder = ownerOf(file);
  return holder !== null && alive(holder);
}

// --- the lanes -------------------------------------------------------------

/** `BENCH_LANES_DIR` moves the budget (a test takes its own). */
const lanesDir = (): string => process.env.BENCH_LANES_DIR || path.join(RUNTIME, 'pimpampum-lanes');

/** Held slots are re-read for a dead owner once in this many looks. */
const STALE_EVERY = 8;

/** One look over the slots open now (`lanesNow`): the one taken, or null. */
function takeSlot(look: number): string | null {
  const dir = lanesDir();
  fs.mkdirSync(dir, { recursive: true });
  const held = new Set(fs.readdirSync(dir));
  for (let i = 0, n = lanesNow(); i < n; i++) {
    if (held.has(String(i)) && look % STALE_EVERY) continue;
    const file = path.join(dir, String(i));
    if (tryLock(file)) return file;
  }
  return null;
}

/** Out of step with the other processes looking, with no random draw. */
const LONGEST_LOOK = 500;
const untilNextLook = (look: number): number => 200 + (process.pid * 7 + look * 53) % (LONGEST_LOOK - 200);

export interface Lane {
  /** The slot's file, for the worker to give back while it sleeps (`offLane`); null when there is no budget to keep. */
  file: string | null;
  /** The process doing this lane's work, when it is not the one that took it:
   *  the lane then stays taken for as long as THAT process lives, even if its
   *  parent is killed first. */
  handTo(pid: number): void;
  release(): void;
}

const NO_LANE: Lane = { file: null, handTo() {}, release() {} };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let warned = false;
let releasedAt = -Infinity;

/**
 * Wait for one of the machine's lanes. A process that has just released one
 * lets everyone waiting look first: a pool with a queue used to take back the
 * lane it freed before anyone else saw it free, and seven kit suites waited
 * behind the first one's sixty batches (2026-11-12).
 */
export async function takeLane(): Promise<Lane> {
  if (performance.now() - releasedAt < LONGEST_LOOK) await sleep(LONGEST_LOOK);
  for (let look = 0; ; look++) {
    let file: string | null;
    try {
      file = takeSlot(look);
    } catch (e) {
      // A budget that cannot be kept costs time, never a measurement.
      if (!warned) console.warn(`bench/lanes: no lane budget in ${lanesDir()} (${(e as Error).message}); running without one.`);
      warned = true;
      return NO_LANE;
    }
    if (file) {
      const slot = file;
      let owner = process.pid;
      return {
        file: slot,
        handTo(pid) {
          const tmp = `${slot}.${process.pid}.hand`;
          try {
            fs.writeFileSync(tmp, String(pid));
            fs.renameSync(tmp, slot);
            owner = pid;
          } catch { /* the lane stays this process's */ }
        },
        release() {
          unlock(slot, owner);
          releasedAt = performance.now();
        },
      };
    }
    await sleep(untilNextLook(look));
  }
}

/** `jobs`, each on one of the machine's lanes, started as lanes free; the
 *  results in order. Each job must be a leaf (see the header). */
export async function inLanes<T>(jobs: readonly (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, async () => {
    while (next < jobs.length) {
      const lane = await takeLane();
      const i = next++;
      try {
        if (i < jobs.length) out[i] = await jobs[i]();
      } finally {
        lane.release();
      }
    }
  }));
  return out;
}

// --- a worker's own lane ---------------------------------------------------

/** How a pool tells its worker which lane it runs on (`Lane.file`). */
export const WORKER_LANE = 'BENCH_LANE';
let workerLane: string | null = process.env[WORKER_LANE] || null;
let freedAtExit = false;
const napping = new Int32Array(new SharedArrayBuffer(4));

/**
 * Run `wait`, which only sleeps until another process is done, with this
 * worker's lane given back, and take a lane again before going on. A process
 * that is on no lane (it took none, or runs outside a pool) just waits.
 */
export function offLane(wait: () => void): void {
  if (!workerLane || ownerOf(workerLane) !== process.pid) return wait();
  unlock(workerLane);
  workerLane = null;
  try {
    wait();
  } finally {
    try {
      for (let look = 0; !(workerLane = takeSlot(look)); look++) Atomics.wait(napping, 0, 0, untilNextLook(look));
    } catch { /* no budget to keep: go on without a lane */ }
    // The pool releases the slot it handed over, and this may be another.
    if (!freedAtExit) process.on('exit', () => { if (workerLane) unlock(workerLane); });
    freedAtExit = true;
  }
}
