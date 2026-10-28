/**
 * COMPOSED CARDS — that the parts do what they say, that they span many
 * distinct cards, and that every one of them plays.
 */
import { describe, it, expect } from 'vitest';
import { availableActionIndices, random, withSeed } from '@pimpampum/engine';
import {
  ARCHETYPES, Referee, buildEngine, generatePosition, type Position,
} from '../src/audit/index.js';
import { EFFECTS, SUBJECTS, TRIGGERS } from '../src/audit/compose.js';

const code = <T extends readonly string[]>(xs: T, name: T[number]): number => xs.indexOf(name);
/** A composed card's params from names. */
const composed = (type: 0 | 1 | 2, trigger: (typeof TRIGGERS)[number], effect: (typeof EFFECTS)[number], subject: (typeof SUBJECTS)[number], extra: Record<string, number> = {}) => ({
  arch: 'composed',
  p: { type, t: code(TRIGGERS, trigger), e: code(EFFECTS, effect), g: code(SUBJECTS, subject), m: 3, d: 2, fast: 0, fatigue: 0, priced: 1, ...extra },
});
const strike = (n: number) => ({ arch: 'strike', p: { n, s: 1, fast: 0, fatigue: 0 } });
const body = (name: string, pv: number, cards: { arch: string; p: Record<string, number> }[]) =>
  ({ name, maxPv: pv, pv, armour: 0, level: 0, fatigue: 0, cards });
const duel = (hero: ReturnType<typeof body>, foe: ReturnType<typeof body>, roundsLeft: number): Position =>
  ({ id: 'c', roundsLeft, teams: [[hero], [foe]], tags: { shape: '1x1', horizon: roundsLeft, side: 'hero' } });
const exact = (pos: Position) => new Referee({ chance: 'enumerate' }).solve(buildEngine(pos, { actionChooser: () => null }), 0).value;

describe('composed cards do what their parts say', () => {
  it('a defense that wounds the attacker when it holds: hero 10, foe 10 − 3', () => {
    const pos = duel(body('H', 10, [composed(1, 'block', 'wound', 'trigger', { n: 10, s: 1 })]), body('E', 10, [strike(1)]), 1);
    expect(exact(pos)).toBeCloseTo(3, 9);
  });

  it('a defense that stuns the attacker when it breaks: the second blow never comes', () => {
    // Round 1: the 5 beats the 1 by 4 (hero 10 → 6) and the foe is stunned;
    // round 2 it skips. Without the stun it would land again: −8, not −4.
    const pos = duel(body('H', 10, [composed(1, 'breach', 'stun', 'trigger', { n: 1, s: 1 })]), body('E', 10, [strike(5)]), 2);
    expect(exact(pos)).toBeCloseTo(-4, 9);
  });

  it('an attack that weakens what it hits: the foe\'s next blow is 3 smaller', () => {
    // Fast so it lands first: 2 → foe 8, weakened; its 5 lands as 2 (hero 8).
    // Round 2: the hero hits again (foe 6); the weakened 5 lands as 2 (hero 6).
    const pos = duel(body('H', 10, [composed(0, 'hit', 'weaken', 'trigger', { n: 2, s: 1, fast: 1 })]), body('E', 10, [strike(5)]), 2);
    expect(exact(pos)).toBeCloseTo(0, 9);
  });

  it('a focus that heals its maker at the reveal: it lands even if the focus is interrupted', () => {
    // Hero 10 −5 by the strike, +3 at the reveal (capped at max 10 first: no gain), so 5.
    // Starting at 6: +3 → 9, then −5 → 4.
    const pos = duel(body('H', 10, [composed(2, 'reveal', 'heal', 'self')]), body('E', 10, [strike(5)]), 1);
    pos.teams[0][0].pv = 6;
    expect(exact(pos)).toBeCloseTo(4 - 10, 9);
  });
});

describe('composed cards span many distinct cards, and all of them play', () => {
  it('hundreds of distinct cards, every trigger, effect and subject among them', () => {
    const seen = new Set<string>();
    const parts = { t: new Set<number>(), e: new Set<number>(), g: new Set<number>() };
    withSeed(1, () => {
      for (let i = 0; i < 2000; i++) {
        const p = ARCHETYPES.composed.draw(random);
        seen.add(`${p.type}/${p.t}/${p.e}/${p.g}/${p.m}/${p.d}`);
        parts.t.add(p.t); parts.e.add(p.e); parts.g.add(p.g);
      }
    });
    expect(seen.size).toBeGreaterThan(500);
    expect(parts.t.size).toBe(TRIGGERS.length);
    expect(parts.e.size).toBe(EFFECTS.length);
    expect(parts.g.size).toBe(SUBJECTS.length);
  });

  it('positions of composed cards are a pure function of their seed, and survive JSON', () => {
    const a = generatePosition(9, { shape: '2x2', cards: 3, catalogue: 'composed' });
    expect(a).toEqual(generatePosition(9, { shape: '2x2', cards: 3, catalogue: 'composed' }));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.teams.flat().every(f => f.cards.every(c => c.arch === 'composed'))).toBe(true);
  });

  it('300 fights of composed cards play to their end on random legal choices', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const pos = generatePosition(seed, { cards: 3, catalogue: seed % 3 === 0 ? 'mixed' : 'composed' });
      withSeed(seed, () => {
        const engine = buildEngine(pos, {
          actionChooser: (e, a) => {
            const legal = availableActionIndices(a, e.registry);
            return legal.length ? legal[Math.floor(random() * legal.length)] : null;
          },
          targetChooser: (_e, _a, _d, _r, count, pool) => pool.slice(0, count),
        });
        engine.runCombat();
        expect(engine.round).toBeLessThanOrEqual(engine.maxRounds);
      });
    }
  });

  it('the referee solves composed positions, double oracle and full matrix agreeing', () => {
    for (const seed of [1, 2, 3]) {
      const pos = generatePosition(seed, { shape: '2x1', cards: 3, roundsLeft: 2, catalogue: 'composed' });
      const full = new Referee().solve(buildEngine(pos, { actionChooser: () => null }), 0).value;
      const oracle = new Referee({ strategies: 'oracle' }).solve(buildEngine(pos, { actionChooser: () => null }), 0).value;
      expect(oracle, `seed ${seed}`).toBeCloseTo(full, 5);
    }
  });
});
