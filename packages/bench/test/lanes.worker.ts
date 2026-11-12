/**
 * A pool's worker for `lanes.test.ts`: asks the cache for each entry of its
 * batch, and writes what it got.
 */
import fs from 'node:fs';
import { slowEntry } from './lanes.work.js';

const { log, got } = JSON.parse(process.argv.at(-2)!) as { log: string; got: string };
for (const name of JSON.parse(process.argv.at(-1)!) as string[]) fs.appendFileSync(got, slowEntry(log, name, 10));
