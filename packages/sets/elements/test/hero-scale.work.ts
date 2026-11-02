/**
 * The measuring half of `hero-scale.slow.test.ts`: this set's main kits, two
 * against two at the players' own PV.
 */
import { useSet } from '@pimpampum/bench';
import { measureHeroScale, type HeroScaleReport } from '@pimpampum/playtest';
import { ELEMENTS } from '../src/bench/index.js';

export function heroScale(level: number): HeroScaleReport {
  useSet(ELEMENTS);
  return measureHeroScale(level);
}
