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
 * Read the whole table with `tools/src/round-table.ts --set elements`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { pct, SMOKE } from '@pimpampum/bench';
import { measureRoundTriangle, PURE, STYLE_LEVELS, type RoundTriangleLevel } from '@pimpampum/playtest';

const SET = { module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bench/index.js'), export: 'ELEMENTS' };

/**
 * Edges known NOT to hold today, by `L<level> into <plan>` — asserted to
 * STILL fail, so the day one holds its test turns red and it leaves this list
 * rather than the finding being forgotten. Filled from the measurement, never
 * by guessing.
 */
const KNOWN_BROKEN: Record<string, string> = {
  'L3 into AA': 'attacks add up (rules.md, 2026-11-13): into both attacking, one guard (AD) scores 64% against 58% for attacking back (240 round starts, 2026-11-17; GOALS.md goal 1)',
  'L6 into AA': 'one guard (AD) 56% against attacking back 53% (240 round starts, 2026-11-17); no candidate rule makes a defense clearly the answer at level 6 (GOALS.md goal 1)',
  'L10 into AA': 'attacking back 50% against one guard (AD) 38% (240 round starts, 2026-11-17); no candidate rule makes a defense clearly the answer at level 10 (GOALS.md goal 1)',
  'L10 into DD': 'into both guarding, attacking (AA 66%) scores about as well as a Focus (FF 69%) (240 round starts, 2026-11-17)',
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
