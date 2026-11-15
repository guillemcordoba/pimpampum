/**
 * The strategy pool's loop and the round triangle's verdict, on games whose
 * answer is known: no fight is played here.
 */
import { describe, it, expect } from 'vitest';
import { always, COUNTER, PLANS, type Kind, type Plan, type ResponseTable, type RoundTable } from '@pimpampum/bench';
import { countersPlayed, describeTable, growPool, isFixed, metaMix, poolVerdict, roundTriangle, roundTriangleVerdict, type Evaluate } from '../src/index.js';

/** A plan against a plan in a toy round: each of our types against each of theirs, +1 where ours is the counter, −1 where theirs is. */
const roundOf = (ours: Plan, theirs: Plan): number => {
  let total = 0;
  for (const a of ours as unknown as Kind[]) for (const b of theirs as unknown as Kind[]) total += COUNTER[b] === a ? 1 : COUNTER[a] === b ? -1 : 0;
  return total;
};
/** Six such rounds, each side answering what the other showed the round before; x's score. */
const toyDuel = (x: ResponseTable, y: ResponseTable): number => {
  let total = 0, lastX: Plan | null = null, lastY: Plan | null = null;
  for (let round = 0; round < 6; round++) {
    const px: Plan = lastY ? x.after[lastY] : x.first, py: Plan = lastX ? y.after[lastX] : y.first;
    total += roundOf(px, py);
    lastX = px; lastY = py;
  }
  return 0.5 + total / 48;
};
const toy: Evaluate = async pairs => pairs.map(([x, y]) => toyDuel(x, y));

describe('the equilibrium mix of a score table', () => {
  it('is a third each on rock, paper, scissors, and nothing gains on it', () => {
    const { mix, exploit } = metaMix([[0.5, 0, 1], [1, 0.5, 0], [0, 1, 0.5]]);
    for (const p of mix) expect(p).toBeCloseTo(1 / 3, 1);
    expect(exploit).toBeLessThan(0.02);
  });
  it('is all on a member that beats every other', () => {
    const { mix } = metaMix([[0.5, 0.9, 0.8], [0.1, 0.5, 0.5], [0.2, 0.5, 0.5]]);
    expect(mix[0]).toBeGreaterThan(0.95);
  });
  it('of a pool of one is that one', () => {
    const { mix, exploit } = metaMix([[0.5]]);
    expect(mix[0]).toBeCloseTo(1, 6);
    expect(exploit).toBeCloseTo(0, 6);
  });
});

describe('the pool grown on a toy triangle', () => {
  it('answers always-attack with a table that defends into it, and ends on readers', async () => {
    const steps: string[] = [];
    const r = await growPool(toy, { maxMembers: 10, onStep: s => steps.push(describeTable(s.added)) });
    // The first table added beats always-attack, by defending after it saw the attack.
    expect(r.score[1][0]).toBeGreaterThan(0.5);
    expect(r.members[1].after.AA).toBe('DD');
    expect(steps.length).toBe(r.members.length - 1);
    const verdict = poolVerdict(r);
    expect(verdict.fixed[0].table).toEqual(always('AA'));
    expect(verdict.fixed[0].score).toBeGreaterThan(0.5);
    expect(verdict.endsOnReaders).toBe(true);
    // Every step beat the mix it was searched against.
    for (const s of r.steps) expect(s.gain).toBeGreaterThanOrEqual(0.04);
  });

  it('stops at once when nothing beats the pool it starts from', async () => {
    const flat: Evaluate = async pairs => pairs.map(() => 0.5);
    const r = await growPool(flat, { maxMembers: 10 });
    expect(r.members).toEqual([always('AA')]);
    expect(r.converged).toBe(true);
  });
});

describe('a table, read', () => {
  it('is fixed when it answers everything as it opens', () => {
    expect(isFixed(always('DF'))).toBe(true);
    expect(describeTable(always('DF'))).toBe('always DF');
    expect(isFixed({ ...always('AA'), after: { ...always('AA').after, AA: 'DD' } })).toBe(false);
  });
  it('counts the plans it answers with the triangle\'s counter', () => {
    const reader: ResponseTable = { first: 'AA', after: { AA: 'DD', AD: 'DF', AF: 'AD', DD: 'FF', DF: 'AF', FF: 'AA' } };
    expect(countersPlayed(reader)).toBe(PLANS.length);
    expect(countersPlayed(always('AA'))).toBe(1);
  });
});

describe('the triangle, round by round', () => {
  /** A table where our answer scores `good` against the plan it counters and `flat` otherwise. */
  const table = (good: number, flat: number, se = 0.02): Pick<RoundTable, 'cells'> => ({
    cells: Object.fromEntries(PLANS.map(ours => [ours, Object.fromEntries(PLANS.map(theirs => {
      const counters = (ours === 'DD' && theirs === 'AA') || (ours === 'FF' && theirs === 'DD') || (ours === 'AA' && theirs === 'FF');
      return [theirs, { score: counters ? good : flat, se, margin: 0 }];
    }))])) as RoundTable['cells'],
  });
  it('holds when each counter is clearly the answer to have played', () => {
    const edges = roundTriangle(table(0.65, 0.5));
    expect(edges.map(e => [e.theirs, e.claimed, e.holds])).toEqual([['AA', 'DD', true], ['DD', 'FF', true], ['FF', 'AA', true]]);
    expect(roundTriangleVerdict(edges).ok).toBe(true);
  });
  it('does not when the counter is within the noise of another answer', () => {
    const edges = roundTriangle(table(0.52, 0.5));
    expect(roundTriangleVerdict(edges)).toMatchObject({ ok: false });
    expect(roundTriangleVerdict(edges).broken).toHaveLength(3);
  });
  it('does not when the counter is the worse answer', () => {
    expect(roundTriangle(table(0.4, 0.5)).every(e => !e.holds)).toBe(true);
  });
});
describe('the requirement: the best strategy is not a dumb one', () => {
  /** A mock game where one card type simply wins: the side that plays more of it over six rounds scores more, whatever the other does. */
  const favours = (kind: Kind): Evaluate => async pairs => pairs.map(([x, y]) => {
    const count = (plan: Plan) => (plan[0] === kind ? 1 : 0) + (plan[1] === kind ? 1 : 0);
    let total = 0, lastX: Plan | null = null, lastY: Plan | null = null;
    for (let round = 0; round < 6; round++) {
      const px: Plan = lastY ? x.after[lastY] : x.first, py: Plan = lastX ? y.after[lastX] : y.first;
      total += count(px) - count(py);
      lastX = px; lastY = py;
    }
    return 0.5 + total / 24;
  });
  const verdictOf = async (game: Evaluate) => poolVerdict(await growPool(game, { maxMembers: 10 }));

  it('is green on the toy triangle', async () => {
    const v = await verdictOf(toy);
    expect(v.why).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('is red when attacking simply wins: the pool never leaves always-attack', async () => {
    const r = await growPool(favours('A'), { maxMembers: 10 });
    expect(r.members).toEqual([always('AA')]);
    const v = poolVerdict(r);
    expect(v.ok).toBe(false);
    expect(v.why.join(' ')).toContain('always AA');
  });

  it('is red when defending simply wins: the pool ends on always-defend', async () => {
    const r = await growPool(favours('D'), { maxMembers: 10 });
    expect(r.members.map(describeTable)).toEqual(['always AA', 'always DD']);
    const v = poolVerdict(r);
    expect(v.ok).toBe(false);
    expect(v.why.join(' ')).toContain('always DD');
    // Always-attack does have its answer there; the mix is what fails.
    expect(v.fixed.find(f => describeTable(f.table) === 'always AA')?.clearly).toBe(true);
  });

  it('is red when a Focus simply wins', async () => {
    const v = await verdictOf(favours('F'));
    expect(v.ok).toBe(false);
    expect(v.why.join(' ')).toContain('always FF');
  });

  it('is red when nothing matters: every strategy scores the same', async () => {
    const v = await verdictOf(async pairs => pairs.map(() => 0.5));
    expect(v.ok).toBe(false);
  });

  it('asks for a clear win over a fixed strategy when the scores are measured', async () => {
    const r = { members: [always('AA'), { ...always('DD'), after: { ...always('DD').after, DD: 'FF' as Plan } }], score: [[0.5, 0.47], [0.53, 0.5]], mix: [0, 1] };
    expect(poolVerdict(r).ok).toBe(true);
    expect(poolVerdict(r, 200).ok).toBe(false);
    expect(poolVerdict(r, 200).why[0]).toContain('nothing in the pool clearly beats always AA');
  });
});
