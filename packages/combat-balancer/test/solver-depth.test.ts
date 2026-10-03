/**
 * A CLAMP IS A CLAIM ABOUT THE REAL DEPTH. The solver steers with a cheap AI
 * and reports at the real one; when the cheap one decided no PV reached the
 * target, that verdict went out unchecked — and on bone devils it was wrong by
 * the whole range (NEXT-STEPS §26). Here the two AIs disagree by construction
 * (`bait`): the depth-0 party plays a do-nothing card all fight and loses at
 * any PV; the depth-1 party ignores it and wins easily.
 */
import { describe, it, expect } from 'vitest';
import { solveEncounter } from '../src/index.js';
import { CONTENT } from './content.js';

describe('solveEncounter at depth 1, with a search AI that is badly wrong', () => {
  it("does not report the search AI's clamp — it solves at the real depth", () => {
    const r = solveEncounter(CONTENT, [{ enemyId: 'rat', count: 2 }], { heroes: 2, bait: true }, 0.6,
      { aiDepth: 1, searchGames: 60, games: 300 })!;
    expect(r.clamped, `pv ${r.groups[0].pv}, reported ${r.predictedWinrate}`).toBe(false);
    expect(r.groups[0].pv).toBeGreaterThan(1);
    expect(Math.abs(r.missBy)).toBeLessThan(0.15);
  });
});
