/**
 * THE GATE WORKER — one child process's share of the kit gate.
 *
 * Launched by bench/parallel.ts as `node --import tsx gate-worker.js <context>
 * <jobs>`. It installs the set, computes each unit through the function
 * `measureGate` will read it with, and exits; everything lands in the cache.
 */
import { runGateJob, type GateContext, type GateJob } from './gate.js';
import { installSet } from './prepare.js';

const ctx = JSON.parse(process.argv.at(-2) ?? '{}') as GateContext;
const jobs = JSON.parse(process.argv.at(-1) ?? '[]') as GateJob[];

await installSet(ctx.set);
for (const job of jobs) runGateJob(job, ctx.budget);
