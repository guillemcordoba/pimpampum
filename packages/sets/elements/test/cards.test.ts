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
import { type ActionDefinition, CombatEngine, DiceRoll, firstLegalChooser } from '@pimpampum/engine';
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

const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });

describe("Mestre de l'aigua", () => {
  it("Fuet d'aigua: a lash that does not wound guards the bender for the rest of the round", () => {
    // The lash (11, fast) breaks on an unbeatable guard that is up before it
    // (a fast defense); the water comes back and stops a later blow of 5 with
    // the same 11.
    const water = fighter('Aigua', [flat('fuet-d-aigua', 1, 10)], { pv: 30 });
    const wall = fighter('Mur', [defenseCard('mur', { fast: true })], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const engine = engineFor([water], [wall, foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 1, 0, [{ team: 0, idx: 0 }])]);
    expect(water.currentPV).toBe(30);
  });

  it("Fuet d'aigua: a lash that wounds leaves no guard behind", () => {
    const water = fighter('Aigua', [flat('fuet-d-aigua', 1, 10)], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const engine = engineFor([water], [bag, foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0), sel(1, 1, 0, [{ team: 0, idx: 0 }])]);
    expect(bag.currentPV).toBe(19);
    expect(water.currentPV).toBe(25);
  });

  it('Cop desviat: what the defense held by wounds the enemy the bender chooses', () => {
    // Guarding the ally: defense 7 against an attack of 4 holds by 3, and the
    // 3 lands on the first enemy (the deterministic choice).
    const water = fighter('Aigua', [flat('cop-desviat', 1, 6)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(4)], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 1 }]), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.currentPV).toBe(30);
    expect(foe.currentPV).toBe(27);
  });

  it('Bàlsam de lluna: heals an ally, and can raise a fallen one', () => {
    const water = fighter('Aigua', [flat('balsam-de-lluna', 5)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 20 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    ally.currentPV = 0;   // after the engine: a new combat starts everyone whole
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 1 }]), sel(1, 0, 0)]);
    expect(ally.currentPV).toBe(5);
  });

  it('Forma del pop: one defense covers every ally at once', () => {
    const water = fighter('Aigua', [flat('forma-del-pop', 1, 100)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(6)], { pv: 30 });
    const f2 = fighter('F2', [blow(6)], { pv: 30 });
    const engine = engineFor([water, a, b], [f1, f2]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(0, 2, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }]), sel(1, 1, 0, [{ team: 0, idx: 2 }])]);
    expect(a.currentPV).toBe(30);
    expect(b.currentPV).toBe(30);
  });

  it("Braços d'aigua: against an enemy yet to act, the arms block it", () => {
    // The foe acts later (a normal attack) and aims at the ally; blocked, its blow is
    // forced onto the bender and stopped there. The foe is not struck.
    const water = fighter('Aigua', [flat('bracos-d-aigua', 1, 100)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.currentPV).toBe(30);
    expect(water.currentPV).toBe(30);
    expect(foe.currentPV).toBe(30);
  });

  it("Braços d'aigua: against an enemy that already acted, the arms strike it", () => {
    const water = fighter('Aigua', [flat('bracos-d-aigua', 1, 4)], { pv: 30 });
    const foe = fighter('Foe', [blow(1, true)], { pv: 30 });
    const engine = engineFor([water], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(foe.currentPV).toBe(25);
  });

  it("Gel del mestre: the stopped blow, frozen whole, is thrown at the enemy the bender chooses", () => {
    // Blocked, the foe's 6 is forced onto the bender and stopped; the whole 6
    // is thrown back at the first enemy — the foe itself, undefended.
    const water = fighter('Aigua', [flat('gel-del-mestre', 1, 100)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    const engine = engineFor([water, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.currentPV).toBe(30);
    expect(foe.currentPV).toBe(24);
  });

  it('Pluja de dagues: every enemy is struck', () => {
    const water = fighter('Aigua', [flat('pluja-de-dagues', 1, 4)], { pv: 30 });
    const f1 = fighter('F1', [wait], { pv: 30 });
    const f2 = fighter('F2', [wait], { pv: 30 });
    const f3 = fighter('F3', [wait], { pv: 30 });
    const engine = engineFor([water], [f1, f2, f3]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0), sel(1, 2, 0)]);
    expect([f1, f2, f3].map(f => f.currentPV)).toEqual([25, 25, 25]);
  });

  it('Presó de gel: the blocked enemy that attacks the bender loses its next two actions', () => {
    const water = fighter('Aigua', [flat('preso-de-gel', 1, 100), wait], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    const engine = engineFor([water], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(foe.skipTurns).toBe(2);
    // Two rounds frozen: the foe never swings, the bender stays whole.
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(water.currentPV).toBe(30);
  });

  it('Presó de gel: an enemy it did not block is not frozen', () => {
    const water = fighter('Aigua', [flat('preso-de-gel', 1, 100)], { pv: 30 });
    const blocked = fighter('Bloquejat', [wait], { pv: 30 });
    const free = fighter('Lliure', [blow(6)], { pv: 30 });
    const engine = engineFor([water], [blocked, free]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0), sel(1, 1, 0, [{ team: 0, idx: 0 }])]);
    expect(free.skipTurns).toBe(0);
  });

  it("Sang sota la lluna: this round the puppet's blows land on one of its own side", () => {
    const water = fighter('Aigua', [getAction('sang-sota-la-lluna')!], { pv: 30 });
    const puppet = fighter('Titella', [blow(6)], { pv: 30 });
    const friend = fighter('Amic', [wait], { pv: 30 });
    const engine = engineFor([water], [puppet, friend]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }]), sel(1, 1, 0)]);
    expect(water.currentPV).toBe(30);
    expect(friend.currentPV).toBe(24);
  });

  it("Ira de l'oceà: a blow that does not beat the ocean's roll sinks and is owed back; one that beats it lands whole; then the wave hits every enemy", () => {
    // The ocean rolls 1 + 10 = 11 once. F1's 5 sinks (owed back); F2's 20
    // beats it and lands on the ally whole. At round end the wave (its own 1)
    // hits each enemy, F1 plus the 5 it owes.
    const water = fighter('Aigua', [flat('ira-de-l-ocea', 1, 10)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(5)], { pv: 30 });
    const f2 = fighter('F2', [blow(20)], { pv: 30 });
    const engine = engineFor([water, ally], [f1, f2]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 0 }]), sel(1, 1, 0, [{ team: 0, idx: 1 }])]);
    expect(water.currentPV).toBe(30);
    expect(ally.currentPV).toBe(10);
    expect([f1.currentPV, f2.currentPV]).toEqual([24, 29]);
    expect(water.fatigue).toBe(2);   // the ocean's price
  });
});
