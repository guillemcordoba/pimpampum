/**
 * ESGRIMA, PLAYED EXACTLY — each card's own rule on a hand-built one- or
 * two-round position with scripted choices and flat dice (`n`d1 + bonus), so
 * every number is exact. The card's description is the contract (CLAUDE.md).
 *
 * The fencer is at Esgrima 0 with every card unlocked at 0, so no level enters
 * a roll, and wields the destral (+2) unless told otherwise.
 */
import { describe, it, expect } from 'vitest';
import {
  type ActionDefinition, availableActionIndices, type Character, CombatEngine, createCharacter, DiceRoll,
  EffectRegistry, firstLegalChooser,
} from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { COMMON_EFFECTS, MESTRE_ARMES, WEAPONS } from '../src/index.js';

const registry = new EffectRegistry();
for (const [type, h] of Object.entries({ ...COMMON_EFFECTS, ...MESTRE_ARMES.effects })) registry.register(type, h);

const DESTRAL = WEAPONS.find(w => w.id === 'destral')!;

/** An Esgrima card with flat dice: `n`d1 plus `bonus`, playable at level 0. */
function card(id: string, n = 0, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const c = MESTRE_ARMES.actions.find(a => a.id === id)!;
  return { ...c, unlockLevel: 0, dice: c.dice ? new DiceRoll(n, 1) : undefined, rollBonus: bonus, ...over };
}

function fencer(name: string, cards: ActionDefinition[], pv = 30, weapon = true): Character {
  return createCharacter({
    name, classCss: 'test', pv, skills: { 'mestre-armes': 0 }, actions: cards, equipment: weapon ? [DESTRAL] : [],
  });
}

/** A plain attack of exactly `total`, at `speed`. */
const blow = (total: number, speed = 0) => attackCard('cop', { dice: new DiceRoll(1, 1), rollBonus: total - 1, speed });
/** A defense of exactly `total`, at `speed`. */
const guard = (total: number, speed = 5) => defenseCard('guarda', { dice: new DiceRoll(1, 1), rollBonus: total - 1, speed });
const wait = focusCard();

function engineFor(team0: Character[], team1: Character[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}
const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });
const T = (team: number, idx: number) => [{ team, idx }];

describe('Esgrima', () => {
  it('Finta traïdora: −4 to the defense of a target that revealed a Defensa', () => {
    const me = fencer('Esgrimista', [card('finta-traidora', 6)]);
    const foe = fighter('Foe', [guard(5)], { pv: 30 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    // 6 + 2 (destral) = 8 vs 5 − 4 = 1 → 7
    expect(foe.currentPV).toBe(23);
  });

  it("Finta traïdora: an ally's guard alone is not deceived", () => {
    const me = fencer('Esgrimista', [card('finta-traidora', 6)]);
    const foe = fighter('Foe', [wait], { pv: 30 });
    const friend = fighter('Amic', [guard(5)], { pv: 30 });
    playRound(engineFor([me], [foe, friend]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(30);
    expect(friend.currentPV).toBe(27);
  });

  it("Retruc d'acer: a held block answers with 1d6 + weapon that nobody can defend", () => {
    const me = fencer('Esgrimista', [card('retruc-d-acer', 0, 10, { effects: [{ type: 'steel_riposte', params: { dice: new DiceRoll(1, 1) } }] })]);
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const shield = fighter('Escuder', [guard(100)], { pv: 30 });
    playRound(engineFor([me], [foe, shield]), [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(1, 0))]);
    expect(me.currentPV).toBe(30);
    // 1 + 2 (destral), through the escuder's guard
    expect(foe.currentPV).toBe(27);
  });

  it('Guàrdia camaleó: a card swap after the reveal, for the rest of the combat', () => {
    const me = fencer('Esgrimista', [card('guardia-camaleo'), blow(3)]);
    const foe = fighter('Foe', [wait], { pv: 30 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0)]);
    expect(e.cardSwapCharges(me)).toBeGreaterThan(0);
    e.prepareRound();
    e.planActions([sel(0, 0, 0)]);
    expect(e.flowSwapRefs()).toEqual([{ team: 0, idx: 0 }]);
  });

  it('Bufetada insolent: a wound means the target can only attack the fencer next turn', () => {
    const me = fencer('Esgrimista', [card('bufetada-insolent', 1), wait]);
    const friend = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(4)], { pv: 30, ai: true });
    const e = engineFor([friend, me], [foe]);
    playRound(e, [sel(0, 0, 0), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(27);
    // Next turn the foe swings; with no target policy it would take the first
    // enemy in order, the friend.
    playRound(e, [sel(0, 0, 0), sel(0, 1, 1), sel(1, 0, 1)]);
    expect(friend.currentPV).toBe(30);
    expect(me.currentPV).toBe(26);
    // The turn after, it aims freely again.
    playRound(e, [sel(0, 0, 0), sel(0, 1, 1), sel(1, 0, 1)]);
    expect(friend.currentPV).toBe(26);
  });

  it("Bloqueig d'escorpí: next turn the fencer's first attack on the attacker cannot be defended", () => {
    const me = fencer('Esgrimista', [card('bloqueig-d-escorpi', 0, 10), blow(5)]);
    const foe = fighter('Foe', [blow(4), guard(100)], { pv: 30 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(30);
    playRound(e, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
    // Spent: the next blow is defended.
    playRound(e, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
  });

  it('Braç mort: a held block leaves the attacker no Atacs next turn (the last resort stays)', () => {
    const me = fencer('Esgrimista', [card('brac-mort', 0, 10)]);
    const desperate = attackCard('desesperat', { lastResort: true });
    const foe = fighter('Foe', [blow(4), desperate], { pv: 30 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(availableActionIndices(foe, registry)).toEqual([1]);
    e.prepareRound();
    expect(availableActionIndices(foe, registry)).toEqual([1]);
    e.finishRound();
    expect(availableActionIndices(foe, registry)).toEqual([0]);
  });

  it("Bardissa d'acer: its roll also defends against the target's blows, the faster ones too", () => {
    const me = fencer('Esgrimista', [card('bardissa-d-acer', 6)]);
    const foe = fighter('Foe', [blow(8, 9)], { pv: 30 });
    const other = fighter('Altre', [blow(5, 9)], { pv: 30 });
    playRound(engineFor([me], [foe, other]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(0, 0))]);
    // The hedge is 6 + 2 = 8: it holds the foe's 8; the other's 5 lands whole.
    expect(me.currentPV).toBe(25);
    // …and the same 8 is the cut.
    expect(foe.currentPV).toBe(22);
  });

  it("Bardissa d'acer: an AI fencer aims it at the reveal", () => {
    const me = fencer('Esgrimista', [card('bardissa-d-acer', 6)]);
    me.aiControlled = true;
    const foe = fighter('Foe', [blow(8, 9)], { pv: 30 });
    playRound(engineFor([me], [foe]), [sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(30);
    expect(foe.currentPV).toBe(22);
  });

  it("Punt feble: the rest of the combat, defenses against the fencer's side on that enemy have −3", () => {
    const me = fencer('Esgrimista', [card('punt-feble'), wait]);
    const friend = fighter('Amic', [wait, blow(6)], { pv: 30 });
    const foe = fighter('Foe', [wait, guard(5)], { pv: 30 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    // 6 vs 5 − 3 = 2 → 4
    expect(foe.currentPV).toBe(26);
  });

  it("Estocada fantasma: undefendable and through armour once per target; 1 fatigue", () => {
    const me = fencer('Esgrimista', [card('estocada-fantasma', 3)]);
    const foe = fighter('Foe', [guard(100)], { pv: 30, equipment: [armour(3)] });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
    expect(me.fatigue).toBe(1);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
  });

  it('Tall rere tall: while it wounds, a fresh roll at another enemy not yet struck; 2 fatigue', () => {
    const me = fencer('Esgrimista', [card('tall-rere-tall', 3)]);
    const foes = ['A', 'B', 'C'].map(n => fighter(n, [wait], { pv: 30 }));
    playRound(engineFor([me], foes), [sel(0, 0, 0, T(1, 0))]);
    expect(foes.map(f => f.currentPV)).toEqual([25, 25, 25]);
    expect(me.fatigue).toBe(2);
  });

  it('Tall rere tall: stops at the first blow that does not wound', () => {
    const me = fencer('Esgrimista', [card('tall-rere-tall', 3)]);
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [guard(100)], { pv: 30 });
    const e = engineFor([me], [a, b]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(1, 1))]);
    expect(a.currentPV).toBe(25);
    expect(b.currentPV).toBe(30);
  });
});

describe('the light sword (espasa lleugera)', () => {
  const sword = WEAPONS.find(w => w.id === 'espasa-lleugera')!;
  const holder = (level: number) => createCharacter({
    name: 'H', classCss: 'test', pv: 10, skills: { 'mestre-armes': level }, actions: [], equipment: [sword],
  });

  it('gives nothing below Esgrima 2: a weapon at +0, no parry', () => {
    expect(holder(1).getWeaponAttackBonus()).toBe(0);
    expect(holder(1).getRollBonus('mestre-armes', 'defense')).toBe(0);
  });

  it('gives +1 to attack and to Defensa rolls from Esgrima 2', () => {
    expect(holder(2).getWeaponAttackBonus()).toBe(1);
    expect(holder(2).getRollBonus('mestre-armes', 'defense')).toBe(1);
    expect(holder(2).getRollBonus('mestre-armes', 'attack')).toBe(0);
  });
});
