/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted. Filled from measurement, never by
 * guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
  // Measured 2026-11-02 on the calibration with the patrol of 7 and the three
  // unagis, and the AI's uncapped threat (OPEN.md B16, B17): fights run long, as
  // the whole game's do (the encounter-speed tests, B18).
  waterbender: { duration: 'p90 11 > 8; culprit Boira, which the AI overplays (OPEN.md B16)' },
  earthbender: { duration: 'p90 10 > 8; culprits Búnquer and Roca viva' },
  firebender: { duration: 'p90 9 > 8; culprits Esclat encegador, Cortina de fum, Anell de foc' },
  artifex: { duration: 'p90 10 > 8; culprit Colós de butxaca' },
  'mestre-armes': { duration: "p90 9 > 8; culprits Retruc d'acer, Bufetada insolent, Braç mort" },
  'mestre-del-xi': { duration: 'p90 9 > 8; culprit Tempesta de son' },
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Measured 2026-11-02: the Focus stuns stay blind (OPEN.md B16), and Retruc
  // d'acer is back on the detector's edge.
  waterbender: ['trampa-de-gel'],
  airbender: ['remoli-de-vent'],
  'mestre-armes': ['retruc-d-acer'],
};
