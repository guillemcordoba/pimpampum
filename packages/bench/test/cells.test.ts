/**
 * THE CELL RUNNER'S PURE PARTS.
 */
import { describe, it, expect } from 'vitest';
import { roundPercentiles } from '../src/index.js';

describe('fight-length percentiles — what requirement 2 reads', () => {
  it('computes the median of a known list', () => {
    expect(roundPercentiles([1, 2, 3, 4, 5]).median).toBe(3);
  });

  it('uses NEAREST-RANK for p90, so it never interpolates a fight that did not happen', () => {
    // Ten fights: the 90th percentile is the tenth, the longest. Stating this
    // because an off-by-one in a percentile moves the number by one fight and
    // nothing ever looks wrong.
    expect(roundPercentiles([1, 1, 1, 1, 1, 1, 1, 1, 1, 40]).p90).toBe(40);
  });

  it('never indexes past the end', () => {
    // Math.floor(n * 0.9) reaches n for large n without the clamp.
    expect(roundPercentiles([7]).p90).toBe(7);
    expect(roundPercentiles([3, 9]).p90).toBe(9);
  });

  it('is empty-safe rather than NaN', () => {
    expect(roundPercentiles([])).toEqual({ median: 0, p90: 0 });
  });

  it('does not mutate its input — the caller still owns its rounds', () => {
    const rounds = [5, 1, 3];
    roundPercentiles(rounds);
    expect(rounds).toEqual([5, 1, 3]);
  });
});

