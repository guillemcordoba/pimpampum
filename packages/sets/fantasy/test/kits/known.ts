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
 * almost never played. Measured 2026-10-15 (NEXT-STEPS §53).
 */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Best 18% by the card value but played 2.4%, and it GAINS nothing when best
  // (−0.8 PV): the card value's noise, the §48.2 signature, not a play the
  // search misses. Appeared with the AI of §52 (it passed before). Desbloquejar
  // el cos and Trampolí de mans left this list on the same run (NEXT-STEPS §53).
  berserk: ['rugit-de-guerra'],
};
