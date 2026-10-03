/**
 * REQUIREMENT 2 — the power band, with a control on each side of it and one
 * inside: the neutral stand-in itself, which is also the analyzer's A/A test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { expectWellFormed, GAMES, run, SMOKE } from './budgets.js';

describe('the power band', () => {
  let strong: KitReport, weak: KitReport, copy: KitReport;
  beforeAll(async () => {
    [strong, weak, copy] = await Promise.all([
      run('strongKit', [], GAMES), run('weakKit', [], GAMES), run('standInCopyKit', [], GAMES),
    ]);
  });

  it('produces whole reports', () => {
    expectWellFormed(strong, 3); expectWellFormed(weak, 3);
    expect(copy.cards.length).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)('a strictly bigger kit is clearly ABOVE the band', () => {
    expect(strong.strength.ok, strong.strength.detail).toBe(false);
    expect(strong.strength.band!.delta).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)('a strictly smaller kit is clearly BELOW it', () => {
    expect(weak.strength.ok, weak.strength.detail).toBe(false);
    expect(weak.strength.band!.delta).toBeLessThan(0);
  });

  it.skipIf(SMOKE)('A/A: the neutral stand-in, measured as a subject, scores zero — and is in band', () => {
    const { delta, stderr } = copy.strength.band!;
    expect(copy.strength.ok, copy.strength.detail).toBe(true);
    expect(Math.abs(delta), copy.strength.detail).toBeLessThan(3 * stderr);
  });
});
