/**
 * The measuring half of `controls-triangle.slow.test.ts`, run in its own
 * process. Styles whose order follows from construction, not from content:
 * the production AI against uniformly random cards, and against itself.
 */
import { depth1, uniform, useSet } from '@pimpampum/bench';
import { SYNTHETIC } from '@pimpampum/bench/testing';
import { measureCycle, type TriangleReport } from '../src/index.js';

/** Thinking → random → thinking: the first edge holds by construction, so
 *  the second, the same duel read backwards, cannot. */
export function knownOrder(games: number): TriangleReport {
  useSet(SYNTHETIC);
  return measureCycle([{ name: 'thinking', chooser: depth1 }, { name: 'random', chooser: uniform }], games);
}

/** A/A: the same style on both sides can claim no edge either way. */
export function selfDuel(games: number): TriangleReport {
  useSet(SYNTHETIC);
  return measureCycle([{ name: 'A', chooser: depth1 }, { name: 'A′', chooser: depth1 }], games);
}
