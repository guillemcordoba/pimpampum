import { describe, it, expect } from 'vitest';
import {
  newCombatStats, CombatEngine, setAIControlled, withSeed,
} from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { randomTeam, runMatch, theRegistry } from '@pimpampum/bench';

/** Seeded, so a failure here is reproducible rather than a coin that came up
 *  badly. Team generation runs through the engine's rng (bench/arena.ts), so
 *  this binds the whole suite. */
const SEED = 20260920;
/** The engine cap these matches run under. */
const MAX_ROUNDS = 40;
/**
 * Duration REGRESSION bar — not the design target.
 *
 * intentions.md wants ~5 rounds; depth-1 mirrors measure ~5.0 and the depth-0
 * play this test uses for speed runs longer. 15 is comfortably above that and
 * comfortably below MAX_ROUNDS, so it catches a real blow-up while the ≤5 work
 * is still open. The assertion below also checks it is BELOW the cap, because
 * the previous version of this test compared against the cap itself and
 * therefore asserted nothing at all.
 */
const DURATION_REGRESSION_CEILING = 15;

describe('engine sanity', () => {
  it('every combat terminates with a valid winner and PV stays in range', () => {
    for (let i = 0; i < 60; i++) {
      const a = randomTeam('A', 2, 6);
      const b = randomTeam('B', 2, 6);
      setAIControlled(a);
      setAIControlled(b);
      const res = new CombatEngine(a, b, { registry: theRegistry(), maxRounds: 50, ...aiPolicy({ depth: 0 }) }).runCombat();
      expect(res.rounds).toBeGreaterThan(0);
      expect([0, 1, null]).toContain(res.winner);
      for (const c of [...a, ...b]) {
        expect(c.currentPV).toBeGreaterThanOrEqual(0);
        expect(c.currentPV).toBeLessThanOrEqual(c.maxPV);
      }
    }
  });
});

describe('mirror balance (equal skill budgets)', () => {
  it('2v2 equal-budget teams win close to 50/50', () => {
    let aWins = 0, bWins = 0;
    const N = 600;
    withSeed(SEED, () => {
      for (let i = 0; i < N; i++) {
        const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), undefined, MAX_ROUNDS, 0);
        if (w === 0) aWins++; else if (w === 1) bWins++;
      }
    });
    const rate = aWins / (aWins + bWins);
    expect(rate).toBeGreaterThan(0.40);
    expect(rate).toBeLessThan(0.60);
  });

  it('average combat length is reasonable', () => {
    const stats = newCombatStats();
    // Symmetry and action-mix checks: depth 0 keeps the suite fast, and a
    // mirror is 50/50 at any depth.
    withSeed(SEED, () => {
      for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), stats, MAX_ROUNDS, 0);
    });
    const avg = stats.rounds / stats.combats;
    expect(avg).toBeGreaterThan(1.5);
    // This used to assert `avg < 40` against a 40-round cap — an assertion that
    // could not fail, dressed as the duration guard. The real target is
    // intentions.md's ~5 rounds; the ceiling here is a REGRESSION bar well
    // clear of the measured mirror length (~5 at depth 1, longer at depth 0),
    // not the design target. Tighten it towards 5 as the duration work lands.
    expect(avg, `mirror fights average ${avg.toFixed(1)} rounds (design target ~5)`)
      .toBeLessThan(DURATION_REGRESSION_CEILING);
    expect(DURATION_REGRESSION_CEILING).toBeLessThan(MAX_ROUNDS);   // never vacuous again
  });

  it('all three action types see play', () => {
    const stats = newCombatStats();
    withSeed(SEED, () => {
      for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 3, 7), randomTeam('B', 3, 7), stats, MAX_ROUNDS, 0);
    });
    expect(stats.actionTypePlays['Atac'] ?? 0).toBeGreaterThan(0);
    expect(stats.actionTypePlays['Defensa'] ?? 0).toBeGreaterThan(0);
    expect(stats.actionTypePlays['Focus'] ?? 0).toBeGreaterThan(0);
  });
});

