/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted. Filled from measurement, never by
 * guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
  // Measured 2026-11-12, each kit's full-kit run (800 fights) on the ONE
  // calibration cell usable until the creatures are on the dice ladder
  // (GOALS.md B20; 19 were usable on 2026-11-02, and every kit was inside the
  // band on them, B17). The owner's decision that day: list them, with B20 as
  // the reason, and measure them again when it lands. No culprits: nobody
  // was blamed on this cell.
  waterbender: { duration: 'median 6 > 5, p90 9 > 6 on the one usable cell (GOALS.md B20)' },
  earthbender: { duration: 'p90 7 > 6 on the one usable cell (GOALS.md B20)' },
  airbender: { duration: 'p90 9 > 6 on the one usable cell (GOALS.md B20)' },
  firebender: {
    duration: 'p90 9 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−29.6pp ±2.6 on the one usable cell (GOALS.md B20)',
  },
  acrobacia: {
    duration: 'p90 8 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−31.0pp ±2.6 on the one usable cell (GOALS.md B20)',
  },
  artifex: {
    duration: 'p90 10 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−29.8pp ±2.6 on the one usable cell (GOALS.md B20)',
  },
  'mestre-armes': {
    duration: 'median 6 > 5, p90 10 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−46.9pp ±2.5 on the one usable cell (GOALS.md B20)',
  },
  'mestre-del-xi': {
    duration: 'median 6 > 5, p90 10 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−31.1pp ±2.6 on the one usable cell (GOALS.md B20)',
  },
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Measured 2026-11-02: Remolí, a Focus stun, stays blind (GOALS.md B16);
  // Trampa de gel left the list with the untargetable price.
  airbender: ['remoli-de-vent'],
};
