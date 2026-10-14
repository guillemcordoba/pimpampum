/**
 * THE AUDIT'S OWN GROUND TRUTH — the solver on games whose equilibrium is
 * known, the referee on hand-made fights whose answer is arithmetic, and the
 * fixtures: positions where the audit once caught the AI out.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTROLS, Referee, aiPicks, buildEngine, checkPosition, exploitability, generatePosition, signature,
  solveByRegretMatching, solveZeroSum, ARCHETYPES, type Position,
} from '../src/audit/index.js';

describe('the zero-sum solver', () => {
  it('rock-paper-scissors: value 0, a third each', () => {
    const s = solveZeroSum([[0, -1, 1], [1, 0, -1], [-1, 1, 0]]);
    expect(s.value).toBeCloseTo(0, 9);
    for (const p of [...s.row, ...s.col]) expect(p).toBeCloseTo(1 / 3, 9);
  });

  it('matching pennies: value 0, half each', () => {
    const s = solveZeroSum([[1, -1], [-1, 1]]);
    expect(s.value).toBeCloseTo(0, 9);
    for (const p of [...s.row, ...s.col]) expect(p).toBeCloseTo(0.5, 9);
  });

  it('a 2x3 game solved by hand: value 8/5, rows 3/5–2/5, columns 0–1/5–4/5', () => {
    const s = solveZeroSum([[3, 0, 2], [0, 4, 1]]);
    expect(s.value).toBeCloseTo(1.6, 9);
    expect(s.row[0]).toBeCloseTo(0.6, 9);
    expect(s.col).toEqual([expect.closeTo(0, 9), expect.closeTo(0.2, 9), expect.closeTo(0.8, 9)]);
  });

  it('a saddle point is a pure strategy', () => {
    const s = solveZeroSum([[4, 2, 5], [3, 1, 0], [6, 2, 3]]);
    expect(s.value).toBeCloseTo(2, 9);
    expect(exploitability([[4, 2, 5], [3, 1, 0], [6, 2, 3]], s)).toBeLessThan(1e-9);
  });

  it('duplicate rows and columns change nothing', () => {
    const a = solveZeroSum([[0, -1, 1], [1, 0, -1], [-1, 1, 0], [0, -1, 1]]);
    expect(a.value).toBeCloseTo(0, 9);
    expect(a.row[0] + a.row[3]).toBeCloseTo(1 / 3, 9);
  });

  it('on any matrix it returns an equilibrium, and regret matching agrees on the value', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 7 }), fc.integer({ min: 1, max: 7 }),
      fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 49, maxLength: 49 }),
      (m, n, xs) => {
        const a = Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => xs[i * 7 + j]));
        const s = solveZeroSum(a);
        expect(exploitability(a, s)).toBeLessThan(1e-6);
        expect(s.row.reduce((p, q) => p + q, 0)).toBeCloseTo(1, 9);
        expect(solveByRegretMatching(a, 4000).value).toBeCloseTo(s.value, 0);
      },
    ), { numRuns: 200 });
  });
});

describe('the referee on hand-made fights', () => {
  for (const c of CONTROLS) {
    it(`${c.position.id}: ${c.answer}, worth ${c.value}`, () => {
      const root = new Referee().solve(buildEngine(c.position, { actionChooser: () => null }), 0);
      expect(root.value).toBeCloseTo(c.value, 6);
      const hero = buildEngine(c.position, { actionChooser: () => null }).teams[0][0];
      const played = root.rows.map((r, i) => ({ arch: hero.actions[r[0].actionIdx].def.id.split('.')[0], p: root.sol.row[i] }));
      const onAnswer = played.filter(x => x.arch === c.answer).reduce((s, x) => s + x.p, 0);
      expect(onAnswer).toBeCloseTo(1, 6);
    });
  }

  it('a fight the cap cuts is scored at the cap, never further', () => {
    // bomb-long has two rounds left: a bomb planted in the second never lands.
    const c = CONTROLS.find(x => x.position.id === 'bomb-long')!;
    const longer: Position = { ...c.position, roundsLeft: 3 };
    const v2 = new Referee().solve(buildEngine(c.position, { actionChooser: () => null }), 0).value;
    const v3 = new Referee().solve(buildEngine(longer, { actionChooser: () => null }), 0).value;
    expect(v3).not.toBeCloseTo(v2, 3);
  });
});

describe('the generator', () => {
  it('is a pure function of its seed', () => {
    expect(generatePosition(77, { shape: '2x2', cards: 3 })).toEqual(generatePosition(77, { shape: '2x2', cards: 3 }));
  });

  it('never deals a card whose payoff the fight cannot see', () => {
    for (let s = 1; s <= 200; s++) {
      const pos = generatePosition(s, { maxRounds: 4 });
      const horizons = pos.teams.flat().flatMap(f => f.cards.map(c => ARCHETYPES[c.arch].horizon(c.p)));
      expect(Math.max(...horizons)).toBeLessThanOrEqual(Math.max(1, pos.roundsLeft - 1));
      expect(pos.tags.horizon).toBeLessThanOrEqual(pos.roundsLeft);
    }
  });

  it('a built position matches its spec, and a clone has the same signature', () => {
    const pos = generatePosition(5, { shape: '2x1', cards: 3 });
    const e = buildEngine(pos, { actionChooser: () => null });
    expect(e.teams[0].map(c => c.currentPV)).toEqual(pos.teams[0].map(f => f.pv));
    expect(signature(e.clone())).toBe(signature(e));
  });
});

describe('the check', () => {
  it('a referee seed reproduces its verdict exactly', () => {
    const pos = generatePosition(3, { shape: '1x1', cards: 3, roundsLeft: 3 });
    const a = checkPosition(pos, { confirm: 0 });
    const b = checkPosition(pos, { confirm: 0 });
    expect(a.value).toBe(b.value);
    expect(a.picks).toEqual(b.picks);
  });
});

// --- fixtures: positions where the audit caught the AI out -------------------

interface Fixture {
  id: string; todo: boolean; position: Position;
  combos: { actions: number[]; cards: string[]; eqProb: number; loss: number }[];
}
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-fixtures.json');
const fixtures: Fixture[] = fs.existsSync(FIXTURES) ? JSON.parse(fs.readFileSync(FIXTURES, 'utf8')) : [];
/** What a fixture rules out: combinations the equilibrium never plays that
 *  lose more than this against it. The audit's own ε. */
const EPSILON = 0.5;

describe('the AI is not a mismatch where the audit once found one', () => {
  it('the fixture file parses', () => { expect(Array.isArray(fixtures)).toBe(true); });
  for (const f of fixtures) {
    // OPEN fixtures are `todo` until the AI is fixed, so this tier stays
    // green; flip `todo` to false in the JSON once it passes, and it guards
    // the fix from then on.
    if (f.todo) { it.todo(`${f.id} (open)`); continue; }
    it(f.id, () => {
      const ruledOut = new Set(f.combos.filter(c => c.eqProb < 0.02 && c.loss > EPSILON).map(c => c.actions.join(',')));
      for (const [key, p] of aiPicks(f.position, 4)) {
        expect(ruledOut.has(key), `the AI played ${key} (${p.count}/4 seeds), which the referee rules out`).toBe(false);
      }
    });
  }
});
