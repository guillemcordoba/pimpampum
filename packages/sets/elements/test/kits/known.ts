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
  // Retruc d'acer on the detector's edge since Bloqueig d'escorpí was priced
  // (2026-10-13: best 29%, played 5.3%, flagged under 5.8%): the three
  // Esgrima defenses share their best moments, and the least played gets
  // flagged (NEXT-STEPS §44).
  'mestre-armes': ['retruc-d-acer'],
  // Esquiva i traveta (2026-10-14: best 21%, played 1.9%) is best only by
  // noise: when it is, it gains −2.2 PV on the runner-up — its near-substitute
  // Tombarella de rescat, the star of the kit here (best 50%, played 42.5%).
  // The same detector edge as Esgrima's defenses (NEXT-STEPS §44.2, §45).
  acrobacia: ['esquiva-i-traveta'],
  // Cop de vida left this list 2026-10-14 (best 16%, played 3.7%, NEXT-STEPS §50).
};
