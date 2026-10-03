/**
 * WARM A WHOLE ANALYSIS ACROSS THE CORES — then `analyze` reads it.
 *
 * `analyze` is serial by design: one process, one seeded sequence, numbers that
 * mean the same thing every run. Its cost is dozens of independent CELLS —
 * the full-kit run and the card value, per cell — and a kit's report card used
 * to measure them one after another on one core, for as long as an hour.
 *
 * `prepare` fills the cache first, across bench's lanes, through the SAME
 * per-cell functions `analyze` calls (`analysisJobs` / `runAnalysisJob`), so
 * `analyze` then runs exactly as before and finds every cell computed. The
 * guarantees are bench/parallel.ts's: the numbers are bit-identical to a serial
 * run, and a worker that fails costs time, never correctness.
 *
 * Two waves, because the second needs the first in the cache: the calibration
 * (shapes, then baselines), then the analysis itself.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { companyCount, theSet, useSet, warm, type GameSet, type WarmWorker } from '@pimpampum/bench';
import { analysisJobs, type AnalyzeBudget, type Subject } from './analyze.js';
import * as kits from './control-kits.js';

/** A control kit, by its constructor's name — a kit is code, so it cannot
 *  cross a process boundary; its recipe can. */
export type ControlName = Exclude<keyof typeof kits, 'withControlKit'>;

/** Everything a fresh process needs to rebuild a run. */
export interface RunContext {
  /** The module that exports the set to install (a path or file URL), and the
   *  name it is exported under. */
  set: { module: string; export: string };
  /** A kit the set already has, or a control kit to install for the run. */
  subject: Subject | { control: ControlName; args?: unknown[] };
  budget?: AnalyzeBudget;
}

/** Install the run's set in this process. */
export async function installSet(ref: RunContext['set']): Promise<GameSet> {
  const url = ref.module.startsWith('file:') ? ref.module : `file://${path.resolve(ref.module)}`;
  const set = (await import(url))[ref.export] as GameSet | undefined;
  if (!set) throw new Error(`${ref.module} exports no '${ref.export}'`);
  useSet(set);
  return set;
}

/** Run `fn` on the run's subject — installing a control kit around it (even an
 *  async `fn`) when that is what the subject is. */
export function withSubject<T>(subject: RunContext['subject'], fn: (s: Subject) => T): T {
  if (!('control' in subject)) return fn(subject);
  const make = kits[subject.control] as (...a: unknown[]) => ReturnType<typeof kits.flatKit>;
  return kits.withControlKit(make(...(subject.args ?? [])), def => fn({ mode: 'player', id: def.id }));
}

/** The built worker, wherever this module is imported from (`src/` in tests). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'warm-worker.js');

/**
 * Warm every cell `analyze(subject, games, ctx.budget)` will read. `subject` is
 * the resolved one (a control kit's installed id); `ctx` is how a worker
 * rebuilds it.
 */
export async function prepare(ctx: RunContext, subject: Subject, games: number): Promise<void> {
  const worker: WarmWorker = [process.execPath, '--import', 'tsx', WORKER, JSON.stringify(ctx)];
  const budget = ctx.budget ?? {};
  if (subject.mode === 'player') {
    const shapes = theSet().calibration.shapes;
    await warm(shapes.map((_, shapeIdx) => ({ kind: 'shape' as const, shapeIdx })), worker);
    await warm(shapes.flatMap((_, shapeIdx) => Array.from({ length: companyCount() }, (_, companyIdx) => ({
      kind: 'baseline' as const, shapeIdx, companyIdx,
    }))), worker);
  }
  await warm(analysisJobs(subject, games, budget), worker);
}
