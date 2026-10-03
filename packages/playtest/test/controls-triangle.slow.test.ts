/**
 * REQUIREMENT 4 — the strategy triangle's measurement, on styles whose order
 * is known before anything is played: it must find an edge that exists, must
 * not find one read backwards, and must find none in an A/A duel. The real
 * triangle is the set's (`sets/fantasy/test/triangle.slow.test.ts`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { games, isolated } from '@pimpampum/bench';
import type { TriangleReport } from '../src/index.js';
import { SMOKE } from './budgets.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'triangle.work.ts');

describe('the triangle measurement', () => {
  let known: TriangleReport, self: TriangleReport;
  beforeAll(async () => {
    [known, self] = await Promise.all([
      isolated<TriangleReport>(WORK, 'knownOrder', [games(200)]),
      isolated<TriangleReport>(WORK, 'selfDuel', [games(40)]),
    ]);
  });

  it('produces an edge per style', () => {
    expect(known.edges.map(e => `${e.winner}>${e.loser}`)).toEqual(['thinking>random', 'random>thinking']);
    expect(self.edges).toHaveLength(2);
  });

  it.skipIf(SMOKE)('finds the edge that exists: thinking beats random cards', () => {
    expect(known.broken, JSON.stringify(known.edges)).not.toContain('thinking > random');
  });

  it.skipIf(SMOKE)('cannot read the same duel backwards — the verdict fails on the reversed edge', () => {
    expect(known.ok).toBe(false);
    expect(known.broken).toEqual(['random > thinking']);
  });

  it.skipIf(SMOKE)('A/A: a style against itself holds no edge either way', () => {
    expect(self.ok).toBe(false);
    expect(self.broken).toHaveLength(2);
  });
});
