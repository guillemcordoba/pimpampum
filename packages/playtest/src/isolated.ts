/**
 * RUN AN ANALYSIS IN ITS OWN PROCESS, and await it — `analyze` on bench's
 * `isolated` (see there for why a long measurement cannot run inside a vitest
 * worker).
 */
import { isolated } from '@pimpampum/bench';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KitReport } from './analyze.js';
import type { RunContext } from './prepare.js';

export type { ControlName } from './prepare.js';

/** A run to analyze in a child: how to rebuild it, and its sample. */
export interface IsolatedRun extends RunContext {
  games: number;
}

/** The built entry the child calls — `runIsolated` below, from `dist/`. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'isolated.js');

export function analyzeIsolated(run: IsolatedRun): Promise<KitReport> {
  return isolated<KitReport>(SELF, 'runIsolated', [run]);
}

/**
 * Runs in the child: install the set, warm every cell the analysis will read
 * across the cores (`prepare`), then analyze — serially, reading the cache.
 */
export async function runIsolated(run: IsolatedRun): Promise<KitReport> {
  const { analyze } = await import('./analyze.js');
  const { installSet, prepare, withSubject } = await import('./prepare.js');
  await installSet(run.set);
  return withSubject(run.subject, async subject => {
    await prepare(run, subject, run.games);
    return analyze(subject, run.games, run.budget);
  });
}
