/**
 * REQUIREMENTS A KIT IS KNOWN TO FAIL TODAY — each with why, and where the
 * finding is written down. See `kitSuite` in `@pimpampum/playtest/vitest`: a
 * known failure is asserted to STILL fail, so the day it is fixed its test
 * turns red and the entry gets deleted.
 *
 * Filled from the confirming sweep of 2026-09-23 (NEXT-STEPS §26), after the
 * day's tuning — every requirement verdict is seeded and cached, so it moves
 * only when content, AI or rules do — never by guessing.
 */
import type { Requirement } from '@pimpampum/playtest/vitest';

export const KNOWN: Record<string, Partial<Record<Requirement, string>>> = {
  'enginyer-explosius': {
    cardUse: "Camp minat is never the best play (−0.6 PV) — a marginal card, not a costly one; measured 2026-09-23, NEXT-STEPS §26",
  },
  nigromant: {
    cardUse: "Marca de la perdició is never the best play (−2.8 PV) — each nigromant retune moved the bottom card rather than removing it; measured 2026-09-23, NEXT-STEPS §26",
  },
};
