/**
 * THE MATCH: a duplicate pair cancels everything but the play, and the
 * sequential test says better / worse / equal only when the sample does.
 */
import { describe, it, expect } from 'vitest';
import { availableActionIndices } from '@pimpampum/engine';
import { aiPolicy, pickResolveTargets, type Policy } from '../src/index.js';
import { CONTROLS, playPair, sprt } from '../src/audit/index.js';

const pos = { ...CONTROLS.find(c => c.position.id === 'interrupt-delayed')!.position, roundsLeft: 50 };
const ai = (): Policy => aiPolicy({ depth: 1 });

describe('a duplicate pair', () => {
  it('scores an AI against itself at exactly zero: the swap replays the same game', () => {
    for (const seed of [1, 2, 3]) expect(playPair(pos, ai, ai, seed)).toBe(0);
  });

  it('favours the AI over a player that always plays its last legal card', () => {
    const last = (): Policy => ({
      actionChooser: (_e, a) => availableActionIndices(a).at(-1) ?? null,
      targetChooser: pickResolveTargets,
    });
    const total = [1, 2, 3, 4, 5, 6].reduce((s, seed) => s + playPair(pos, ai, last, seed), 0);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});

describe('the sequential test', () => {
  const noisy = (mean: number, n: number): number[] => Array.from({ length: n }, (_, i) => mean + (i % 2 ? 0.3 : -0.3));

  it('calls a clear edge better, its mirror worse', () => {
    expect(sprt(noisy(0.1, 200), 0.05).verdict).toBe('better');
    expect(sprt(noisy(-0.1, 200), 0.05).verdict).toBe('worse');
  });

  it('calls no edge equal once the sample is large enough, and undecided before', () => {
    expect(sprt(noisy(0, 400), 0.05).verdict).toBe('equal');
    expect(sprt(noisy(0, 10), 0.05).verdict).toBe('undecided');
  });
});
