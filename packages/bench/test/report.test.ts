/**
 * THE REPORT MATHS, checked against closed forms and textbook values — before
 * any number this package prints is trusted.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deltaPP, deltaStderr, exact, gamesFor, maxOfKBias, pct, pctCoarse, pp, share, significant, stderr,
} from '../src/index.js';

const rate = fc.double({ min: 0.02, max: 0.98, noNaN: true });
const n = fc.integer({ min: 10, max: 100_000 });

describe('the error of a rate', () => {
  it('is the binomial √(p(1−p)/n)', () => {
    expect(stderr(0.5, 100)).toBeCloseTo(0.05, 12);
    expect(stderr(0.2, 400)).toBeCloseTo(0.02, 12);
    fc.assert(fc.property(rate, n, (p, k) => {
      if (p * (1 - p) < 0.01) return;
      expect(stderr(p, k)).toBeCloseTo(Math.sqrt(p * (1 - p) / k), 12);
    }));
  });

  it('never quotes ±0 at the extremes — a 0% cell is "we saw nothing", not certainty', () => {
    expect(stderr(0, 300)).toBeGreaterThan(0);
    expect(stderr(1, 300)).toBe(stderr(0, 300));
    expect(pct(1, 300)).toMatch(/±[1-9]|±0\.[1-9]/);
  });

  it('shrinks as the sample grows, by √n', () => {
    fc.assert(fc.property(rate, n, (p, k) => {
      expect(stderr(p, 4 * k)).toBeCloseTo(stderr(p, k) / 2, 12);
    }));
  });

  it('refuses a sample of nothing rather than inventing precision', () => {
    expect(stderr(0.5, 0)).toBeNaN();
  });
});

describe('the error of a difference', () => {
  it('adds in quadrature, so it is wider than either side', () => {
    fc.assert(fc.property(rate, n, rate, n, (a, na, b, nb) => {
      const d = deltaStderr(a, na, b, nb);
      expect(d).toBeCloseTo(Math.hypot(stderr(a, na), stderr(b, nb)), 12);
      expect(d).toBeGreaterThanOrEqual(stderr(a, na));
      expect(d).toBeGreaterThanOrEqual(stderr(b, nb));
    }));
  });

  it('decides significance at the sigmas asked for, and symmetrically', () => {
    expect(significant(0.52, 300, 0.50, 300)).toBe(false);
    expect(significant(0.70, 300, 0.50, 300)).toBe(true);
    fc.assert(fc.property(rate, n, rate, n, (a, na, b, nb) => {
      expect(significant(a, na, b, nb)).toBe(significant(b, nb, a, na));
      expect(significant(a, na, b, nb)).toBe(Math.abs(a - b) > 2 * deltaStderr(a, na, b, nb));
    }));
  });
});

describe('sample sizes', () => {
  it('gamesFor is exactly enough: at that n, the bar is 2σ of a coin-flip difference', () => {
    fc.assert(fc.property(fc.double({ min: 0.5, max: 40, noNaN: true }), bar => {
      const k = gamesFor(bar);
      expect(2 * deltaStderr(0.5, k, 0.5, k)).toBeLessThanOrEqual(bar / 100 + 1e-12);
      expect(2 * deltaStderr(0.5, k - 1, 0.5, k - 1)).toBeGreaterThan(bar / 100 - 1e-9);
    }));
  });

  it('agrees with the sample size the docs quote for a 3pp level step', () => {
    expect(gamesFor(3)).toBe(2223);
  });

  it('a finer bar always costs more', () => {
    fc.assert(fc.property(fc.double({ min: 0.5, max: 40, noNaN: true }), bar => {
      expect(gamesFor(bar / 2)).toBeGreaterThanOrEqual(gamesFor(bar));
    }));
  });
});

describe("winner's curse", () => {
  it('matches the expected maximum of k standard normals', () => {
    // E[max of k iid N(0,1)] — tabulated values (Harter 1961).
    const table: [number, number][] = [[2, 0.5642], [3, 0.8463], [5, 1.1630], [10, 1.5388], [20, 1.8675]];
    // Blom's approximation is worst at k=2 (0.589 against 0.564); 0.03σ is far
    // below anything a report could resolve.
    for (const [k, want] of table) expect(Math.abs(maxOfKBias(k) - want)).toBeLessThan(0.03);
    expect(maxOfKBias(1)).toBe(0);
  });

  it('grows with k', () => {
    for (let k = 2; k < 40; k++) expect(maxOfKBias(k + 1)).toBeGreaterThan(maxOfKBias(k));
  });
});

describe('formatting', () => {
  it('a winrate always carries its interval', () => {
    expect(pct(0.615, 300)).toBe(' 61.5%±2.8');
    expect(pctCoarse(0.615, 300)).toBe('62%±3');
    expect(pctCoarse(0.615, 30000)).toBe('61.5%±0.3');
  });

  it('a difference carries its sign and its own interval', () => {
    expect(deltaPP(0.6, 300, 0.5, 300)).toBe('+10.0pp±4.0');
    expect(deltaPP(0.5, 300, 0.6, 300)).toBe('-10.0pp±4.0');
    expect(pp(0.034)).toBe('+3.4pp');
  });

  it('exact and share say which kind of percentage they are', () => {
    expect(exact(0.6)).toBe('60%');
    expect(share(3, 10)).toBe(pct(0.3, 10));
    expect(share(0, 0)).toBe('    —');
  });
});
