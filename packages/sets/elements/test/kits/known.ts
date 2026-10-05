/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted. Filled from measurement, never by
 * guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
};

/** Cards the AI is KNOWN to be blind to (`isBlindSpot`): often the best play,
 *  almost never played. */
export const KNOWN_BLIND: Record<string, string[]> = {
  // Its payoff is +3 speed NEXT turn, a modifier the evaluator cannot see;
  // the AI takes Esfera d'aire instead. Measured 2026-10-06: the right play in
  // 36% of its decisions, played on 5% (NEXT-STEPS §42).
  airbender: ['esquivar-en-espiral'],
  // Burying a body buys tempo, not PV, and its status prices itself only a little
  // (ENTERRAT.positionValue); the right play in 25% of its decisions, played
  // on 2% (2026-10-06, NEXT-STEPS §42).
  earthbender: ['preso-de-terra'],
};
