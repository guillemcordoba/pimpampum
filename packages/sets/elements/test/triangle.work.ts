/**
 * The measuring half of `triangle.slow.test.ts`: this set's three styles,
 * each against the next, in mirror matches of the calibration party.
 */
import { useSet } from '@pimpampum/bench';
import { blameEdge, type Culprit, measureTriangle, type TriangleReport } from '@pimpampum/playtest';
import { ELEMENTS } from '../src/bench/index.js';

export function triangle(): TriangleReport {
  useSet(ELEMENTS);
  return measureTriangle();
}

/** Which of the losing style's cards hold a broken edge up (`blameEdge`). */
export function blame(winner: string, loser: string): Culprit[] {
  useSet(ELEMENTS);
  return blameEdge(winner, loser);
}
