/**
 * METAMORPHIC RELATIONS OF THE RULES — what must happen to a winrate when one
 * thing about a fight changes, measured on synthetic fighters.
 *
 * No single fight has a right answer, but the relation between two populations
 * of fights does: the same fight with the seats swapped is a coin flip; more
 * armour, bigger dice, more training can only help; fatigue can only hurt.
 *
 * Kept in the fast tier on purpose. Every effect here is large BY CONSTRUCTION
 * (a whole die, two points of armour, three levels) against fights that cost
 * microseconds, so a few thousand fights resolve it at many sigma — and the
 * seed is fixed, so a red here is a change in the rules, never a bad draw.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, DiceRoll, EffectRegistry, withSeed } from '../src/index.js';
import { armour, attackCard, defenseCard, fighter, randomLegalChooser, type FighterOptions } from '../src/testing.js';

const GAMES = 3000;

interface Side {
  attack?: DiceRoll;
  defense?: DiceRoll;
  opts?: FighterOptions;
  count?: number;
}

function side(prefix: string, s: Side) {
  return Array.from({ length: s.count ?? 1 }, (_, i) => fighter(`${prefix}${i}`, [
    attackCard('atk', { dice: s.attack ?? new DiceRoll(2, 6), speed: 2 }),
    // Faster than the attack, so a raised guard is up before the blow it is
    // for; at equal speed the order is a coin flip and defense dice barely count.
    defenseCard('def', { dice: s.defense ?? new DiceRoll(2, 6), rollBonus: 0, speed: 3 }),
  ], { pv: 12, ai: true, ...s.opts }));
}

/** Team 0's winrate (draws ½) and its 1σ. */
function winrate(a: Side, b: Side, seed = 1): { p: number; se: number } {
  let wins = 0;
  withSeed(seed, () => {
    for (let g = 0; g < GAMES; g++) {
      const engine = new CombatEngine(side('A', a), side('B', b), {
        registry: new EffectRegistry(), actionChooser: randomLegalChooser, maxRounds: 40,
      });
      const w = engine.runCombat().winner;
      wins += w === 0 ? 1 : w === null ? 0.5 : 0;
    }
  });
  const p = wins / GAMES;
  return { p, se: Math.sqrt(Math.max(p * (1 - p), 0.01) / GAMES) };
}

/** `better` beats `worse` by clearly more than chance allows. */
function expectClearlyAbove(better: { p: number; se: number }, worse: { p: number; se: number }) {
  const gap = better.p - worse.p;
  const se = Math.hypot(better.se, worse.se);
  expect(gap, `gap ${(gap * 100).toFixed(1)}pp ± ${(se * 100).toFixed(1)}`).toBeGreaterThan(4 * se);
}

describe('seats are fair', () => {
  it('a mirror match is a coin flip, whichever seat you sit in (the A/A test)', () => {
    // Team A is built first and used to win every speed tie through a stable
    // sort — a measured seat bias. Identical sides must split evenly.
    for (const count of [1, 2, 3]) {
      const { p, se } = winrate({ count }, { count });
      expect(Math.abs(p - 0.5), `${count}v${count}: ${(p * 100).toFixed(1)}%`).toBeLessThan(4 * se);
    }
  });
});

describe('the levers point the right way', () => {
  const base = winrate({}, {});

  it('armour helps its wearer', () => {
    expectClearlyAbove(winrate({ opts: { equipment: [armour(2)] } }, {}), base);
  });

  it('bigger attack dice help', () => {
    expectClearlyAbove(winrate({ attack: new DiceRoll(3, 6) }, {}), base);
  });

  it('bigger defense dice help', () => {
    expectClearlyAbove(winrate({ defense: new DiceRoll(4, 6) }, {}), base);
  });

  it('training helps — the level is in the roll', () => {
    expectClearlyAbove(winrate({ opts: { level: 3 } }, {}), base);
  });

  it('equal training cancels: both sides three levels up is still a coin flip', () => {
    const { p, se } = winrate({ opts: { level: 3 } }, { opts: { level: 3 } });
    expect(Math.abs(p - 0.5)).toBeLessThan(4 * se);
  });

  it('fatigue hurts the fatigued', () => {
    expectClearlyAbove(base, winrate({ opts: { fatigue: 3 } }, {}));
  });

  it('numbers help: two against one', () => {
    expectClearlyAbove(winrate({ count: 2 }, { count: 1 }), base);
  });
});
