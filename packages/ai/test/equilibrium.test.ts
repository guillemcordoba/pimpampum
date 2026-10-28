/**
 * THE EQUILIBRIUM PROTOTYPE — that it plays, and plays the obvious card.
 * Its strength is measured elsewhere (`tools/src/ai-equilibrium-match.ts`,
 * `ai-shortcut-gap.ts`); here only what must always hold.
 */
import { describe, it, expect } from 'vitest';
import { withSeed } from '@pimpampum/engine';
import { equilibriumPolicy } from '../src/index.js';
import { buildEngine, generatePosition, type Position } from '../src/audit/index.js';

describe('the equilibrium prototype', () => {
  it('takes the blow that ends the fight over the card that does nothing', () => {
    const pos: Position = {
      id: 'obvious', roundsLeft: 1, tags: { shape: '1x1', horizon: 1, side: 'hero' },
      teams: [
        [{ name: 'H', maxPv: 10, pv: 10, armour: 0, level: 0, fatigue: 0, cards: [{ arch: 'hide', p: { fast: 1 } }, { arch: 'strike', p: { n: 9, s: 1, fast: 1, fatigue: 0 } }] }],
        [{ name: 'E', maxPv: 5, pv: 5, armour: 0, level: 0, fatigue: 0, cards: [{ arch: 'strike', p: { n: 1, s: 1, fast: 0, fatigue: 0 } }] }],
      ],
    };
    for (const seed of [1, 2, 3]) {
      withSeed(seed, () => {
        const e = buildEngine(pos, equilibriumPolicy(), { ai: true });
        e.runCombat();
        expect(e.winner()).toBe(0);
      });
    }
  });

  it('plays whole fights of composed cards, solving every round itself', () => {
    for (const seed of [1, 2, 3, 4]) {
      const policy = equilibriumPolicy();
      withSeed(seed, () => {
        const e = buildEngine(generatePosition(seed, { shape: '2x1', cards: 3, roundsLeft: 2, catalogue: 'composed' }), policy, { ai: true });
        e.runCombat();
      });
      expect(policy.stats.fallback).toBe(0);
      expect(policy.stats.solved).toBeGreaterThan(0);
    }
  }, 60_000);
});
