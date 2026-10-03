/**
 * THE SET SEAM. Bench refuses to measure until a set is installed — the safety
 * property that no harness can quietly measure default content — and the
 * party-spec helpers it shares with every set behave as documented.
 *
 * This file must not install a set before its first test: that test is about
 * what happens when nobody has.
 */
import { describe, it, expect } from 'vitest';
import { isExplicitParty, partyKits, theRegistry, theSet, useSet } from '../src/index.js';
import { SYNTHETIC } from '../src/testing.js';

describe('the set in play', () => {
  it('throws, naming the fix, when nothing is installed', () => {
    expect(() => theSet()).toThrow(/useSet/);
    expect(() => theRegistry()).toThrow(/useSet/);
  });

  it('is whatever was installed last', () => {
    useSet(SYNTHETIC);
    expect(theSet()).toBe(SYNTHETIC);
    expect(theRegistry()).toBe(theRegistry());
  });
});

describe('party specs', () => {
  it('an explicit party is one that lists its characters', () => {
    expect(isExplicitParty({ characters: [] })).toBe(true);
    expect(isExplicitParty({ count: 4, levels: 6 })).toBe(false);
  });

  it('knows which kits an explicit party holds, and claims none for a drawn one', () => {
    const party = { characters: [SYNTHETIC.hero('a', 'brawler'), SYNTHETIC.hero('b', 'medic', 1)] };
    expect([...partyKits(party)].sort()).toEqual(['brawler', 'medic']);
    expect(partyKits({ count: 4, levels: 6 }).size).toBe(0);
  });
});
