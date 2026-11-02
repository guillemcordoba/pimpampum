/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted. Filled from measurement, never by
 * guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
  // Measured 2026-11-02 with the AI's aim fix (OPEN.md B16): fights run long,
  // as the whole game's do (the encounter-speed tests).
  earthbender: { duration: 'p90 9 > 8; culprits Búnquer and Roca viva' },
  firebender: { duration: 'p90 9 > 8; culprits Esclat encegador, Cortina de fum, Anell de foc' },
  artifex: { duration: 'p90 13 > 8; culprit Colós de butxaca' },
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Measured 2026-11-02 with the AI's aim fix: the Focus stuns stay blind
  // (OPEN.md B16), and so does Parany de molla.
  waterbender: ['trampa-de-gel'],
  airbender: ['remoli-de-vent'],
  artifex: ['parany-de-molla'],
  // Left this list 2026-11-02 with the aim fix: Retruc d'acer and Bloqueig
  // d'escorpí (Esgrima), Esclat encegador, Corrent ascendent, Esquiva i traveta,
  // Tombarella de rescat, Paraigua blindat.
};
