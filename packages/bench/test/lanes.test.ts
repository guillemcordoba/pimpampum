/**
 * THE MACHINE HAS ONE LANE BUDGET, AND AN ENTRY IS COMPUTED ONCE.
 *
 * Both promises are about SEVERAL PROCESSES, so both are tested with several:
 * a pool that counted its own lanes, or a cache that recomputed what a sibling
 * was already computing, passed every single-process test there was while a
 * full slow run put a load of 419 on 32 cores (2026-11-11).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isolated, tryLock, unlock, warm } from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'lanes.work.ts');

let dir: string;
const ENV = ['BENCH_LANES', 'BENCH_LANES_DIR', 'BENCH_CACHE_DIR', 'BENCH_NO_CACHE'] as const;
let before: Record<string, string | undefined>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-lanes-'));
  before = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A pid that was a process and no longer is. */
const deadPid = (): number => spawnSync(process.execPath, ['-e', '']).pid;

describe('a lock file', () => {
  it('is held by one owner at a time, and free once released', () => {
    const file = path.join(dir, 'lock');
    expect(tryLock(file)).toBe(true);
    expect(tryLock(file)).toBe(false);
    unlock(file);
    expect(tryLock(file)).toBe(true);
  });

  it('is free the moment its owner is dead', () => {
    const file = path.join(dir, 'lock');
    expect(tryLock(file, deadPid())).toBe(true);
    expect(tryLock(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(String(process.pid));
  });

  it('is not released by someone who does not hold it', () => {
    const file = path.join(dir, 'lock');
    expect(tryLock(file)).toBe(true);
    unlock(file, deadPid());
    expect(tryLock(file)).toBe(false);
  });
});

describe('several processes at once', () => {
  it('share the lanes: three pools of four jobs never run more than the budget of two', async () => {
    const log = path.join(dir, 'log');
    process.env.BENCH_LANES = '2';
    process.env.BENCH_LANES_DIR = path.join(dir, 'lanes');
    await Promise.all([0, 1, 2].map(() => isolated(WORK, 'pool', [log, 4])));
    let running = 0, most = 0;
    const marks = fs.readFileSync(log, 'utf8');
    for (const m of marks) most = Math.max(most, running += m === '+' ? 1 : -1);
    expect(marks.length).toBe(24);
    expect(most).toBe(2);
    expect(fs.readdirSync(path.join(dir, 'lanes'))).toEqual([]);
  });

  it('compute a cache entry once: the others wait and read it', async () => {
    const log = path.join(dir, 'log');
    process.env.BENCH_NO_CACHE = '0';
    process.env.BENCH_CACHE_DIR = path.join(dir, 'cache');
    const values = await Promise.all([0, 1, 2, 3].map(() => isolated<string>(WORK, 'slowEntry', [log, 'c', 400])));
    expect(new Set(values).size).toBe(1);
    expect(fs.readFileSync(log, 'utf8')).toBe('c');
  });

  it('sleep on a sibling\'s claim without a lane: a worker gives its own back, and takes one again to go on', async () => {
    const log = path.join(dir, 'log'), got = path.join(dir, 'got'), done = path.join(dir, 'done');
    process.env.BENCH_NO_CACHE = '0';
    process.env.BENCH_CACHE_DIR = path.join(dir, 'cache');
    process.env.BENCH_LANES_DIR = path.join(dir, 'lanes');
    const taken = (): boolean => fs.existsSync(path.join(dir, 'lanes', '0'));
    const until = async (what: () => boolean): Promise<void> => {
      while (!what()) await new Promise(r => setTimeout(r, 5));
    };
    // Another process is computing `a`, for as long as this test says…
    const theirs = isolated<string>(WORK, 'slowEntry', [log, 'a', 0, done]);
    await until(() => fs.existsSync(log));
    // …and a pool's worker, on a lane, is handed `a` too.
    const pool = warm(['a'], [process.execPath, '--import', 'tsx', path.join(HERE, 'lanes.worker.ts'), JSON.stringify({ log, got })]);
    await until(taken);
    await until(() => !taken());
    expect(fs.existsSync(got), 'the worker finished before the entry was computed').toBe(false);
    fs.writeFileSync(done, '');
    await pool;
    expect(fs.readFileSync(got, 'utf8')).toBe(await theirs);
    expect(fs.readFileSync(log, 'utf8')).toBe('a');
    expect(taken()).toBe(false);
  }, 60_000);
});
