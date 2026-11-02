/**
 * ELEMENTS CARDS, PLAYED EXACTLY — each card's own effects, on hand-built
 * one- or two-round positions with scripted choices. Where a card's dice would
 * make the result a range, the test plays a COPY of the card with flat dice:
 * the effects are what is under test, and an action's description wins over
 * its handler (CLAUDE.md).
 *
 * "An enemy you choose" falls to the engine's deterministic fallback here (no
 * target policy): the first eligible enemy.
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, CombatEngine, DiceRoll, applyKind, firstLegalChooser, withSeed } from '@pimpampum/engine';
import { attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { createRegistry, getAction } from '../src/index.js';

const registry = createRegistry();
const wait = focusCard();

/** A live card with flat dice: `n`d1 plus `bonus`. */
function flat(id: string, n: number, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const card = getAction(id);
  if (!card) throw new Error(`no card ${id}`);
  return { ...card, dice: new DiceRoll(n, 1), rollBonus: bonus, ...over };
}

/** A plain attack of exactly `total`, fast or not. */
const blow = (total: number, fast = false) => attackCard('cop', { dice: new DiceRoll(1, 1), rollBonus: total - 1, fast });

function engineFor(team0: ReturnType<typeof fighter>[], team1: ReturnType<typeof fighter>[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}

const T = (team: number, idx: number) => [{ team, idx }];
const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });

describe("Mestre de l'aigua", () => {
  it('Font curativa: heals an ally the card\'s roll and puts out Cremat', () => {
    const water = fighter('Aigua', [flat('font-curativa', 4)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    ally.currentPV = 20;
    applyKind(ally, 'damageOverTime', 'cremat', 1, 2);
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 1 }]), sel(0, 1, 0), sel(1, 0, 0)]);
    // Healed 4, and no burn at the round's end.
    expect(ally.currentPV).toBe(24);
    expect(ally.hasStatus('cremat')).toBe(false);
  });

  it('Font curativa: can raise a fallen ally', () => {
    const water = fighter('Aigua', [flat('font-curativa', 5)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 20 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    ally.currentPV = 0;
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 1 }]), sel(1, 0, 0)]);
    expect(ally.currentPV).toBe(5);
  });

  it('Boira espessa: over the whole party for the next 5 rounds, then it lifts', () => {
    const water = fighter('Aigua', [getAction('boira-espessa')!, wait], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    for (let r = 0; r < 5; r++) {
      expect([water.hasStatus('boira-espessa'), ally.hasStatus('boira-espessa')]).toEqual([true, true]);
      playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0)]);
    }
    expect([water.hasStatus('boira-espessa'), ally.hasStatus('boira-espessa')]).toEqual([false, false]);
  });

  it('Boira espessa: about one enemy blow in two is lost in the fog', () => {
    let lost = 0;
    withSeed(31, () => {
      for (let n = 0; n < 400; n++) {
        const water = fighter('Aigua', [getAction('boira-espessa')!, wait], { pv: 30 });
        const foe = fighter('Foe', [wait, blow(5)], { pv: 30 });
        const engine = engineFor([water], [foe]);
        playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
        playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0))]);
        if (water.currentPV === 30) lost++;
      }
    });
    expect(lost / 400).toBeGreaterThan(0.42);
    expect(lost / 400).toBeLessThan(0.58);
  });

  it('Marea de vida: one roll heals the whole party, the fallen too; 1 fatigue', () => {
    const water = fighter('Aigua', [flat('marea-de-vida', 5)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([water, a, b], [foe]);
    water.currentPV = 20;
    a.currentPV = 10;
    b.currentPV = 0;
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    expect([water.currentPV, a.currentPV, b.currentPV]).toEqual([25, 15, 5]);
    expect(water.fatigue).toBe(1);
  });

  it('Marea alta: every enemy that played a Defense this round loses its own defense roll', () => {
    const water = fighter('Aigua', [getAction('marea-alta')!], { pv: 30 });
    const a = fighter('A', [defenseCard('mur', { dice: new DiceRoll(3, 1) })], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([water], [a, b]), [sel(0, 0, 0), sel(1, 0, 0, T(1, 0)), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([27, 30]);
  });


  it('Forma de pop: one defense covers every ally at once', () => {
    const water = fighter('Aigua', [flat('forma-de-pop', 1, 100)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(6)], { pv: 30 });
    const f2 = fighter('F2', [blow(6)], { pv: 30 });
    const engine = engineFor([water, a, b], [f1, f2]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(0, 2, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }]), sel(1, 1, 0, [{ team: 0, idx: 2 }])]);
    expect(a.currentPV).toBe(30);
    expect(b.currentPV).toBe(30);
  });

  it("Control de la sang: next round the chosen enemy's blows land on its own side; 1 fatigue", () => {
    const water = fighter('Aigua', [flat('control-de-la-sang', 0), wait], { pv: 30 });
    const puppet = fighter('Titella', [wait, blow(4)], { pv: 30 });
    const friend = fighter('Company', [wait], { pv: 30 });
    const engine = engineFor([water], [puppet, friend]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(water.fatigue).toBe(1);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(water.currentPV).toBe(30);
    expect(friend.currentPV).toBe(26);
  });

  it('Tsunami: every enemy is struck', () => {
    const water = fighter('Aigua', [flat('tsunami', 1, 3)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([water], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([26, 26]);
  });
});
