/**
 * The candidate rules for how defenses meet attacks: the list itself, and the
 * two verdicts a candidate is read on, on inputs whose answer is known.
 */
import { describe, it, expect } from 'vitest';
import { DEFENSE_RULES, handBeatsAttacking, windowOpen, type RuleCell } from '../src/index.js';

const window = (floor: number, aim: number | null): Pick<RuleCell, 'window'> => ({ window: { floor, aim, ceiling: aim, floorCards: [] } });
const hand = (spam: number, attacks: number, games = 600): Pick<RuleCell, 'hand'> => ({
  hand: [{ style: 'spam', score: spam, games }, { style: 'attacks', score: attacks, games }],
});

describe('the candidate rules', () => {
  it('begin with today\'s, which sets no option', () => {
    expect(DEFENSE_RULES[0]).toMatchObject({ id: 'today', rules: {} });
  });

  it('are each a different set of options, under a different name', () => {
    expect(new Set(DEFENSE_RULES.map(r => r.id)).size).toBe(DEFENSE_RULES.length);
    expect(new Set(DEFENSE_RULES.map(r => JSON.stringify(r.rules))).size).toBe(DEFENSE_RULES.length);
  });

  it('hold the rule before 2026-11-13 and the half-spend one', () => {
    expect(DEFENSE_RULES.find(r => r.id === 'whole')?.rules).toEqual({ guardSpend: 0 });
    expect(DEFENSE_RULES.find(r => r.id === 'half')?.rules).toEqual({ guardSpend: 0.5 });
  });
});

describe('a level\'s window is open', () => {
  it('when the floor is at or under the aim', () => {
    expect(windowOpen(window(8, 8))).toBe(true);
    expect(windowOpen(window(5, 14))).toBe(true);
  });
  it('not when the floor is over the aim, or fights never end quickly', () => {
    expect(windowOpen(window(9, 8))).toBe(false);
    expect(windowOpen(window(1, null))).toBe(false);
  });
});

describe('the hand beats attacking', () => {
  it('when spam and attacks alone both score clearly under an even duel', () => {
    expect(handBeatsAttacking(hand(0.40, 0.42))).toBe(true);
  });
  it('not when either is within the noise of even', () => {
    expect(handBeatsAttacking(hand(0.40, 0.48))).toBe(false);
    expect(handBeatsAttacking(hand(0.49, 0.40))).toBe(false);
  });
  it('not on a sample too small to tell', () => {
    expect(handBeatsAttacking(hand(0.40, 0.42, 20))).toBe(false);
  });
  it('not when a duel is missing', () => {
    expect(handBeatsAttacking({ hand: [{ style: 'spam', score: 0.3, games: 600 }] })).toBe(false);
  });
});
