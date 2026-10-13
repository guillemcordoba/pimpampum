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
export const KNOWN_BLIND: Record<string, string[]> = {
  // Braç mort sits on the detector's edge (2026-10-13: best 19%, played 3.6%,
  // flagged under 3.8%), and its best moments are ties with Retruc d'acer —
  // when best it gains −0.7±0.5 PV on the runner-up. Three near-substitute
  // defenses share those moments; the least played gets flagged (NEXT-STEPS §44).
  'mestre-armes': ['brac-mort'],
};
