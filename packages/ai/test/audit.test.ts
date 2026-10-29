/**
 * THE AUDIT'S OWN GROUND TRUTH — the solver on games whose equilibrium is
 * known, the referee on hand-made fights whose answer is arithmetic, and the
 * fixtures: positions where the audit once caught the AI out.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CombatEngine, EffectRegistry, randomInt, withSeed, type Character, type StatusBehavior } from '@pimpampum/engine';
import { attackCard, fighter, focusCard } from '@pimpampum/engine/testing';
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

  // Fixed dice, so the value is arithmetic. The hero's fast 4 fells either foe
  // before it swings; it must take the 4-PV one that hits for 8, not the
  // weakest: hero 10 − 1, foes 3 → +6. Aimed at the weakest: hero 10 − 8, foes 4 → −2.
  const strike = (n: number, fast = false) => ({ arch: 'strike', p: { n, s: 1, fast: fast ? 1 : 0, fatigue: 0 } });
  const body = (name: string, pv: number, cards: ReturnType<typeof strike>[]) =>
    ({ name, maxPv: pv, pv, armour: 0, level: 0, fatigue: 0, cards });
  const aiming = (hero: ReturnType<typeof body>[], foes: ReturnType<typeof body>[]): Position =>
    ({ id: 'aim', roundsLeft: 1, teams: [hero, foes], tags: { shape: `${hero.length}x${foes.length}`, horizon: 1, side: 'hero' } });

  it('every in-round decision is the seat\'s own: it aims at the foe that matters, not the weakest', () => {
    const pos = aiming([body('H', 10, [strike(4, true)])], [body('F1', 3, [strike(1)]), body('F2', 4, [strike(8)])]);
    expect(new Referee().solve(buildEngine(pos, { actionChooser: () => null }), 0).value).toBeCloseTo(6, 9);
  });

  it('the other side decides against you: the foe aims where it hurts most', () => {
    // The foe's fast 5 fells the 5-PV hero who hits for 9 before he swings, not
    // the 4-PV one who hits for 1: 4 + 0 − (20 − 1) = −15. At the weakest:
    // 0 + 5 − (20 − 9) = −6.
    const pos = aiming([body('A', 4, [strike(1)]), body('B', 5, [strike(9)])], [body('F', 20, [strike(5, true)])]);
    expect(new Referee().solve(buildEngine(pos, { actionChooser: () => null }), 0).value).toBeCloseTo(-15, 9);
  });

  it('greedy decisions (the rest of the round at random) still find both aims: +6 and −15', () => {
    const hero = aiming([body('H', 10, [strike(4, true)])], [body('F1', 3, [strike(1)]), body('F2', 4, [strike(8)])]);
    const foe = aiming([body('A', 4, [strike(1)]), body('B', 5, [strike(9)])], [body('F', 20, [strike(5, true)])]);
    const greedy = (pos: Position) => new Referee({ decisions: 'greedy' }).solve(buildEngine(pos, { actionChooser: () => null }), 0).value;
    expect(greedy(hero)).toBeCloseTo(6, 9);
    expect(greedy(foe)).toBeCloseTo(-15, 9);
  });

  it('the AI\'s own aiming is judged where it aims: the right aim loses nothing, and the worth of each aim is the arithmetic', () => {
    const pos = aiming([body('H', 10, [strike(4, true)])], [body('F1', 3, [strike(1)]), body('F2', 4, [strike(8)])]);
    const state = buildEngine(pos, { actionChooser: () => null });
    const row = [{ idx: 0, actionIdx: 0 }];
    const col = [{ idx: 0, actionIdx: 0 }, { idx: 1, actionIdx: 0 }];
    const aimAt = (i: number) => (_e: unknown, _a: unknown, _d: unknown, _r: unknown, _c: number, pool: Character[]) => [pool[i]];
    for (const [i, loss] of [[0, 8], [1, 0]] as const) {
      const [v] = new Referee().judgeAims(state, row, col, 0, 4, aimAt(i));
      expect(v.options.map(o => o.mean)).toEqual([-2, 6]);
      expect(v.loss).toBeCloseTo(loss, 9);
    }
  });

  it('enumerating chance, the value is the exact expectation: a 1d2 blow is worth 1.5, not a sample of it', () => {
    const d2 = { arch: 'strike', p: { n: 1, s: 2, fast: 0, fatigue: 0 } };
    const pos = aiming([body('H', 10, [d2 as ReturnType<typeof strike>])], [body('F', 10, [strike(1)])]);
    const root = new Referee({ chance: 'enumerate' }).solve(buildEngine(pos, { actionChooser: () => null }), 0);
    expect(root.value).toBe(0.5);
    expect(root.cellSE.flat().every(se => se === 0)).toBe(true);
  });

  it('a fixed-dice position leaves nothing to chance but the order inside a step, so its exact solve agrees with the sampled one', () => {
    const pos = generatePosition(5, { shape: '2x1', cards: 2, roundsLeft: 1, fixedDice: true });
    for (const c of pos.teams.flat().flatMap(f => f.cards)) if (typeof c.p.s === 'number') expect(c.p.s).toBeLessThanOrEqual(1);
    const exact = new Referee({ chance: 'enumerate' }).solve(buildEngine(pos, { actionChooser: () => null }), 0).value;
    const sampled = new Referee().solve(buildEngine(pos, { actionChooser: () => null }), 0).value;
    // The sampled referee draws only the tie order here: close, not equal.
    expect(Math.abs(exact - sampled)).toBeLessThan(2);
  });

  it('a fight the cap cuts is scored at the cap, never further', () => {
    // bomb-long has two rounds left: a bomb planted in the second never lands.
    const c = CONTROLS.find(x => x.position.id === 'bomb-long')!;
    const longer: Position = { ...c.position, roundsLeft: 3 };
    const v2 = new Referee().solve(buildEngine(c.position, { actionChooser: () => null }), 0).value;
    const v3 = new Referee().solve(buildEngine(longer, { actionChooser: () => null }), 0).value;
    expect(v3).not.toBeCloseTo(v2, 3);
  });
});

describe('the referee as a double oracle', () => {
  // The cells are pure functions of their seeds, so growing each node's
  // matrix by exact best responses must land on the full matrix's value — an
  // identity, not a tolerance on noise. What it buys is the cells it skips.
  const both = (pos: Position) => {
    const full = new Referee();
    const oracle = new Referee({ strategies: 'oracle' });
    return {
      full: full.solve(buildEngine(pos, { actionChooser: () => null }), 0).value, fullSims: full.sims,
      oracle: oracle.solve(buildEngine(pos, { actionChooser: () => null }), 0).value, oracleSims: oracle.sims,
    };
  };

  for (const c of CONTROLS) {
    it(`${c.position.id}: the same value as the full matrix`, () => {
      const r = both(c.position);
      expect(r.oracle).toBeCloseTo(r.full, 5);
      expect(r.oracleSims).toBeLessThanOrEqual(r.fullSims);
    });
  }

  it('on generated positions: the same value, from fewer simulated rounds', () => {
    let fullSims = 0, oracleSims = 0;
    for (const [seed, shape] of [[1, '1x1'], [2, '2x1'], [3, '1x2'], [4, '2x1'], [5, '1x1']] as const) {
      const r = both(generatePosition(seed, { shape, cards: 3, roundsLeft: 2 }));
      expect(r.oracle, `seed ${seed}`).toBeCloseTo(r.full, 5);
      fullSims += r.fullSims;
      oracleSims += r.oracleSims;
    }
    expect(oracleSims).toBeLessThan(fullSims);
  }, 60_000); // five real solves: seconds idle, more on a loaded machine

  it('every row is valued against the final mix, so the check reads it as it reads the full matrix', () => {
    const pos = generatePosition(2, { shape: '2x1', cards: 3, roundsLeft: 2 });
    const full = new Referee().solve(buildEngine(pos, { actionChooser: () => null }), 0);
    const oracle = new Referee({ strategies: 'oracle' }).solve(buildEngine(pos, { actionChooser: () => null }), 0);
    expect(oracle.rows.length).toBe(full.rows.length);
    // No row beats the value against the oracle's mix: it is an equilibrium of the WHOLE matrix.
    expect(Math.max(...oracle.rowValue)).toBeLessThanOrEqual(oracle.value + 1e-6);
    expect(oracle.sol.row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

describe('the referee on a live engine', () => {
  // A foe that rots 1 or 2 PV at the start of every round, and a hero who
  // hits it for 1 each round; two rounds. The live engine has opened round 1
  // (its rot already drawn); round 2's rot is chance the seats see before
  // they choose, so the referee averages over it: hero 10, foe 10 − rot₁ − 1
  // − rot₂ − 1, worth 2 + rot₁ + E[rot₂] = 3.5 + rot₁.
  const ROT: StatusBehavior = { onRoundStart(ctx) { ctx.holder.loseLife(randomInt(2) + 1); } };
  const live = () => {
    const hero = fighter('Hero', [attackCard('hit')], { pv: 10, ai: true });
    const foe = fighter('Foe', [focusCard('wait')], { pv: 10, ai: true });
    const engine = new CombatEngine([hero], [foe], { registry: new EffectRegistry(), maxRounds: 2, actionChooser: () => null });
    foe.setStatus('rot', 1, 99, undefined, ROT); // after the engine: a new combat clears statuses
    withSeed(5, () => engine.prepareRound());
    return { engine, rot1: 10 - foe.currentPV };
  };

  it('takes a prepared round as it stands, and averages the chance that opens a later one', () => {
    const { engine, rot1 } = live();
    const v = new Referee({ samples: [1, 400] }).solve(engine, 0).value;
    expect(v).toBeCloseTo(3.5 + rot1, 1);
  });
});

describe('the referee on decisions that are not aims', () => {
  it('a card\'s reveal option is the seat\'s own decision: it takes the option worth 5', () => {
    const registry = new EffectRegistry();
    registry.register('pick', {
      revealOptions: () => ['big', 'nothing'],
      onRevealOption(ctx, option) { if (option === 0) for (const e of ctx.engine.enemiesOf(ctx.source)) ctx.engine.applyPvLoss(e, 5); },
    });
    const hero = fighter('Hero', [focusCard('choose', { effects: [{ type: 'pick' }] })], { pv: 10, ai: true });
    const foe = fighter('Foe', [focusCard('wait')], { pv: 10, ai: true });
    const engine = new CombatEngine([hero], [foe], { registry, maxRounds: 1, actionChooser: () => null });
    expect(new Referee({ chance: 'enumerate' }).solve(engine, 0).value).toBeCloseTo(5, 9);
  });

  it('a seat that chooses after the reveal reads the other card first: matching pennies becomes a sure thing', () => {
    // Hero (5 of 10 PV): strike 6 or heal 4. Foe (10): a fast hide, or strike 5.
    //   strike vs hide 0 · strike vs strike −5 +6 = +1 · heal vs hide +4 · heal vs strike −5 (interrupted)
    // Blind, the hero mixes (10% heal): +0.4. Reading the foe's card: heal on
    // a hide, strike on a strike — the foe strikes: +1. Payoff 5 − 10 + that.
    const pos = (later: boolean): Position => ({
      id: 'later', roundsLeft: 1, tags: { shape: '1x1', horizon: 1, side: 'hero' },
      teams: [
        [{ name: 'H', maxPv: 10, pv: 5, armour: 0, level: 0, fatigue: 0,
          cards: [{ arch: 'strike', p: { n: 6, s: 1, fast: 0, fatigue: 0 } }, { arch: 'heal', p: { amount: 4, fast: 0 } }],
          statuses: later ? [{ key: 'audit.later', value: 1, priced: 0 }] : [] }],
        [{ name: 'E', maxPv: 10, pv: 10, armour: 0, level: 0, fatigue: 0,
          cards: [{ arch: 'hide', p: { fast: 1 } }, { arch: 'strike', p: { n: 5, s: 1, fast: 0, fatigue: 0 } }] }],
      ],
    });
    const solve = (p: Position) => new Referee({ chance: 'enumerate' }).solve(buildEngine(p, { actionChooser: () => null }), 0).value;
    expect(solve(pos(false))).toBeCloseTo(-4.6, 9);
    expect(solve(pos(true))).toBeCloseTo(-4, 9);
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
