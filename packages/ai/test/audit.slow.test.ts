/**
 * THE AUDIT ON A SMALL SEEDED BATCH — end to end, and the one thing the
 * referee samples (chance) held to account: the same position under three
 * referee seeds.
 *
 * The batch size reads `GAMES` (the smoke run sets it to 2). This package sits
 * below bench and cannot import its `games()`.
 */
import { describe, it, expect } from 'vitest';
import { Referee, buildEngine, checkPosition, generatePosition } from '../src/audit/index.js';

const N = Math.max(2, Number(process.env.GAMES ?? 12));

describe('the audit, end to end', () => {
  it('solves every position of a small seeded batch, and every verdict is well formed', () => {
    for (let seed = 1; seed <= N; seed++) {
      const r = checkPosition(generatePosition(seed, { shape: seed % 2 ? '2x1' : '1x2', cards: 3, roundsLeft: 2 }));
      expect(r.solved, `seed ${seed}: ${r.error}`).toBe(true);
      for (const p of r.picks) {
        expect(p.eqProb).toBeGreaterThanOrEqual(-1e-9);
        expect(p.eqProb).toBeLessThanOrEqual(1 + 1e-9);
        // Nothing can beat the game value against the equilibrium opponent.
        expect(p.loss).toBeGreaterThan(-1e-6);
      }
      const total = (r.eqCards ?? []).map(m => Object.values(m).reduce((a, b) => a + b, 0));
      for (const t of total) expect(t).toBeCloseTo(1, 6);
    }
  });

  it('the referee\'s value moves little between seeds', () => {
    let sq = 0;
    let n = 0;
    for (let seed = 1; seed <= N; seed++) {
      const state = buildEngine(generatePosition(seed, { shape: '2x1', cards: 3, roundsLeft: 2 }), { actionChooser: () => null });
      const vals = [1, 2, 3].map(s => new Referee({ seed: s }).solve(state, 0).value);
      const m = vals.reduce((a, b) => a + b, 0) / 3;
      for (const v of vals) { sq += (v - m) ** 2; n++; }
    }
    // The bar the check's ε and confirmation are sized against (§51). A spread
    // over two positions (the smoke run) is noise itself: it only has to run.
    if (N >= 12) expect(Math.sqrt(sq / (n - n / 3))).toBeLessThan(3);
  });
});
