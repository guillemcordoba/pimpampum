/**
 * THE AUDIT ON A SMALL SEEDED BATCH — end to end, and the two approximations
 * the referee leans on held to account:
 *
 *  - DOUBLE ORACLE against full enumeration, on positions small enough for
 *    both: the values must agree;
 *  - the referee's sampling noise: the same position under three referee seeds.
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
      const r = checkPosition(generatePosition(seed, { shape: seed % 2 ? '2x1' : '1x2', cards: 3, roundsLeft: 3 }));
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

  it('double oracle finds the value full enumeration finds', () => {
    let worst = 0;
    for (let seed = 1; seed <= N; seed++) {
      const pos = generatePosition(seed, { shape: '2x1', cards: 3, roundsLeft: 2 });
      const state = buildEngine(pos, { actionChooser: () => null });
      const full = new Referee({ maxJoint: 1e9 }).solve(state, 0).value;
      const oracle = new Referee({ maxJoint: 1 }).solve(state, 0).value;
      worst = Math.max(worst, Math.abs(full - oracle));
    }
    // Same samples, same cells: the oracle can only differ by missing a best
    // response. Measured 0.04 PV rms on 10 positions (2026-10-14).
    expect(worst).toBeLessThan(1);
  });

  it('the referee\'s value moves little between seeds', () => {
    let sq = 0;
    let n = 0;
    for (let seed = 1; seed <= N; seed++) {
      const state = buildEngine(generatePosition(seed, { shape: '2x1', cards: 3, roundsLeft: 3 }), { actionChooser: () => null });
      const vals = [1, 2, 3].map(s => new Referee({ seed: s }).solve(state, 0).value);
      const m = vals.reduce((a, b) => a + b, 0) / 3;
      for (const v of vals) { sq += (v - m) ** 2; n++; }
    }
    // The bar the check's ε and confirmation are sized against (§51).
    expect(Math.sqrt(sq / (n - n / 3))).toBeLessThan(3);
  });
});
