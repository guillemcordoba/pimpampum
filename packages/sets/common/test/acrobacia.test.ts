/**
 * ACROBÀCIA, PLAYED EXACTLY — each card's own rule on a hand-built one- or
 * two-round position with scripted choices and flat dice (`n`d1 + bonus), so
 * every number is exact. The card's description is the contract (CLAUDE.md).
 *
 * The acrobat is at Acrobàcia 0 with every card unlocked at 0, so no level
 * enters a roll, and carries no weapon (the kit needs none).
 */
import { describe, it, expect } from 'vitest';
import {
  type ActionDefinition, type Character, CombatEngine, createCharacter, DiceRoll, EffectRegistry, firstLegalChooser,
} from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { ACROBACIA, COMMON_EFFECTS } from '../src/index.js';

const registry = new EffectRegistry();
for (const [type, h] of Object.entries({ ...COMMON_EFFECTS, ...ACROBACIA.effects })) registry.register(type, h);

/** An Acrobàcia card with flat dice: `n`d1 plus `bonus`, playable at level 0. */
function card(id: string, n = 0, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const c = ACROBACIA.actions.find(a => a.id === id)!;
  return { ...c, unlockLevel: 0, dice: c.dice ? new DiceRoll(n, 1) : undefined, rollBonus: bonus, ...over };
}

function acrobat(name: string, cards: ActionDefinition[], pv = 30): Character {
  return createCharacter({ name, classCss: 'test', pv, skills: { acrobacia: 0 }, actions: cards });
}

/** A plain attack of exactly `total`, fast or not. */
const blow = (total: number, fast = false) => attackCard('cop', { dice: new DiceRoll(1, 1), rollBonus: total - 1, fast });
/** A defense of exactly `total` (test defenses roll no dice). */
const guard = (total: number) => defenseCard('guarda', { rollBonus: total });
const wait = focusCard();

function engineFor(team0: Character[], team1: Character[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}
const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });
const T = (team: number, idx: number) => [{ team, idx }];

describe('Acrobàcia', () => {
  it('needs no weapon: every card is playable unarmed', () => {
    const me = acrobat('Acròbata', ACROBACIA.actions.map(a => ({ ...a, unlockLevel: 0 })));
    const e = engineFor([me], [fighter('Foe', [wait])]);
    expect(me.actions.every((_, i) => e.canPlayActionIdx(me, i))).toBe(true);
  });

  it('Escombrada: a wound puts the target on the ground — +2 to attacks on it to the end of the next round', () => {
    const me = acrobat('Acròbata', [card('escombrada', 3), wait]);
    const friend = fighter('Amic', [wait, blow(4)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(37);
    // Next round: the friend's 4 lands as 6.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(31);
    // The round after, back to 4.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(27);
  });

  it('Escombrada: re-applied, it refreshes rather than stacks', () => {
    const me = acrobat('Acròbata', [card('escombrada', 1)]);
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(39);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // 1 + 2 (on the ground), not + 4.
    expect(foe.currentPV).toBe(36);
    expect(foe.getStatus('a-terra')?.value).toBe(2);
  });

  it('Esquiva i traveta: a held block puts the attacker on the ground', () => {
    const me = acrobat('Acròbata', [card('esquiva-i-traveta', 0, 10), blow(3)]);
    const foe = fighter('Foe', [blow(4)], { pv: 30 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(30);
    expect(foe.hasStatus('a-terra')).toBe(true);
    playRound(e, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(25);
  });

  it("Trampolí de mans: the ally's slow attack resolves now — before the enemy's faster one — and floors whoever it wounds", () => {
    const me = acrobat('Acròbata', [card('trampoli-de-mans')]);
    const friend = fighter('Amic', [blow(3)], { pv: 30 });
    // A normal Focus: the launched blow lands first and interrupts it.
    const foe = fighter('Foe', [focusCard('carrega')], { pv: 30 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(27);
    expect(foe.hasStatus('a-terra')).toBe(true);
    expect(e.logEntries.some(l => l.message.includes("s'interromp"))).toBe(true);
    // The ally's card resolved once, not again in its own slot.
    expect(e.logEntries.filter(l => l.message.includes('colpeja Foe')).length).toBe(1);
  });

  it('Trampolí de mans: an area attack floors every target it wounds, and only those', () => {
    const me = acrobat('Acròbata', [card('trampoli-de-mans')]);
    const friend = fighter('Amic', [attackCard('escombrar', { dice: new DiceRoll(1, 1), rollBonus: 2, targetCount: 99 })], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30, equipment: [armour(5)] });
    playRound(engineFor([me, friend], [a, b]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(a.currentPV).toBe(27);
    expect(a.hasStatus('a-terra')).toBe(true);
    expect(b.currentPV).toBe(30);
    expect(b.hasStatus('a-terra')).toBe(false);
  });

  it('Trampolí de mans: wasted on an ally who has already attacked, or who plays no Atac', () => {
    const me = acrobat('Acròbata', [card('trampoli-de-mans')]);
    const fast = fighter('Ràpid', [blow(3, true)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const e = engineFor([me, fast], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(27);
    expect(foe.hasStatus('a-terra')).toBe(false);

    const me2 = acrobat('Acròbata', [card('trampoli-de-mans')]);
    const waiter = fighter('Quiet', [wait], { pv: 30 });
    const foe2 = fighter('Foe', [blow(4)], { pv: 30 });
    const e2 = engineFor([me2, waiter], [foe2]);
    playRound(e2, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(waiter.currentPV).toBe(26);
    expect(waiter.hasStatus('llancat')).toBe(false);
  });

  it('Trampolí de mans: a wounded acrobat never launches (a Focus)', () => {
    const me = acrobat('Acròbata', [card('trampoli-de-mans')]);
    const friend = fighter('Amic', [blow(3)], { pv: 30 });
    const foe = fighter('Foe', [blow(4, true), focusCard('carrega')], { pv: 30 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(26);
    expect(foe.currentPV).toBe(27);
    expect(foe.hasStatus('a-terra')).toBe(false);
  });

  it("Puntada d'espagat: two enemies, one roll", () => {
    const me = acrobat('Acròbata', [card('puntada-d-espagat', 5)]);
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const c = fighter('C', [wait], { pv: 30 });
    playRound(engineFor([me], [a, b, c]), [sel(0, 0, 0, [{ team: 1, idx: 0 }, { team: 1, idx: 2 }]), sel(1, 0, 0), sel(1, 1, 0), sel(1, 2, 0)]);
    expect([a.currentPV, b.currentPV, c.currentPV]).toEqual([25, 30, 25]);
  });

  it('Tombarella de rescat: guards the first ally attacked after it, and its acrobat', () => {
    const me = acrobat('Acròbata', [card('tombarella-de-rescat', 0, 10)]);
    const x = fighter('X', [wait], { pv: 30 });
    const y = fighter('Y', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(6)], { pv: 30 });
    const f2 = fighter('F2', [blow(5)], { pv: 30 });
    const f3 = fighter('F3', [blow(7)], { pv: 30 });
    playRound(engineFor([me, x, y], [f1, f2, f3]), [
      sel(0, 0, 0), sel(0, 1, 0), sel(0, 2, 0),
      sel(1, 0, 0, T(0, 2)), sel(1, 1, 0, T(0, 1)), sel(1, 2, 0, T(0, 0)),
    ]);
    // Y is attacked first and rescued; X, attacked second, is not; the acrobat
    // still defends itself.
    expect([me.currentPV, x.currentPV, y.currentPV]).toEqual([30, 25, 30]);
  });

  it("Cavalcar l'enemic: a wound means the target cannot attack the acrobat next round", () => {
    const me = acrobat('Acròbata', [card('cavalcar-l-enemic', 2), wait]);
    const friend = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(4)], { pv: 30, ai: true });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(28);
    // Its AI aim would take the first enemy, the acrobat: it cannot.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1)]);
    expect(me.currentPV).toBe(30);
    expect(friend.currentPV).toBe(26);
    // The round after, it can again.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1)]);
    expect(me.currentPV).toBe(26);
  });

  it("Cavalcar l'enemic: alone with the acrobat, the ridden enemy's blow lands on nobody", () => {
    const me = acrobat('Acròbata', [card('cavalcar-l-enemic', 2), wait]);
    const foe = fighter('Foe', [wait, blow(4)], { pv: 30, ai: true });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1)]);
    expect(me.currentPV).toBe(30);
  });

  it('Trepitjar caps: every enemy, and the one chosen is on the ground, wounded or not', () => {
    const me = acrobat('Acròbata', [card('trepitjar-caps', 3)]);
    const a = fighter('A', [guard(100)], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([me], [a, b]), [sel(0, 0, 0), sel(1, 0, 0, T(1, 0)), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([30, 27]);
    // No target policy: the engine's choice is the first enemy, held and all.
    expect(a.hasStatus('a-terra')).toBe(true);
    expect(b.hasStatus('a-terra')).toBe(false);
  });

  it('Salt mortal: the height chosen at the reveal adds to the attack; if the target stands, the acrobat loses it', () => {
    const me = acrobat('Acròbata', [card('salt-mortal', 3)]);
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)], [2]);
    // 3 + 6
    expect(foe.currentPV).toBe(21);
    expect(me.currentPV).toBe(24);
    expect(me.fatigue).toBe(1);
  });

  it('Salt mortal: a target that drops costs nothing but the fatigue', () => {
    const me = acrobat('Acròbata', [card('salt-mortal', 3)]);
    const foe = fighter('Foe', [wait], { pv: 7 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)], [1]);
    expect(foe.isAlive()).toBe(false);
    expect(me.currentPV).toBe(30);
    expect(me.fatigue).toBe(1);
  });

  it('Salt mortal: the loss ignores armour', () => {
    const me = createCharacter({
      name: 'Acròbata', classCss: 'test', pv: 30, skills: { acrobacia: 0 }, actions: [card('salt-mortal', 1)],
      equipment: [armour(5)],
    });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)], [0]);
    expect(me.currentPV).toBe(28);
  });

  it('Salt mortal: an AI acrobat takes the lowest height that drops the softest enemy', () => {
    const me = acrobat('Acròbata', [card('salt-mortal', 3)]);
    me.aiControlled = true;
    const foe = fighter('Foe', [wait], { pv: 7 });
    playRound(engineFor([me], [foe]), [sel(1, 0, 0)]);
    // 3 + 4 = 7 drops it: +4, not +6.
    expect(foe.currentPV).toBe(0);
    expect(me.currentPV).toBe(30);
  });

  it('Malabars a puntades: while a blow wounds, kick again — four blows at most — and the wounded is on the ground', () => {
    const me = acrobat('Acròbata', [card('malabars-a-puntades', 2)]);
    const foe = fighter('Foe', [wait], { pv: 40 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // Four blows of 2: the target goes to the ground only at the end, so none
    // of them has the +2.
    expect(foe.currentPV).toBe(32);
    expect(foe.hasStatus('a-terra')).toBe(true);
    expect(me.fatigue).toBe(1);
  });

  it('Malabars a puntades: four blows while they wound; a held first blow ends it', () => {
    const me = acrobat('Acròbata', [card('malabars-a-puntades', 4)]);
    const foe = fighter('Foe', [wait], { pv: 40, equipment: [armour(3)] });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // Each blow: 4 − 3 armour → 1. Four blows.
    expect(foe.currentPV).toBe(36);
    const me2 = acrobat('Acròbata', [card('malabars-a-puntades', 4)]);
    const foe2 = fighter('Foe', [guard(4)], { pv: 40 });
    playRound(engineFor([me2], [foe2]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe2.currentPV).toBe(40);
    expect(foe2.hasStatus('a-terra')).toBe(false);
  });

  it('Capbussó suïcida: every enemy; the wounded are on the ground, and so is the acrobat', () => {
    const me = acrobat('Acròbata', [card('capbusso-suicida', 5)]);
    const a = fighter('A', [guard(100)], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([me], [a, b]), [sel(0, 0, 0), sel(1, 0, 0, T(1, 0)), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([30, 25]);
    expect(a.hasStatus('a-terra')).toBe(false);
    expect(b.hasStatus('a-terra')).toBe(true);
    expect(me.hasStatus('a-terra')).toBe(true);
    expect(me.fatigue).toBe(2);
  });
});
