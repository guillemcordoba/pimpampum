/**
 * THE SHRINKER, against a predicate whose smallest witness is known: it must
 * reach that witness, every step it keeps must still fail, and it must never
 * ask about a position with an empty side or an empty hand.
 */
import { describe, it, expect } from 'vitest';
import { generatePosition, shrink, type Position } from '../src/audit/index.js';

describe('the shrinker', () => {
  // "Fails" while side A holds a strike and side B fields two bodies.
  const fails = (p: Position): boolean => {
    expect(p.teams[0].length).toBeGreaterThan(0);
    expect(p.teams[1].length).toBeGreaterThan(0);
    for (const f of p.teams.flat()) expect(f.cards.length).toBeGreaterThan(0);
    return p.teams[0].some(f => f.cards.some(c => c.arch === 'strike')) && p.teams[1].length >= 2;
  };
  const start = generatePosition(11, { shape: '4x4', cards: 4 });
  start.teams[0][0].cards[0] = { arch: 'strike', p: { n: 3, s: 6, fast: 0, fatigue: 0 } };

  it('reaches the smallest position that still fails', () => {
    expect(fails(start)).toBe(true);
    const r = shrink(start, fails, 2000);
    expect(r.position.teams[0]).toHaveLength(1);
    expect(r.position.teams[1]).toHaveLength(2);
    expect(r.position.teams[0][0].cards.map(c => c.arch)).toEqual(['strike']);
    for (const f of r.position.teams.flat()) {
      expect(f.cards).toHaveLength(1);
      expect(f.pv).toBeLessThanOrEqual(1);
      expect([f.armour, f.level, f.fatigue]).toEqual([0, 0, 0]);
    }
    expect(fails(r.position)).toBe(true);
    expect(r.steps.length).toBeGreaterThan(5);
  });

  it('a position nothing can simplify comes back unchanged', () => {
    const r = shrink(start, () => false);
    expect(r.position).toEqual(start);
    expect(r.steps).toEqual([]);
  });
});
