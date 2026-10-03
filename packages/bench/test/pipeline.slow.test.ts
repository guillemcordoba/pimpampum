/**
 * THE DELTA PIPELINE, END TO END — on the synthetic set, with real solves.
 *
 * Every kit verdict is `subject − neutral baseline`, measured across solved
 * cells. This checks the pipeline the way an experimentation platform checks
 * itself before any real subject is trusted:
 *
 *  - an A/A TEST: the neutral stand-in, measured as a subject, must score ZERO.
 *    Anything else is a bias in the instrument, landing in every kit's number.
 *    It is what found baselines measured with the AI's targeting and subject
 *    arms without it (NEXT-STEPS §25);
 *  - a POSITIVE and a NEGATIVE control: the stand-in with bigger dice must
 *    score clearly above zero, with smaller dice clearly below — so a pipeline
 *    that reports zero for everything cannot pass.
 *
 * Measured in child processes (`isolated`): each is a minute of synchronous
 * work, which a vitest worker cannot block for.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolated, SMOKE } from '../src/index.js';
import type { Measured } from './pipeline.work.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipeline.work.ts');
const show = (m: Measured) => `delta ${(m.delta * 100).toFixed(1)}pp ± ${(m.deltaStderr * 100).toFixed(1)}`;

describe('the delta pipeline', () => {
  let neutral: Measured, giant: Measured, weakling: Measured;
  beforeAll(async () => {
    [neutral, giant, weakling] = await Promise.all(
      ['neutral', 'giant', 'weakling'].map(k => isolated<Measured>(WORK, 'measure', [k])),
    );
  });

  it('has cells to measure in', () => {
    expect(neutral.cells).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)('A/A: the neutral stand-in scores zero against its own baseline', () => {
    expect(Math.abs(neutral.delta), show(neutral)).toBeLessThan(3 * neutral.deltaStderr);
  });

  it.skipIf(SMOKE)('a strictly bigger kit scores clearly above zero; a strictly smaller one clearly below', () => {
    expect(giant.delta, show(giant)).toBeGreaterThan(4 * giant.deltaStderr);
    expect(-weakling.delta, show(weakling)).toBeGreaterThan(4 * weakling.deltaStderr);
  });
});
