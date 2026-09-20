/**
 * A BATCH of warm jobs, in one process.
 *
 * It calls the SAME functions the real run calls — that is the point, and the
 * only way this cannot drift from what it is warming. Its output is the cache
 * entries it leaves behind; stdout is ignored.
 *
 * Batched because a cell can be shorter than the process hosting it: one child
 * per cell spent more CPU on startup than on measuring.
 */
import type { WarmJob } from './parallel.js';

declare const process: { argv: string[]; exit(code: number): never };

type Shapes = typeof import('./shapes.js');
type Lib = typeof import('../kit-analyzer-lib.js');

function one(job: WarmJob, shapes: Shapes, ka: Lib): void {
  if (job.kind === 'shape') {
    const shape = shapes.SHAPES.find(s => s.label === job.label);
    if (shape) shapes.solveGroupsOnly(shape);
    return;
  }
  if (job.kind === 'baseline') {
    const shape = shapes.SHAPES.find(s => s.label === job.label);
    if (shape) shapes.baselineFor(shape, job.companyIdx);
    return;
  }
  // The analyzer owns how a subject becomes cells and a setup, so ask it.
  ka.warmMatrix(job);
}

async function main(): Promise<void> {
  const jobs = JSON.parse(process.argv[2] ?? '[]') as WarmJob[];
  const shapes = await import('./shapes.js');
  const ka = await import('../kit-analyzer-lib.js');
  for (const job of jobs) one(job, shapes, ka);
}

main().then(() => process.exit(0), () => process.exit(1));
