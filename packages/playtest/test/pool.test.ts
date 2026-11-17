/**
 * The strategy pool's loop, its requirement and the round triangle's verdict,
 * on games whose answer is known: no fight is played here.
 */
import { describe, it, expect } from 'vitest';
import { always, COUNTER, PLANS, type Kind, type Plan, type ResponseTable, type RoundTable, type Strategy } from '@pimpampum/bench';
import {
  awarenessOf, countersPlayed, describeStrategy, DUMBEST, FAMILIES, gridOf, growPool, isFixed, metaMix, poolVerdict, roundTriangle, roundTriangleVerdict,
  type Evaluate,
} from '../src/index.js';

/** The mock games are played by tables: a table against a table is six rounds, each side answering what the other showed the round before. */
const table = (m: Strategy): ResponseTable => { if (m.kind !== 'table') throw new Error('a mock game plays tables'); return m; };
const sixRounds = (x: ResponseTable, y: ResponseTable, round: (ours: Plan, theirs: Plan) => number): number => {
  let total = 0, lastX: Plan | null = null, lastY: Plan | null = null;
  for (let r = 0; r < 6; r++) {
    const px: Plan = lastY ? x.after[lastY] : x.first, py: Plan = lastX ? y.after[lastX] : y.first;
    total += round(px, py);
    lastX = px; lastY = py;
  }
  return total;
};
const kinds = (plan: Plan) => plan.split('') as Kind[];
/** A clean triangle: each of our types against each of theirs, +1 where ours is the counter, −1 where theirs is. */
const triangle: Evaluate = async pairs => pairs.map(([x, y]) => 0.5 + sixRounds(table(x), table(y), (ours, theirs) => {
  let total = 0;
  for (const a of kinds(ours)) for (const b of kinds(theirs)) total += COUNTER[b] === a ? 1 : COUNTER[a] === b ? -1 : 0;
  return total;
}) / 48);
/** One card type simply wins: the side that plays more of it scores more, whatever the other does. */
const favours = (kind: Kind): Evaluate => async pairs => pairs.map(([x, y]) => {
  const count = (plan: Plan) => kinds(plan).filter(k => k === kind).length;
  return 0.5 + sixRounds(table(x), table(y), (ours, theirs) => count(ours) - count(theirs)) / 24;
});
const tablesOnly = { maxMembers: 10, families: ['table'] as const };

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

describe('the pool grown on a mock triangle', () => {
  it('starts from the three dumbest and adds a table that answers what it saw', async () => {
    const steps: string[] = [];
    const r = await growPool(triangle, { ...tablesOnly, onStep: s => steps.push(describeStrategy(s.added)) });
    expect(r.members.slice(0, 3)).toEqual(DUMBEST);
    expect(r.members.length).toBeGreaterThan(3);
    const first = table(r.members[3]);
    // Into the three of them it plays each one's counter the round after.
    expect([first.after.AA, first.after.DD, first.after.FF]).toEqual(['DD', 'FF', 'AA']);
    expect(awarenessOf(first)).toBe('reads');
    for (const dumb of [0, 1, 2]) expect(r.score[3][dumb]).toBeGreaterThan(0.5);
    expect(steps.length).toBe(r.members.length - 3);
    for (const s of r.steps) expect(s.gain).toBeGreaterThanOrEqual(0.04);
  });

  it('adds nothing when nothing beats the pool it starts from', async () => {
    const r = await growPool(async pairs => pairs.map(() => 0.5), tablesOnly);
    expect(r.members).toEqual(DUMBEST);
    expect(r.converged).toBe(true);
  });

  it('does not add what only looked good on the search\'s fights', async () => {
    // On the search's fights (fresh 0) every candidate beats the pool; on the others nothing does.
    const lucky: Evaluate = async (pairs, fresh = 0) => pairs.map(([x]) => (fresh === 0 && !DUMBEST.some(d => d.first === table(x).first && isFixed(table(x))) ? 0.7 : 0.5));
    const r = await growPool(lucky, tablesOnly);
    expect(r.members).toEqual(DUMBEST);
  });
});

describe('the requirement: the best strategy is not a dumb one', () => {
  const verdictOf = async (game: Evaluate) => poolVerdict(await growPool(game, tablesOnly));

  it('is green on the mock triangle', async () => {
    const v = await verdictOf(triangle);
    expect(v.why).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.shares.reads).toBeGreaterThan(0.5);
  });

  it('is red when attacking simply wins: the pool never leaves always-attack', async () => {
    const r = await growPool(favours('A'), tablesOnly);
    expect(r.members).toEqual(DUMBEST);
    const v = poolVerdict(r);
    expect(v.ok).toBe(false);
    expect(v.why.join(' ')).toContain('always AA does not clearly lose to the mix');
  });

  it('is red when defending simply wins', async () => {
    const v = await verdictOf(favours('D'));
    expect(v.ok).toBe(false);
    expect(v.why.join(' ')).toContain('always DD does not clearly lose to the mix');
    // Always-attack does lose there; always-defend is what the mix is.
    expect(v.dumbest.find(f => f.table.first === 'AA')?.loses).toBe(true);
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

  it('asks a dumb strategy to lose clearly to the mix when the scores are measured', () => {
    const reader: ResponseTable = { ...always('DD'), after: { ...always('DD').after, DD: 'FF' } };
    const r = { members: [always('AA'), reader], score: [[0.5, 0.47], [0.53, 0.5]], mix: [0, 1] };
    expect(poolVerdict(r).ok).toBe(true);
    expect(poolVerdict(r, 200).ok).toBe(false);
    expect(poolVerdict(r, 200).why[0]).toContain('always AA does not clearly lose to the mix');
  });

  it('is red when a dumb strategy plays even with the mix, though some member beats it', () => {
    // The level-6 pool of 2026-11-15: a script beat always-attack 60 to 40, and always-attack still scored 49% against the mix.
    const reader: ResponseTable = { ...always('AD'), first: 'AA' };
    const script: Strategy = { kind: 'script', opening: 'DD', rounds: 1, then: 'AD' };
    const r = { members: [always('AA'), script, reader], score: [[0.5, 0.4, 0.49], [0.6, 0.5, 0.34], [0.51, 0.66, 0.5]], mix: [0.05, 0, 0.95] };
    const v = poolVerdict(r, 200);
    expect(v.shares.reads).toBeCloseTo(0.95, 6);
    expect(v.ok).toBe(false);
    expect(v.why).toEqual(['always AA does not clearly lose to the mix (49% against it)']);
  });

  it('counts a mix of fixed odds as dumb, and a state player as aware', () => {
    const mixer: Strategy = { kind: 'mixer', attack: 0.5, defense: 0.25 };
    const state: Strategy = { kind: 'state', guardBelow: 0.4, strikeBelow: 0, focusRounds: 1 };
    const beaten = [[0.5, 0.2, 0.2], [0.8, 0.5, 0.5], [0.8, 0.5, 0.5]];
    expect(poolVerdict({ members: [always('AA'), mixer, state], score: beaten, mix: [0, 0.9, 0.1] }).ok).toBe(false);
    expect(poolVerdict({ members: [always('AA'), mixer, state], score: beaten, mix: [0, 0.1, 0.9] }).ok).toBe(true);
  });
});

describe('a strategy, read', () => {
  it('a table is fixed when it answers everything as it opens', () => {
    expect(isFixed(always('DF'))).toBe(true);
    expect(describeStrategy(always('DF'))).toBe('always DF');
    expect(awarenessOf(always('DF'))).toBe('dumb');
    expect(isFixed({ ...always('AA'), after: { ...always('AA').after, AA: 'DD' } })).toBe(false);
  });
  it('counts the plans a table answers with the triangle\'s counter', () => {
    const reader: ResponseTable = { kind: 'table', first: 'AA', after: { AA: 'DD', AD: 'DF', AF: 'AD', DD: 'FF', DF: 'AF', FF: 'AA' } };
    expect(countersPlayed(reader)).toBe(PLANS.length);
    expect(countersPlayed(always('AA'))).toBe(1);
  });
  it('fixed odds and a script follow nothing; a state player with no threshold neither', () => {
    expect(awarenessOf({ kind: 'mixer', attack: 0.5, defense: 0.5 })).toBe('dumb');
    expect(awarenessOf({ kind: 'script', opening: 'DF', rounds: 2, then: 'AA' })).toBe('dumb');
    expect(awarenessOf({ kind: 'state', guardBelow: 0, strikeBelow: 0, focusRounds: 2 })).toBe('dumb');
    expect(awarenessOf({ kind: 'state', guardBelow: 0.4, strikeBelow: 0, focusRounds: 0 })).toBe('state');
  });
  it('every family has a grid, with no strategy twice and none that is one of the dumbest', () => {
    const all = FAMILIES.flatMap(gridOf).map(describeStrategy);
    expect(new Set(all).size).toBe(all.length);
    for (const kind of ['mixer', 'state', 'script'] as const) {
      expect(gridOf(kind).length).toBeGreaterThan(5);
      for (const m of gridOf(kind)) expect(DUMBEST.map(describeStrategy)).not.toContain(describeStrategy(m));
    }
    // Every state player on the grid follows the fight.
    expect(gridOf('state').every(m => awarenessOf(m) === 'state')).toBe(true);
  });
});

describe('the triangle, round by round', () => {
  /** A table where our answer scores `good` against the plan it counters and `flat` otherwise. */
  const cells = (good: number, flat: number, se = 0.02): Pick<RoundTable, 'cells'> => ({
    cells: Object.fromEntries(PLANS.map(ours => [ours, Object.fromEntries(PLANS.map(theirs => {
      const counters = (ours === 'DD' && theirs === 'AA') || (ours === 'FF' && theirs === 'DD') || (ours === 'AA' && theirs === 'FF');
      return [theirs, { score: counters ? good : flat, se, margin: 0 }];
    }))])) as RoundTable['cells'],
  });
  it('holds when each counter is clearly the answer to have played', () => {
    const edges = roundTriangle(cells(0.65, 0.5));
    expect(edges.map(e => [e.theirs, e.claimed, e.holds])).toEqual([['AA', 'DD', true], ['DD', 'FF', true], ['FF', 'AA', true]]);
    expect(roundTriangleVerdict(edges).ok).toBe(true);
  });
  it('does not when the counter is within the noise of another answer', () => {
    const edges = roundTriangle(cells(0.52, 0.5));
    expect(roundTriangleVerdict(edges)).toMatchObject({ ok: false });
    expect(roundTriangleVerdict(edges).broken).toHaveLength(3);
  });
  it('does not when the counter is the worse answer', () => {
    expect(roundTriangle(cells(0.4, 0.5)).every(e => !e.holds)).toBe(true);
  });
  /** `cells(0.5, 0.5)` with one cell moved. */
  const withCell = (ours: Plan, theirs: Plan, score: number) => {
    const t = cells(0.5, 0.5);
    t.cells[ours][theirs] = { score, se: 0.02, margin: 0 };
    return t;
  };
  it('credits a mixed answer that holds the counter: one hero guarding into both attacking', () => {
    const into = roundTriangle(withCell('AD', 'AA', 0.65)).find(e => e.theirs === 'AA')!;
    expect(into).toMatchObject({ counter: 'D', claimed: 'AD', holds: true });
  });
  it('counts a mixed answer without the counter as a rival', () => {
    const t = withCell('AF', 'AA', 0.65);
    t.cells.DD.AA = { score: 0.6, se: 0.02, margin: 0 };
    const into = roundTriangle(t).find(e => e.theirs === 'AA')!;
    expect(into).toMatchObject({ claimed: 'DD', rival: 'AF', holds: false });
  });
});
