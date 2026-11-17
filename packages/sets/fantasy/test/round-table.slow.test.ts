/**
 * THE SET'S BALANCE TEST, THE SLOW TIER — the strategy triangle, round by
 * round (playtest `round-triangle.ts`; the user, 2026-11-15: "if the enemy
 * played an attack, you wished you played a defense, if the enemy played a
 * defense, you wished to have played a focus, if the enemy plays a focus, you
 * wished you had attack"). At each checkpoint, the round table: into both
 * enemies attacking, the best answer holding a defense must be clearly ahead
 * of the best one without; into both defending, a Focus; into both playing a
 * Focus, an attack. The nightly tier is `pool.nightly.test.ts`.
 *
 * Read the whole table with `tools/src/round-table.ts --set fantasy`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { pct, SMOKE } from '@pimpampum/bench';
import { measureRoundTriangle, PURE, STYLE_LEVELS, type RoundTriangleLevel } from '@pimpampum/playtest';

const SET = { module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bench/index.js'), export: 'FANTASY' };

/**
 * Edges known NOT to hold today, by `L<level> into <plan>` — asserted to
 * STILL fail, so the day one holds its test turns red and it leaves this list
 * rather than the finding being forgotten. Filled from the measurement, never
 * by guessing.
 */
const KNOWN_BROKEN: Record<string, string> = {
  'L3 into AA': 'both guarding 55% against AF 51% (240 round starts, 2026-11-17); the fantasy cards wait for their redesign (GOALS.md, "Every card is redesigned")',
  'L3 into FF': 'at level 3 an attack into a Focus (AF 55%) is not clearly ahead of playing a Focus back (50%) (240 round starts, 2026-11-17); the fantasy cards wait for their redesign',
  'L6 into AA': 'attacking back 53% against both guarding 51% (240 round starts, 2026-11-17)',
  'L10 into AA': 'one guard (AD) 55% against attacking back 50% (240 round starts, 2026-11-17)',
};

describe('the triangle, round by round', () => {
  let levels: RoundTriangleLevel[];
  beforeAll(async () => { levels = await measureRoundTriangle(SET, STYLE_LEVELS); });

  it('was measured: three edges a checkpoint', () => {
    expect(levels.map(l => l.edges.map(e => `L${l.level} into ${e.theirs}`))).toEqual(STYLE_LEVELS.map(level => PURE.map(p => `L${level} into ${p}`)));
  });

  for (const level of STYLE_LEVELS) for (const theirs of PURE) {
    const key = `L${level} into ${theirs}`;
    const known = key in KNOWN_BROKEN;
    it.skipIf(SMOKE)(`${known ? 'KNOWN to fail: ' : ''}${key}`, () => {
      const l = levels.find(x => x.level === level)!;
      const e = l.edges.find(x => x.theirs === theirs)!;
      const n = l.table.positions;
      const detail = `${key}: ${e.claimed} (holding ${e.counter}) ${pct(e.score, n)}, ${e.rival} ${pct(e.rivalScore, n)}, over ${n} round starts`;
      console.log(`${e.holds ? '✅' : '❌'} ${detail}`);
      if (known) expect(e.holds, `${key} now HOLDS — remove it from KNOWN_BROKEN. ${detail}`).toBe(false);
      else expect(e.holds, detail).toBe(true);
    });
  }
});
