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
  // The `choices` entries: the first card values on that cell, 2026-11-13
  // (600 card fights a kit, at full kit: level 10). Artífex and Mestre del xi:
  // not measured yet.
  waterbender: {
    duration: 'median 6 > 5, p90 9 > 6 on the one usable cell (GOALS.md B20)',
    choices: "Fuet d'aigua (card 1, a plain 1d4) is never the right play in a level-10 hand, under every model (GOALS.md B17)",
  },
  earthbender: { duration: 'p90 7 > 6 on the one usable cell (GOALS.md B20)' },
  airbender: { duration: 'p90 9 > 6 on the one usable cell (GOALS.md B20)' },
  firebender: {
    duration: 'p90 9 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−29.6pp ±2.6 on the one usable cell (GOALS.md B20)',
    choices: 'Bola de foc (card 1) and Fúria de flames (card 6) are never the right play in a level-10 hand, under every model (GOALS.md B17)',
  },
  acrobacia: {
    duration: 'p90 8 > 6 on the one usable cell (GOALS.md B20)',
    strength: '−31.0pp ±2.6 on the one usable cell (GOALS.md B20)',
    choices: 'Salt mortal (card 8) is never the right play in a level-10 hand, under every model (GOALS.md B17)',
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
  // None on the one usable cell (2026-11-13). Remolí de vent, blind on the 19
  // cells of 2026-11-02 (GOALS.md B16), is played there on a tenth of its
  // legal turns and is the best play on a fifth.
};
