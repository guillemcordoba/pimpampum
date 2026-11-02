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
  // unagis, the AI's uncapped threat and the untargetable price (OPEN.md B16,
  // B17): fights run long, as the whole game's do (the encounter-speed tests,
  // B18). Culprits as each one's first failing measurement named them.
  waterbender: { duration: 'p90 9 > 8 (it was 11 while the AI overplayed Boira, OPEN.md B16)' },
  earthbender: { duration: 'p90 10 > 8; culprits Búnquer and Roca viva' },
  airbender: { duration: 'p90 9 > 8; culprits Ventada, Asfíxia, Fulles de vent' },
  artifex: { duration: 'p90 9 > 8; culprit Colós de butxaca' },
  'mestre-armes': { duration: "p90 10 > 8; culprits Retruc d'acer, Bufetada insolent, Braç mort" },
  'mestre-del-xi': { duration: 'p90 9 > 8; culprit Tempesta de son' },
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Measured 2026-11-02: Remolí, a Focus stun, stays blind (OPEN.md B16);
  // Trampa de gel left the list with the untargetable price.
  airbender: ['remoli-de-vent'],
};
