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
 * almost never played. Measured 2026-10-14 (NEXT-STEPS §48.2).
 */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Both best mostly where the round's search sees no difference: in fights
  // already won this round (every card scores the win), where the card value
  // still prefers the card that saves PV, and on opening rounds where the
  // search prefers the damage by a point or two. A probe over every decision
  // found the one-round search ranking them best in 2-5% of their legal turns
  // and never at the moments the card value did (NEXT-STEPS §48.2).
  acrobacia: ['tombarella-de-rescat'],
  'mestre-del-xi': ['segellar-la-ferida'],
};
