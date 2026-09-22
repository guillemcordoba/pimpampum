import { random } from './rng.js';

/** Roll a single die with the given number of sides (1..sides). */
export function rollDie(sides: number): number {
  return Math.floor(random() * sides) + 1;
}

/** Represents a dice roll like 1d6, 2d4, or 1d4-1 */
export class DiceRoll {
  constructor(
    public readonly numDice: number,
    public readonly sides: number,
    public readonly modifier: number = 0,
  ) {}

  /** Roll the dice and return the result (minimum 0) */
  roll(): number {
    let total = 0;
    for (let i = 0; i < this.numDice; i++) {
      total += Math.floor(random() * this.sides) + 1;
    }
    return Math.max(0, total + this.modifier);
  }

  /** Return expected average roll */
  average(): number {
    if (this.numDice === 0) return this.modifier;
    const avgPerDie = (1 + this.sides) / 2;
    return this.numDice * avgPerDie + this.modifier;
  }

  toString(): string {
    if (this.numDice === 0) return String(this.modifier);
    const base = `${this.numDice}d${this.sides}`;
    if (this.modifier > 0) return `${base}+${this.modifier}`;
    if (this.modifier < 0) return `${base}${this.modifier}`;
    return base;
  }

  /** Parse dice notation string like "1d6", "2d4-1", "1d6+2" */
  static parse(notation: string): DiceRoll {
    const match = notation.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) throw new Error(`Invalid dice notation: ${notation}`);
    return new DiceRoll(
      parseInt(match[1]),
      parseInt(match[2]),
      match[3] ? parseInt(match[3]) : 0,
    );
  }
}

/**
 * PROBABILITY MASS OVER TOTALS, memoized by notation.
 *
 * The AI needs this because DAMAGE IS THE MARGIN: what an attack is worth is
 * `E[max(0, attack − defense − armour)]`, and that expectation is a property of
 * two DISTRIBUTIONS, not of their averages. Evaluating it at the means instead
 * is wrong in the direction that matters — a 2d6 attack against a 1d12 defense
 * has the same average gap as 2d6 against a flat 6.5, and wildly different odds
 * of getting through.
 *
 * `ai.ts` used to paper over that with `pWin = 0.5 + 0.08 × gap`, a linear
 * stand-in whose own comment said "slope pending recalibration". There is
 * nothing to calibrate: the dice are right here.
 *
 * Dice in this game are small (the largest card is 10d6 → 51 outcomes), and the
 * table is built once per distinct notation and cached forever, so the exact
 * answer is cheaper than the approximation was worth.
 */
const distributionCache = new WeakMap<DiceRoll, Map<number, ReadonlyMap<number, number>>>();

export function diceDistribution(roll: DiceRoll | undefined, flat = 0): ReadonlyMap<number, number> {
  if (!roll || roll.numDice === 0) return new Map([[(roll?.modifier ?? 0) + flat, 1]]);
  // KEYED ON THE DiceRoll OBJECT, not on a string. This runs inside the AI's
  // hottest loop — once per enemy per candidate action per rollout — and
  // building a `2d6+3` key there cost more than the convolution it was caching.
  let byFlat = distributionCache.get(roll);
  if (!byFlat) { byFlat = new Map(); distributionCache.set(roll, byFlat); }
  const hit = byFlat.get(flat);
  if (hit) return hit;

  let dist = new Map<number, number>([[roll.modifier + flat, 1]]);
  const per = 1 / roll.sides;
  for (let d = 0; d < roll.numDice; d++) {
    const next = new Map<number, number>();
    for (const [total, p] of dist) {
      for (let face = 1; face <= roll.sides; face++) {
        const t = total + face;
        next.set(t, (next.get(t) ?? 0) + p * per);
      }
    }
    dist = next;
  }
  byFlat.set(flat, dist);
  return dist;
}

/**
 * `E[max(0, a − b − floor)]` over two independent totals — the expected PV an
 * attack removes through a defense (`floor` is passive armour), and the same
 * quantity a defense prevents when read the other way round.
 *
 * Memoized on the pair: the AI asks for the same few matchups thousands of
 * times a combat.
 */
/**
 * Nested by OBJECT IDENTITY then by the three numbers, so a lookup costs four
 * Map probes and allocates nothing. The first version built a
 * `2d6+3|1d8+0|2` string on every call, inside the loop the AI runs once per
 * enemy per candidate action per rollout, and the key cost more than the
 * convolution it was there to avoid.
 *
 * `NONE` stands in for "no dice", which is a real and common case (a flat
 * defence, an unarmoured target) and cannot be a WeakMap key.
 */
const NONE = Symbol('no-dice');
type ExcessNode = Map<unknown, unknown>;
const excessCache: ExcessNode = new Map();

function child(node: ExcessNode, key: unknown): ExcessNode {
  let next = node.get(key) as ExcessNode | undefined;
  if (!next) { next = new Map(); node.set(key, next); }
  return next;
}

export function expectedExcess(
  a: DiceRoll | undefined, aFlat: number,
  b: DiceRoll | undefined, bFlat: number,
  floor: number,
): number {
  const leaf = child(child(child(child(excessCache, a ?? NONE), aFlat), b ?? NONE), bFlat);
  const hit = leaf.get(floor) as number | undefined;
  if (hit !== undefined) return hit;
  const da = diceDistribution(a, aFlat);
  const db = diceDistribution(b, bFlat);
  let acc = 0;
  for (const [ta, pa] of da) {
    for (const [tb, pb] of db) {
      const dmg = ta - tb - floor;
      if (dmg > 0) acc += pa * pb * dmg;
    }
  }
  leaf.set(floor, acc);
  return acc;
}
