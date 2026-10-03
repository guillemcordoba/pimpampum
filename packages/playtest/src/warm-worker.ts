/**
 * THE WARM WORKER — one child process's share of `prepare`.
 *
 * Launched by bench/parallel.ts as `node --import tsx warm-worker.js <context>
 * <jobs>`. It rebuilds the run from the context (the set, the subject — a
 * control kit included), computes each job through the function `analyze` will
 * read it with, and exits. Everything it computes lands in the cache; nothing
 * else leaves the process.
 */
import { baselineFor, shapeEnemies, type WarmJob } from '@pimpampum/bench';
import { runAnalysisJob, type AnalysisJob } from './analyze.js';
import { installSet, withSubject, type RunContext } from './prepare.js';

const ctx = JSON.parse(process.argv.at(-2) ?? '{}') as RunContext;
const jobs = JSON.parse(process.argv.at(-1) ?? '[]') as (WarmJob | AnalysisJob)[];

await installSet(ctx.set);
withSubject(ctx.subject, subject => {
  for (const job of jobs) {
    if (job.kind === 'shape') shapeEnemies(job.shapeIdx);
    else if (job.kind === 'baseline') baselineFor(job.shapeIdx, job.companyIdx);
    else runAnalysisJob(subject, ctx.budget ?? {}, job);
  }
});
