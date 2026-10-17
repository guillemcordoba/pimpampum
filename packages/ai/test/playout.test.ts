/**
 * THE PLAYOUT JUDGE on fights small enough to know: a game is a pure function
 * of its seed, every single-seat change is a candidate, and a card that loses
 * the fight outright is never the one that "beats" a winning pick.
 */
import { describe, it, expect } from 'vitest';
import { CONTROLS, playOne, playoutCheck } from '../src/audit/index.js';

describe('the playout judge', () => {
  const pos = { ...CONTROLS.find(c => c.position.id === 'interrupt-delayed')!.position, roundsLeft: 50 };

  it('a game is a pure function of its seed', () => {
    expect(playOne(pos, [0], [0], 7)).toBe(playOne(pos, [0], [0], 7));
  });

  it('weighs the AI\'s pick against every other card of every acting seat, played to the end', () => {
    const r = playoutCheck(pos, { games: 20, settled: 1.1 });
    expect(r.candidates.map(c => c.actions)).toEqual([[r.ai.actions[0] === 0 ? 1 : 0]]);
    for (const c of r.candidates) expect(Math.abs(c.mean)).toBeLessThanOrEqual(1);
  });
});
