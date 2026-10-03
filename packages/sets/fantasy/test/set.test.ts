/**
 * THE FANTASY SET AS A WHOLE, cheaply — equal-budget mirrors at depth 0 (a
 * mirror is 50/50 at any depth, and depth 0 keeps this in the fast tier).
 */
import { describe, it, expect } from 'vitest';
import { newCombatStats, withSeed } from '@pimpampum/engine';
import { randomTeam, runMatch, stderr } from '@pimpampum/bench';

const SEED = 20260920;
const MAX_ROUNDS = 40;
/**
 * A duration REGRESSION bar, not the design target (intentions.md wants ~5
 * rounds; depth-0 play runs longer than depth 1). Checked to be below the cap,
 * because an earlier version compared against the cap and asserted nothing.
 */
const DURATION_REGRESSION_CEILING = 15;

describe('equal-budget mirrors', () => {
  it('are a coin flip — the A/A test on real content', () => {
    let a = 0, b = 0;
    withSeed(SEED, () => {
      for (let i = 0; i < 600; i++) {
        const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), undefined, MAX_ROUNDS, 0);
        if (w === 0) a++; else if (w === 1) b++;
      }
    });
    const rate = a / (a + b);
    expect(Math.abs(rate - 0.5), `team A won ${(rate * 100).toFixed(1)}% of decided mirrors`)
      .toBeLessThan(4 * stderr(0.5, a + b));
  });

  it('end in a reasonable number of rounds', () => {
    const stats = newCombatStats();
    withSeed(SEED, () => {
      for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), stats, MAX_ROUNDS, 0);
    });
    const avg = stats.rounds / stats.combats;
    expect(avg).toBeGreaterThan(1.5);
    expect(avg, `mirror fights average ${avg.toFixed(1)} rounds (design target ~5)`).toBeLessThan(DURATION_REGRESSION_CEILING);
    expect(DURATION_REGRESSION_CEILING).toBeLessThan(MAX_ROUNDS);
  });

  it('see all three kinds of action played', () => {
    const stats = newCombatStats();
    withSeed(SEED, () => {
      for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 3, 7), randomTeam('B', 3, 7), stats, MAX_ROUNDS, 0);
    });
    for (const type of ['Atac', 'Defensa', 'Focus']) expect(stats.actionTypePlays[type] ?? 0, type).toBeGreaterThan(0);
  });
});
