/**
 * REQUIREMENT 4 — the triangle round by round, on control kits whose answer
 * follows from their construction (`control-kits.ts`), on the real engine:
 * every hero on both sides holds the kit. A kit where attacking simply wins
 * must be red, into both attacking and into both defending; a kit built as
 * the triangle must be green on all three edges. The real triangle is each
 * set's (`sets/<set>/test/round-table.slow.test.ts`); the verdict's rules on
 * made-up tables are `pool.test.ts`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { games } from '@pimpampum/bench';
import { measureRoundTriangle, ROUND_POSITIONS, type RoundTriangleLevel } from '../src/index.js';
import { SMOKE, SYNTHETIC_MODULE } from './budgets.js';

const SET = { module: SYNTHETIC_MODULE, export: 'SYNTHETIC' };
const show = (l: RoundTriangleLevel) => l.edges.map(e => `into ${e.theirs}: ${e.claimed} ${Math.round(100 * e.score)}%, ${e.rival} ${Math.round(100 * e.rivalScore)}%`).join('; ');

describe('the round table on control kits', () => {
  let attack: RoundTriangleLevel, triangle: RoundTriangleLevel;
  beforeAll(async () => {
    const positions = games(ROUND_POSITIONS);
    [[attack], [triangle]] = await Promise.all([
      measureRoundTriangle(SET, [3], { control: 'attackWinsKit', positions }),
      measureRoundTriangle(SET, [3], { control: 'triangleKit', positions }),
    ]);
  });

  it('measured three edges for each', () => {
    expect(attack.edges.map(e => e.theirs)).toEqual(['AA', 'DD', 'FF']);
    expect(triangle.edges.map(e => e.theirs)).toEqual(['AA', 'DD', 'FF']);
  });

  it.skipIf(SMOKE)('is red where attacking simply wins: no defense answers an attack, no Focus a defense', () => {
    expect(attack.ok, show(attack)).toBe(false);
    expect(attack.edges.filter(e => !e.holds).map(e => e.theirs), show(attack)).toEqual(['AA', 'DD']);
  });

  it.skipIf(SMOKE)('is green on a kit built as the triangle', () => {
    expect(triangle.broken, show(triangle)).toEqual([]);
  });
});
