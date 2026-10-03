/**
 * REQUIREMENT 4 — THE STRATEGY TRIANGLE (intentions.md): Power beats Protect,
 * Protect beats Aggro, Aggro beats Power. Each corner is production play
 * LEANING to one action type on half its rounds (`bench` `leaning`), fought
 * against the next corner in mirror matches; every edge must CLEARLY beat an
 * even duel (`triangleVerdict`).
 *
 * Set-level, not per kit: it is about how two sides' styles meet, so it needs
 * hero-against-hero fights. The measurement's own controls — an edge that
 * exists, the same edge backwards, an A/A duel — are playtest's
 * (`controls-triangle.slow.test.ts`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { isolated, pct, SMOKE } from '@pimpampum/bench';
import type { TriangleReport } from '@pimpampum/playtest';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'triangle.work.ts');

/**
 * Edges known NOT to hold today — asserted to STILL fail, so the day one
 * holds its test turns red and it leaves this list rather than the finding
 * being forgotten. Filled from the measurement, never by guessing.
 */
// Aggro > Power: Power (focus-leaning) wins 77% (2026-10-03, NEXT-STEPS §27.3)
// — focus play beats both other corners, as §22.1 found with hard restrictions.
// Protect > Aggro: held at 58% until the calibration refresh of the same day
// fielded the reviewed berserk (no Cop d'espatlla); 47% since.
const KNOWN_BROKEN = new Set<string>(['Aggro > Power', 'Protect > Aggro']);

describe('the strategy triangle', () => {
  let t: TriangleReport;
  beforeAll(async () => { t = await isolated<TriangleReport>(WORK, 'triangle'); });

  it('was measured: three edges', () => {
    expect(t.edges.map(e => `${e.winner} > ${e.loser}`)).toEqual(['Power > Protect', 'Protect > Aggro', 'Aggro > Power']);
  });

  for (const edge of ['Power > Protect', 'Protect > Aggro', 'Aggro > Power']) {
    const known = KNOWN_BROKEN.has(edge);
    it.skipIf(SMOKE)(`${known ? 'KNOWN to fail: ' : ''}${edge}`, () => {
      const e = t.edges.find(x => `${x.winner} > ${x.loser}` === edge)!;
      const detail = `${edge}: ${pct(e.winrate, e.games)} over ${e.games} mirror fights`;
      console.log(`${t.broken.includes(edge) ? '❌' : '✅'} ${detail}`);
      if (known) expect(t.broken, `${edge} now HOLDS — remove it from KNOWN_BROKEN. ${detail}`).toContain(edge);
      else expect(t.broken, detail).not.toContain(edge);
    });
  }
});
