/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted. Filled from measurement, never by
 * guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
  // Measured 2026-11-01 on the calibration re-pinned to the new benders: fights
  // run long (p90 10 > 8), as the whole game's do (the encounter-speed tests).
  waterbender: { duration: 'p90 10 > 8; culprit Boira, which the AI overplays (OPEN.md B16)' },
  artifex: { duration: 'p90 10 > 8; culprit Colós de butxaca' },
  'mestre-del-xi': { duration: 'p90 10 > 8; culprit Tempesta de son' },
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Retruc d'acer on the detector's edge since Bloqueig d'escorpí was priced
  // (2026-10-13: best 29%, played 5.3%, flagged under 5.8%): the three
  // Esgrima defenses share their best moments, and the least played gets
  // flagged (NEXT-STEPS §44).
  // Bloqueig d'escorpí joined it on the re-pinned calibration (2026-11-01: best 15%, played 1.7%).
  'mestre-armes': ['retruc-d-acer', 'bloqueig-d-escorpi'],
  // On the calibration re-pinned 2026-11-01, the AI's blind spots are mostly
  // Focus and guarding cards: its rollouts model the enemy with a heuristic that
  // hits the card's player every round (OPEN.md B16).
  firebender: ['esclat-encegador'],
  waterbender: ['trampa-de-gel'],
  airbender: ['corrent-ascendent', 'remoli-de-vent'],
  acrobacia: ['esquiva-i-traveta', 'tombarella-de-rescat'],
  artifex: ['paraigua-blindat', 'parany-de-molla'],
  // Cop de vida left this list 2026-10-14 (best 16%, played 3.7%, NEXT-STEPS §50);
  // Esquiva i traveta on 2026-10-19 with the AI of §54.3 (NEXT-STEPS §54.3).
};
