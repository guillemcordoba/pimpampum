/**
 * Playtest's own tests run on the SYNTHETIC set: a control's verdict must
 * follow from its construction, never from the content it exists to judge.
 *
 * Each test file gets a FRESH, EMPTY cache, so no test reads a number a
 * previous run measured — and not no cache at all, because the parallel warm
 * (`prepare`) works by filling it: with the cache off, every control ran on
 * one core. The warm workers inherit this environment, so they fill the same
 * directory the analysis then reads. Removed when the file is done.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { useSet } from '@pimpampum/bench';
import { SYNTHETIC } from '@pimpampum/bench/testing';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playtest-cache-'));
process.env.BENCH_CACHE_DIR = dir;
delete process.env.BENCH_NO_CACHE;
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
useSet(SYNTHETIC);
