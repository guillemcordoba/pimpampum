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
  earthbender: ['preso-de-terra'],
  'enginyer-explosius': ['camp-minat'],
};
