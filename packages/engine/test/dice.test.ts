/**
 * DICE AND RANDOMNESS — the engine's only source of chance, and the exact
 * distributions the AI prices damage with.
 *
 * The distributions are held to the engine's OWN arithmetic rather than to a
 * textbook: what matters is that the number the AI reasons about is the number
 * a contest actually produces, floors and all.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DiceRoll, diceDistribution, expectedExcess, random, rollDie, seededRng, setRng, withSeed,
} from '../src/index.js';

/** Small dice, so exhaustive enumeration stays cheap. */
const smallDice = fc.record({
  n: fc.integer({ min: 0, max: 4 }),
  s: fc.integer({ min: 1, max: 8 }),
  mod: fc.integer({ min: -6, max: 6 }),
}).map(({ n, s, mod }) => new DiceRoll(n, n === 0 ? 0 : s, mod));

/**
 * Every outcome of `dice` with its probability, by brute force — the dice
 * enumerated face by face, then taken through exactly the two floors a contest
 * applies: `DiceRoll.roll()` floors dice + modifier at 0, and the contest floors
 * roll + bonus at 0 again (`combat.ts`, every `Math.max(0, roll + bonus)`).
 */
function engineTotals(dice: DiceRoll | undefined, flat: number): Map<number, number> {
  const out = new Map<number, number>();
  const add = (v: number, p: number) => out.set(v, (out.get(v) ?? 0) + p);
  if (!dice) { add(Math.max(0, flat), 1); return out; }
  const faces: number[][] = [[]];
  for (let i = 0; i < dice.numDice; i++) {
    const next: number[][] = [];
    for (const f of faces) for (let v = 1; v <= dice.sides; v++) next.push([...f, v]);
    faces.splice(0, faces.length, ...next);
  }
  const p = 1 / faces.length;
  for (const f of faces) {
    const rolled = Math.max(0, f.reduce((a, b) => a + b, 0) + dice.modifier);
    add(Math.max(0, rolled + flat), p);
  }
  return out;
}

describe('DiceRoll', () => {
  it('rolls inside [max(0, n+mod), max(0, n·s+mod)]', () => {
    fc.assert(fc.property(smallDice, fc.integer(), (dice, seed) => {
      const lo = Math.max(0, dice.numDice + dice.modifier);
      const hi = Math.max(0, dice.numDice * dice.sides + dice.modifier);
      withSeed(seed, () => {
        for (let i = 0; i < 20; i++) {
          const r = dice.roll();
          expect(r).toBeGreaterThanOrEqual(dice.numDice === 0 ? Math.max(0, dice.modifier) : lo);
          expect(r).toBeLessThanOrEqual(hi);
        }
      });
    }));
  });

  it('reports the average of its faces', () => {
    expect(new DiceRoll(2, 6).average()).toBe(7);
    expect(new DiceRoll(1, 4, -1).average()).toBe(1.5);
    expect(new DiceRoll(0, 0, 10).average()).toBe(10);
  });

  it('prints and parses the same notation', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 100 }), fc.integer({ min: -20, max: 20 }),
      (n, s, mod) => {
        const d = DiceRoll.parse(new DiceRoll(n, s, mod).toString());
        expect([d.numDice, d.sides, d.modifier]).toEqual([n, s, mod]);
      },
    ));
  });

  it('refuses notation it cannot read rather than guessing', () => {
    for (const bad of ['', 'd6', '2x6', '2d', '2d6+', 'two dice']) {
      expect(() => DiceRoll.parse(bad)).toThrow();
    }
  });

  it('a die is uniform over its faces', () => {
    const counts = new Array(7).fill(0);
    withSeed(1, () => { for (let i = 0; i < 60_000; i++) counts[rollDie(6)]++; });
    expect(counts[0]).toBe(0);
    // 10,000 expected per face; σ ≈ 91. Five sigma either side.
    for (let f = 1; f <= 6; f++) expect(Math.abs(counts[f] - 10_000)).toBeLessThan(460);
  });
});

describe('the distributions the AI prices damage with', () => {
  it('are probability distributions', () => {
    fc.assert(fc.property(smallDice, fc.integer({ min: -8, max: 8 }), (dice, flat) => {
      const total = [...diceDistribution(dice, flat).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }));
  });

  it('match the totals a contest ACTUALLY produces, floors included', () => {
    // A fatigued defender's flat is negative. The engine floors their total at
    // zero; a distribution that does not would hand the AI a defense that can
    // go below nothing, and it would price every blow against a tired hero as
    // landing harder than it can.
    fc.assert(fc.property(smallDice, fc.integer({ min: -8, max: 8 }), (dice, flat) => {
      const want = engineTotals(dice, flat);
      const got = diceDistribution(dice, flat);
      for (const [v, p] of want) expect(got.get(v) ?? 0).toBeCloseTo(p, 12);
      for (const [v, p] of got) if (p > 0) expect(want.has(v)).toBe(true);
    }));
  });

  it('agree with the engine for the no-dice case too', () => {
    expect([...diceDistribution(undefined, 3)]).toEqual([[3, 1]]);
    expect([...diceDistribution(undefined, -2)]).toEqual([[0, 1]]);
  });

  it('expectedExcess is E[max(0, a − b − floor)] over those totals', () => {
    fc.assert(fc.property(
      smallDice, fc.integer({ min: -5, max: 5 }), smallDice, fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: 0, max: 4 }),
      (a, af, b, bf, floor) => {
        let want = 0;
        for (const [ta, pa] of engineTotals(a, af)) {
          for (const [tb, pb] of engineTotals(b, bf)) want += pa * pb * Math.max(0, ta - tb - floor);
        }
        expect(expectedExcess(a, af, b, bf, floor)).toBeCloseTo(want, 10);
      },
    ));
  });

  it('expectedExcess against no defense is the attack total above armour', () => {
    // 1d1+4 always totals 5; through 2 armour, 3 is left.
    expect(expectedExcess(new DiceRoll(1, 1, 4), 0, undefined, 0, 2)).toBe(3);
  });
});

describe('the random stream', () => {
  it('a seed reproduces its sequence exactly', () => {
    fc.assert(fc.property(fc.integer(), seed => {
      const a = seededRng(seed), b = seededRng(seed);
      for (let i = 0; i < 50; i++) expect(a()).toBe(b());
    }));
  });

  it('draws in [0, 1)', () => {
    const r = seededRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('withSeed restores the previous generator, even when the body throws', () => {
    setRng(() => 0.25);
    try {
      expect(() => withSeed(3, () => { throw new Error('boom'); })).toThrow('boom');
      expect(random()).toBe(0.25);
      withSeed(3, () => random());
      expect(random()).toBe(0.25);
    } finally {
      setRng(null);
    }
  });

  it('nested seeds do not leak into the outer stream', () => {
    const plain = withSeed(11, () => [random(), random()]);
    const nested = withSeed(11, () => {
      const first = random();
      withSeed(99, () => { random(); random(); random(); });
      return [first, random()];
    });
    expect(nested).toEqual(plain);
  });
});
