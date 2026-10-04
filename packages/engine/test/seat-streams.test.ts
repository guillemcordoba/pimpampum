/**
 * PER-SEAT RANDOM STREAMS — what the lookahead's paired rollouts rely on.
 *
 * Two branches of a rollout differ by one seat's card. With one shared stream,
 * a card that draws a different number of dice shifts every later roll of the
 * round, so every OTHER seat's dice change too and the two branches are no
 * longer compared on the same luck. With `seatStreamSeed`, they are.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, DiceRoll, EffectRegistry, firstLegalChooser, withSeed } from '../src/index.js';
import { attackCard, fighter, playRound, punchingBag } from '../src/testing.js';

const small = attackCard('small', { speed: 5, dice: new DiceRoll(1, 2) });
const big = attackCard('big', { speed: 5, dice: new DiceRoll(6, 20) });
const later = attackCard('later', { speed: 1, dice: new DiceRoll(1, 20) });

/** What the SECOND hero dealt, when the first plays `card`. */
function laterDamage(card: 0 | 1, seed: number, streams: boolean): number {
  return withSeed(seed, () => {
    const first = fighter('First', [small, big]);
    const second = fighter('Second', [later]);
    const engine = new CombatEngine([first, second], [punchingBag(1000), punchingBag(1000)], {
      registry: new EffectRegistry(), actionChooser: firstLegalChooser,
    });
    if (streams) engine.seatStreamSeed = seed;
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: card, targets: [{ team: 1, idx: 0 }] },
      { team: 0, idx: 1, actionIdx: 0, targets: [{ team: 1, idx: 1 }] },
    ]);
    return 1000 - engine.teams[1][1].currentPV;
  });
}

describe('per-seat random streams', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 104_729);

  it('one seat changing its card leaves every other seat\'s dice untouched', () => {
    for (const seed of SEEDS) {
      expect(laterDamage(1, seed, true), `seed ${seed}`).toBe(laterDamage(0, seed, true));
    }
  });

  it('THE CONTROL: on the one shared stream, it does not', () => {
    const shifted = SEEDS.filter(seed => laterDamage(1, seed, false) !== laterDamage(0, seed, false));
    expect(shifted.length, 'the shared stream should desynchronise most branches').toBeGreaterThan(SEEDS.length / 2);
  });
});
