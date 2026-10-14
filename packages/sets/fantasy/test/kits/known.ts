/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted.
 *
 * Filled from the sweep that introduced the four requirements (NEXT-STEPS
 * §27.3) — every verdict is seeded and cached, so it moves only when content,
 * AI or rules do — never by guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
};

/**
 * Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 * almost never played. Measured 2026-10-04 (NEXT-STEPS §30). Both pay off in
 * later rounds — a grip that holds, mines that wait — which a one-round
 * evaluator cannot see unless their statuses price themselves.
 */
// Empty since 2026-10-13: Braç mort left the detector's edge once Retruc
// d'acer's riposte lost the level (NEXT-STEPS §44.5).
export const KNOWN_BLIND: Record<string, string[]> = {
  // Ganxo salvavides (2026-10-14: best 19%, played 3.3%) gains only +0.4 PV
  // on the runner-up when it is best — near-ties with Paraigua blindat and
  // Parany de molla, the kit's other defenses; its payoff lands inside the
  // round the search plays, so there is no status to price (NEXT-STEPS §46).
  artifex: ['ganxo-salvavides'],
};
