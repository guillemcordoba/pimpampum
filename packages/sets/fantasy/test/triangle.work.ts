/**
 * The measuring half of `triangle.slow.test.ts`: this set's three styles,
 * each against the next, in mirror matches of the calibration party.
 */
import { useSet } from '@pimpampum/bench';
import { measureTriangle, type TriangleReport } from '@pimpampum/playtest';
import { FANTASY } from '../src/bench/index.js';

export function triangle(): TriangleReport {
  useSet(FANTASY);
  return measureTriangle();
}
