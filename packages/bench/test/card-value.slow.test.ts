/**
 * IS THE CARD-VALUE INSTRUMENT CALIBRATED? — the two-sided control.
 *
 * `regret.ts` prices a card by forcing it from a position and playing the fight
 * out. It has two silent failure modes, and the first already happened: the
 * forced card not taking effect at all (every branch identical, every card
 * priced at exactly 0.00 ± 0.00). The second is subtler — scoring or pairing
 * wrong in a way that still looks plausible. A report card of plausible numbers
 * is exactly what a broken instrument produces, so: two cards whose value is
 * known WITHOUT measuring anything, and the instrument must find them.
 *
 *   NO-OP         a Focus with no dice and no effects. Nothing can make it good.
 *   OVERWHELMING  20d6 at every enemy, first. Nothing survives it.
 *
 * Deliberately small: the effects asserted are enormous, so resolving them
 * needs almost nothing (CLAUDE.md: a test nobody can afford to run rots).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CombatEngine } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { games, isolated, pvDifferential, shapeEnemies, theRegistry, theSet, useSet } from '../src/index.js';
import { SYNTHETIC } from '../src/testing.js';
import { NO_OP, OVERWHELMING } from './card-value.work.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'card-value.work.ts');

describe('the card-value instrument finds cards whose value is known in advance', () => {
  let priced: Map<string, number>;
  let ranked: [string, number][];
  const show = (): string => ranked.map(([id, v]) => `${id} ${v.toFixed(1)}`).join(', ');
  beforeAll(async () => {
    priced = new Map(await isolated<[string, number][]>(WORK, 'priceCards', ['brawler', games(12)]));
    ranked = [...priced.entries()].sort((a, b) => b[1] - a[1]);
  });

  it('prices every card it was given', () => {
    expect(priced.has(NO_OP), `the no-op was never priced — ${show()}`).toBe(true);
    expect(priced.has(OVERWHELMING), `the 20d6 was never priced — ${show()}`).toBe(true);
  });

  it('ranks the 20d6 FIRST and the do-nothing card below the kit\'s average card', () => {
    // Not LAST: a real card can be worth nothing. Swapping the brawler\'s slow
    // Smash for doing nothing leaves its winrate unchanged in these fights
    // (NEXT-STEPS §31), so ranking the two either way is not an error.
    expect(ranked[0][0], show()).toBe(OVERWHELMING);
    const real = ranked.filter(([id]) => id !== NO_OP && id !== OVERWHELMING).map(([, v]) => v);
    expect(priced.get(NO_OP)!, show()).toBeLessThan(real.reduce((a, v) => a + v, 0) / real.length);
  });

  it('separates them by much more than it separates real cards', () => {
    const controls = priced.get(OVERWHELMING)! - priced.get(NO_OP)!;
    const real = ranked.filter(([id]) => id !== NO_OP && id !== OVERWHELMING).map(([, v]) => v);
    expect(controls, show()).toBeGreaterThan(Math.max(...real) - Math.min(...real));
  });
});

describe('the outcome is PV on one side minus PV on the other, and nothing else', () => {
  it('is symmetric, and is the board and nothing else', () => {
    useSet(SYNTHETIC);
    const players = theSet().buildParty({ characters: [theSet().hero('A', 'brawler')] });
    const engine = new CombatEngine(players, theSet().buildEncounter(shapeEnemies(0)), {
      registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 0 }),
    });
    const mine = engine.teams[0].reduce((n, c) => n + c.currentPV, 0);
    const theirs = engine.teams[1].reduce((n, c) => n + c.currentPV, 0);
    expect(pvDifferential(engine, 0)).toBe(mine - theirs);
    expect(pvDifferential(engine, 0)).toBe(-pvDifferential(engine, 1));
  });
});
