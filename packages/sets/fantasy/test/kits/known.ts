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
  // Inherits Segellar la ferida's slot and its signature: a small heal that
  // the card value calls best mostly where a won fight's mop-up saves a few PV
  // (best 18%, gaining only +1.1 PV when best) and the search, which scores a
  // win as a win, does not (NEXT-STEPS §48.2). Fantasy's shapes leave few
  // efectes negatius on heroes to cleanse. Not re-probed (NEXT-STEPS §50).
  'mestre-del-xi': ['desbloquejar-el-cos'],
  // Best where the launched attack lands before the goblins' Amagar-se
  // (speed 2) and breaks it. The search's rollouts model the goblins at depth
  // 0, which hides ~1% of the time where the real (depth-1) goblins hide ~40%,
  // so the search almost never sees a hide to break (NEXT-STEPS §49.3).
  // Tombarella de rescat left this list on the same run (best 28%, played 6.9%).
  acrobacia: ['trampoli-de-mans'],
};
