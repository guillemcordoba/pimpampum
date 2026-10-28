/**
 * ARTÍFEX, PLAYED EXACTLY — each card's own rule on a hand-built position with
 * scripted choices and flat dice (`n`d1 + bonus), so every number is exact.
 * The card's description is the contract (CLAUDE.md).
 *
 * The artificer sits at Artífex 5 with every card unlocked at 0: its own card
 * plays add the 5, its gadgets acting on their own do not — which is the
 * Corda rule, and is checked on every gadget below.
 */
import { describe, it, expect } from 'vitest';
import {
  type ActionDefinition, type Character, CombatEngine, createCharacter, DiceRoll, EffectRegistry, firstLegalChooser,
} from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { ARTIFEX, COMMON_EFFECTS } from '../src/index.js';

const registry = new EffectRegistry();
for (const [type, h] of Object.entries({ ...COMMON_EFFECTS, ...ARTIFEX.effects })) registry.register(type, h);

const LEVEL = 5;

/** An Artífex card with flat dice: `n`d1 plus `bonus`, playable at level 0. */
function card(id: string, n = 0, bonus = 0): ActionDefinition {
  const c = ARTIFEX.actions.find(a => a.id === id)!;
  return { ...c, unlockLevel: 0, dice: new DiceRoll(n, 1), rollBonus: bonus };
}

function artificer(name: string, cards: ActionDefinition[], pv = 60): Character {
  return createCharacter({ name, classCss: 'test', pv, skills: { artifex: LEVEL }, actions: cards });
}

/** A plain attack of exactly `total`, fast or not. */
const blow = (total: number, fast = false, over: Partial<ActionDefinition> = {}) =>
  attackCard(`cop-${total}`, { dice: new DiceRoll(1, 1), rollBonus: total - 1, fast, ...over });
/** A defense of exactly `total`, fast or not (test defenses roll no dice). */
const guard = (total: number, fast = false) => defenseCard('guarda', { rollBonus: total, fast });
const wait = focusCard();

function engineFor(team0: Character[], team1: Character[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}
const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });
const T = (team: number, idx: number) => [{ team, idx }];

describe('Artífex', () => {
  it('needs no weapon: every card is playable unarmed', () => {
    const me = artificer('Artífex', ARTIFEX.actions.map(a => ({ ...a, unlockLevel: 0 })));
    const e = engineFor([me, fighter('Amic', [wait])], [fighter('Foe', [wait])]);
    expect(me.actions.every((_, i) => e.canPlayActionIdx(me, i))).toBe(true);
  });

  it('Bumerang: the card attack, then at the round\'s end it comes back — the dice alone, once', () => {
    const me = artificer('Artífex', [card('bumerang', 2), wait]);
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // 2 + 5, then 2.
    expect(foe.currentPV).toBe(31);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(31);
  });

  it('Parany de molla: waits at an ally\'s feet; the first attack on them faces it and costs the attacker 3 PV', () => {
    const me = artificer('Artífex', [card('parany-de-molla', 3), wait]);
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(12)], { pv: 30 });
    const e = engineFor([me, ally], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(ally.currentPV).toBe(30);
    expect(foe.currentPV).toBe(30);
    // A round later: 12 against the trap's 3 + 5 → 4; the attacker loses 3.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(26);
    expect(foe.currentPV).toBe(27);
    // Sprung: the next one lands whole.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(14);
    expect(foe.currentPV).toBe(27);
  });

  it('Parany de molla: the round it is laid, it replaces the card\'s guard on that ally instead of adding to it', () => {
    const me = artificer('Artífex', [card('parany-de-molla', 3)]);
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(12)], { pv: 30 });
    playRound(engineFor([me, ally], [foe]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(26);
    expect(foe.currentPV).toBe(27);
    expect(me.currentPV).toBe(60);
  });

  it('Autòmat de corda: Corda 3 — three round ends, the dice alone, then it stops; played again it is wound back', () => {
    const me = artificer('Artífex', [card('automat-de-corda', 2), wait]);
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(38);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(me.getStatusValue('automat-de-corda')).toBe(1);
    playRound(e, [sel(0, 0, 0), sel(1, 0, 0)]);
    expect(me.getStatusValue('automat-de-corda')).toBe(2);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(30);
    expect(me.hasStatus('automat-de-corda')).toBe(false);
  });

  it('a gadget vanishes when its maker falls', () => {
    const me = artificer('Artífex', [card('automat-de-corda', 2), wait], 5);
    const foe = fighter('Foe', [wait, blow(10)], { pv: 40 });
    const e = engineFor([me], [foe, fighter('Foe 2', [wait], { pv: 40 })]);
    playRound(e, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(me.hasStatus('automat-de-corda')).toBe(true);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(me.isAlive()).toBe(false);
    expect(me.hasStatus('automat-de-corda')).toBe(false);
  });

  it('Paraigua blindat: against an attack on several of you it guards each one; against a single blow, only its own ally', () => {
    const me = artificer('Artífex', [card('paraigua-blindat', 0, 1)]);
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const sweeper = fighter('Sweeper', [blow(10, false, { targetCount: 99 })], { pv: 30 });
    const striker = fighter('Striker', [blow(10)], { pv: 30 });
    playRound(engineFor([me, a, b], [sweeper, striker]), [
      sel(0, 0, 0, T(0, 0)), sel(0, 1, 0), sel(0, 2, 0), sel(1, 0, 0), sel(1, 1, 0, T(0, 1)),
    ]);
    // The sweep (10) meets the umbrella's 1 + 5 on each of the three: 4 each,
    // all taken by its holder. The single blow on A finds A alone.
    expect(me.currentPV).toBe(48);
    expect(a.currentPV).toBe(20);
    expect(b.currentPV).toBe(30);
  });

  it('Ganxo salvavides: the first attack this round on an ally does not touch them — not on you, not the second', () => {
    const me = artificer('Artífex', [card('ganxo-salvavides', 0, 1)]);
    const ally = fighter('Amic', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(10)], { pv: 30 });
    const f2 = fighter('F2', [blow(10)], { pv: 30 });
    playRound(engineFor([me, ally], [f1, f2]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 1)), sel(1, 1, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(20);
    const me2 = artificer('Artífex', [card('ganxo-salvavides', 0, 1)]);
    const ally2 = fighter('Amic', [wait], { pv: 30 });
    const f3 = fighter('F3', [blow(10)], { pv: 30 });
    playRound(engineFor([me2, ally2], [f3]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 0))]);
    // On the artificer: its own 2d6 (here 1) + 5 guards it.
    expect(me2.currentPV).toBe(56);
  });

  it('Ballesta sentinella: Corda 3 — a bolt just before each of its cards, the dice alone; a wound cancels a Focus', () => {
    const resolved: string[] = [];
    const reg = new EffectRegistry();
    for (const [type, h] of Object.entries({ ...COMMON_EFFECTS, ...ARTIFEX.effects })) reg.register(type, h);
    reg.register('note', { onResolve(ctx) { resolved.push(ctx.source.name); } });
    const me = artificer('Artífex', [card('ballesta-sentinella', 2), wait]);
    const foe = fighter('Foe', [blow(3), focusCard('pensar', { effects: [{ type: 'note' }] }), wait], { pv: 40 });
    const e = new CombatEngine([me], [foe], { registry: reg, actionChooser: firstLegalChooser });
    // The crossbow is a Focus: hit first and it never goes up, so it is set up
    // in a round the foe only waits — committed first, it is up before the
    // foe's card in the same step, and shoots it.
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 2)]);
    expect([foe.currentPV, me.currentPV]).toEqual([38, 60]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1)]);
    expect(foe.currentPV).toBe(36);
    expect(resolved).toEqual([]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect([foe.currentPV, me.currentPV]).toEqual([34, 57]);
    expect(foe.statuses.size).toBe(0);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1)]);
    expect(foe.currentPV).toBe(34);
    expect(resolved).toEqual(['Foe']);
  });

  it('Trepant incansable: through the armour; stuck, it wounds again at two round ends, through any guard', () => {
    const me = artificer('Artífex', [card('trepant-incansable', 2), wait]);
    const foe = fighter('Foe', [wait, guard(100, true)], { pv: 40, equipment: [armour(2)] });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // 2 + 5, armour ignored; then 2 at the round's end.
    expect(foe.currentPV).toBe(31);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1, T(1, 0))]);
    expect(foe.currentPV).toBe(29);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(29);
  });

  it('Trepant incansable: a drill that does not wound does not stick, and pulls the old one out', () => {
    const me = artificer('Artífex', [card('trepant-incansable', 2), wait]);
    const foe = fighter('Foe', [wait, guard(100, true)], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.statuses.size).toBe(1);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(foe.statuses.size).toBe(0);
    expect(foe.currentPV).toBe(31);
  });

  it('Baldufa de ganivets: every enemy; then 2 dice and 1 die at the next round ends, one roll each; +1 fatigue', () => {
    const me = artificer('Artífex', [card('baldufa-de-ganivets', 3), wait]);
    const x = fighter('X', [wait], { pv: 40 });
    const y = fighter('Y', [wait], { pv: 40 });
    const e = engineFor([me], [x, y]);
    playRound(e, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([x.currentPV, y.currentPV]).toEqual([30, 30]);
    expect(me.fatigue).toBe(1);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([x.currentPV, y.currentPV]).toEqual([29, 29]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([x.currentPV, y.currentPV]).toEqual([29, 29]);
  });

  it('Colós de butxaca: attacks on you meet its defense instead of yours, an area attack once; at 0 it falls on an enemy; +2 fatigue', () => {
    const me = artificer('Artífex', [card('colos-de-butxaca', 3), wait]);
    const ally = fighter('Amic', [guard(50, true), wait], { pv: 30 });
    const sweeper = fighter('Sweeper', [blow(10, false, { targetCount: 99 }), wait], { pv: 40 });
    const striker = fighter('Striker', [blow(10), wait], { pv: 40 });
    const e = engineFor([me, ally], [sweeper, striker]);
    playRound(e, [sel(0, 0, 0), sel(0, 1, 0, T(0, 1)), sel(1, 0, 0), sel(1, 1, 0, T(0, 1))]);
    // Every blow meets the colossus's 3 (the ally's own 50 is passed over):
    // the sweep 7 on each, the strike 7 on the ally. Two of its three turns.
    expect([me.currentPV, ally.currentPV]).toEqual([53, 16]);
    expect(me.getStatusValue('colos-de-butxaca')).toBe(1);
    expect(me.fatigue).toBe(2);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1), sel(1, 0, 1), sel(1, 1, 0, T(0, 0))]);
    // Its last turn, then it falls: 3 on one of them.
    expect(me.currentPV).toBe(46);
    expect(me.hasStatus('colos-de-butxaca')).toBe(false);
    expect(80 - sweeper.currentPV - striker.currentPV).toBe(3);
  });

  it('Boa mecànica: coiled, the target cannot defend, and is squeezed with 4, 5 and 6 dice; +2 fatigue', () => {
    const me = artificer('Artífex', [card('boa-mecanica', 3), wait]);
    const friend = fighter('Amic', [wait, blow(5)], { pv: 30 });
    const foe = fighter('Foe', [wait, guard(100, true)], { pv: 60 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0)]);
    // 3 + 5, then 4.
    expect(foe.currentPV).toBe(48);
    expect(me.fatigue).toBe(2);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    // Its guard does not count: 5, then 5.
    expect(foe.currentPV).toBe(38);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(32);
    // Uncoiled: the guard holds again.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(foe.currentPV).toBe(32);
  });
});
