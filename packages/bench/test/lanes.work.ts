/**
 * The other processes of `lanes.test.ts`: each takes lanes, or asks the cache
 * for an entry, beside its siblings, and leaves a mark in a file the test reads.
 */
import fs from 'node:fs';
import { cached, inLanes } from '../src/index.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** `jobs` leaf jobs through the machine's lanes: `+` as each starts, `-` as it ends. */
export async function pool(log: string, jobs: number): Promise<void> {
  await inLanes(Array.from({ length: jobs }, () => async () => {
    fs.appendFileSync(log, '+');
    await sleep(120);
    fs.appendFileSync(log, '-');
  }));
}

/** The entry `name`, with its mark each time it is computed: `ms` long to
 *  compute, or for as long as the file `until` does not exist (and the test's
 *  own files still do). */
export function slowEntry(log: string, name: string, ms: number, until?: string): string {
  const nap = (t: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, t);
  return cached('claims', name, () => {
    fs.appendFileSync(log, name);
    if (!until) nap(ms);
    else while (!fs.existsSync(until) && fs.existsSync(log)) nap(20);
    return `${name} by ${process.pid}`;
  });
}
