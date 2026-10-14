/**
 * MESTRE DEL XI, PLAYED EXACTLY — each card's own rule on a hand-built
 * position with scripted choices and flat dice (`n`d1 + bonus), so every
 * number is exact. The card's description is the contract (CLAUDE.md); Toc de
 * la mort is played in every rule variant its handler takes.
 *
 * The master is at level 0 with every card unlocked at 0, so no level enters
 * a roll — but the fatigue a card costs does, from the round after.
 */
import { describe, it, expect } from 'vitest';
import {
  type ActionDefinition, type ActionEffect, type Character, CombatEngine, CombatModifier, createCharacter, DiceRoll, EffectRegistry,
  firstLegalChooser, getActionTargetRequirement, ModifierDuration,
} from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { BODY_OUT, COMMON_EFFECTS, HARM, MESTRE_DEL_XI, TOC_DE_LA_MORT_VARIANTS, type TocVariant } from '../src/index.js';

const registry = new EffectRegistry();
for (const [type, h] of Object.entries({ ...COMMON_EFFECTS, ...MESTRE_DEL_XI.effects })) registry.register(type, h);
// A rider for "its card has no effect": +10 on the attack.
registry.register('test_rider', { modifyAttack(ctx) { ctx.attackMods!.rollBonus += 10; } });

/** A Mestre del xi card with flat dice: `n`d1 plus `bonus`, playable at level 0. */
function card(id: string, n = 0, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const c = MESTRE_DEL_XI.actions.find(a => a.id === id)!;
  return { ...c, unlockLevel: 0, dice: c.dice ? new DiceRoll(n, 1) : undefined, rollBonus: bonus, ...over };
}

/** Toc de la mort's effects in one variant (`extra` params for the touch). */
function toc(variant: TocVariant, extra: Record<string, unknown> = {}): ActionEffect[] {
  return [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'death_touch', params: { variant, ...extra } }];
}

function master(name: string, cards: ActionDefinition[], pv = 30): Character {
  return createCharacter({ name, classCss: 'test', pv, skills: { 'mestre-del-xi': 0 }, actions: cards });
}

/** A plain attack of exactly `total`, at `speed`. */
const blow = (total: number, speed = 0) => attackCard('cop', { dice: new DiceRoll(1, 1), rollBonus: total - 1, speed });
/** A defense of exactly `total`, at `speed` (test defenses roll no dice). */
const guard = (total: number, speed = 5) => defenseCard('guarda', { rollBonus: total, speed });
const wait = focusCard();

function engineFor(team0: Character[], team1: Character[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}
const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });
const T = (team: number, idx: number) => [{ team, idx }];

describe('Mestre del xi', () => {
  it('needs no weapon: every card is playable unarmed', () => {
    const me = master('Mestre', MESTRE_DEL_XI.actions.map(a => ({ ...a, unlockLevel: 0 })));
    const e = engineFor([me], [fighter('Foe', [wait])]);
    expect(me.actions.every((_, i) => e.canPlayActionIdx(me, i))).toBe(true);
  });

  it('Cop al nervi: a wound numbs — its attacks −3 to the end of the next round', () => {
    const me = master('Mestre', [card('cop-al-nervi', 3), wait]);
    const foe = fighter('Foe', [blow(7)], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(37);
    expect(me.currentPV).toBe(26);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(22);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(15);
  });

  it('Cop al nervi: the −3 is on the attack roll, not on the damage after the defense', () => {
    const me = master('Mestre', [card('cop-al-nervi', 3), guard(5, 9)]);
    const foe = fighter('Foe', [blow(10)], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(23);
    // 10 − 3 = 7 against a defense of 5: 2 through.
    playRound(e, [sel(0, 0, 1, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(21);
  });

  it('Cop al nervi: numbed again, it only renews', () => {
    const me = master('Mestre', [card('cop-al-nervi', 3)]);
    const foe = fighter('Foe', [blow(9)], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    // 9 → 6 each round, never 3.
    expect(me.currentPV).toBe(18);
  });

  it('Pinça entumidora: blocks an enemy; when it holds, the attacker is numb', () => {
    const me = master('Mestre', [card('pinca-entumidora', 0, 9), wait]);
    const friend = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const e = engineFor([me, friend], [foe]);
    expect(getActionTargetRequirement(me.actions[0].def, registry)).toBe('enemy');
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect([me.currentPV, friend.currentPV]).toEqual([30, 30]);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(friend.currentPV).toBe(28);
  });

  it('Desbloquejar el cos: a standing ally recovers 4 PV and sheds every efecte negatiu', () => {
    const me = master('Mestre', [card('desbloquejar-el-cos')]);
    const ally = fighter('Aliat', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const e = engineFor([me, ally], [foe]);
    ally.currentPV = 20;
    ally.setStatus('verí', 2, -1, { dot: 2, ...HARM });
    ally.setStatus('benedicció', 1, -1);
    ally.addModifier(new CombatModifier('defense', -2, ModifierDuration.RestOfCombat).withData({ ...HARM }));
    ally.addModifier(new CombatModifier('defense', -1, ModifierDuration.RestOfCombat));
    ally.skipTurns = 2;
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(1, 0, 0)]);
    expect(ally.currentPV).toBe(24);
    expect([...ally.statuses.keys()]).toEqual(['benedicció']);
    // Its own price stays: only what an enemy card left goes.
    expect(ally.modifiers.map(m => m.value)).toEqual([-1]);
    expect(ally.skipTurns).toBe(0);
  });

  it('Desbloquejar el cos: you too — and never the fallen', () => {
    const me = master('Mestre', [card('desbloquejar-el-cos')]);
    const e = engineFor([me], [fighter('Foe', [wait], { pv: 30 })]);
    me.currentPV = 28;
    me.setStatus('marca', 2, -1, { ...HARM });
    playRound(e, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0)]);
    expect(me.currentPV).toBe(30);
    expect(me.hasStatus('marca')).toBe(false);
    const unblocking = card('desbloquejar-el-cos');
    expect(unblocking.canReviveTarget).toBeFalsy();
    expect(getActionTargetRequirement(unblocking, registry)).toBe('ally');
    const fallen = fighter('Caigut', [wait], { pv: 12 });
    const me2 = master('Mestre', [unblocking]);
    const e2 = engineFor([me2, fallen], [fighter('Foe', [wait], { pv: 30 })]);
    fallen.currentPV = 0;
    playRound(e2, [sel(0, 0, 0, T(0, 1)), sel(1, 0, 0)]);
    expect(fallen.currentPV).toBe(0);
  });

  it('Desbloquejar el cos: a numbed ally is freed of it', () => {
    const me = master('Mestre', [card('desbloquejar-el-cos')]);
    const ally = fighter('Aliat', [wait], { pv: 30 });
    const foe = fighter('Foe', [card('cop-al-nervi', 3), blow(7)], { pv: 30 });
    const e = engineFor([me, ally], [foe]);
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    expect(ally.hasStatus('entumit')).toBe(false);
  });

  it('Desbloquejar el cos: a body taken out of the fight is out of reach', () => {
    const me = master('Mestre', [card('desbloquejar-el-cos')]);
    const ally = fighter('Aliat', [wait], { pv: 30 });
    const e = engineFor([me, ally], [fighter('Foe', [wait], { pv: 30 })]);
    ally.currentPV = 20;
    ally.setStatus('engolit', 1, -1, { ...BODY_OUT });
    ally.setStatus('verí', 2, -1, { dot: 2, ...HARM });
    ally.skipTurns = 3;
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(1, 0, 0)]);
    expect(ally.currentPV).toBe(20);
    expect(ally.hasStatus('verí')).toBe(true);
    expect(ally.skipTurns).toBe(2);
  });

  it('Poder apagat: a wound means next round its card has no effect — only its dice', () => {
    const me = master('Mestre', [card('poder-apagat', 3), wait], 40);
    const foe = fighter('Foe', [attackCard('cop', { dice: new DiceRoll(1, 1), speed: 0, effects: [{ type: 'test_rider' }] })], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(37);
    expect(me.currentPV).toBe(29);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(28);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(17);
  });

  it('Bloqueig mutu: blocks an enemy; if it holds, next round neither plays a card', () => {
    const me = master('Mestre', [card('bloqueig-mutu', 0, 9), blow(2)]);
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(30);
    e.prepareRound();
    expect(e.planActions([sel(0, 0, 1, T(1, 0)), sel(1, 0, 0, T(0, 0))])).toEqual([]);
    e.finishRound();
    playRound(e, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect([me.currentPV, foe.currentPV]).toEqual([25, 28]);
  });

  it('Bloqueig mutu: holding against an enemy it did not block locks nobody', () => {
    const me = master('Mestre', [card('bloqueig-mutu', 0, 9)]);
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [blow(5)], { pv: 30 });
    playRound(engineFor([me], [a, b]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(0, 0))]);
    expect(me.currentPV).toBe(30);
    expect(me.hasStatus('bloqueig-mutu') || b.hasStatus('bloqueig-mutu')).toBe(false);
  });

  it('Ràfega de dits: three blows; three wounds numb it and cancel its action', () => {
    const me = master('Mestre', [card('rafega-de-dits', 1, 2)]);
    const foe = fighter('Foe', [blow(4)], { pv: 40 });
    playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(31);
    expect(me.currentPV).toBe(30);
    expect(foe.hasStatus('entumit')).toBe(true);
  });

  it('Ràfega de dits: two wounds numb it; its action still resolves', () => {
    const me = master('Mestre', [card('rafega-de-dits', 1, 2)]);
    const foe = fighter('Foe', [blow(4)], { pv: 40 });
    const e = engineFor([me], [foe]);
    // Every second blow on it is soaked.
    foe.setStatus('pell', 0, -1, undefined, {
      modifyIncomingDamage(ctx, dmg) { ctx.entry.value++; return ctx.entry.value % 2 === 0 ? 0 : dmg; },
    });
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(34);
    // Its blow of 4, numb: 1.
    expect(me.currentPV).toBe(29);
  });

  it('Ràfega de dits: one wound, nothing', () => {
    const me = master('Mestre', [card('rafega-de-dits', 1, 2)]);
    const foe = fighter('Foe', [blow(4)], { pv: 40, equipment: [armour(2)] });
    const e = engineFor([me], [foe]);
    foe.setStatus('pell', 0, -1, undefined, {
      modifyIncomingDamage(ctx, dmg) { ctx.entry.value++; return ctx.entry.value === 1 ? dmg : 0; },
    });
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(39);
    expect(foe.hasStatus('entumit')).toBe(false);
    expect(me.currentPV).toBe(26);
  });

  it('Tocs en cadena: up to three enemies, one roll; the wounded are numb', () => {
    const me = master('Mestre', [card('tocs-en-cadena', 4)]);
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [guard(100)], { pv: 30 });
    const c = fighter('C', [wait], { pv: 30 });
    const d = fighter('D', [wait], { pv: 30 });
    playRound(engineFor([me], [a, b, c, d]), [
      sel(0, 0, 0, [{ team: 1, idx: 0 }, { team: 1, idx: 1 }, { team: 1, idx: 2 }]),
      sel(1, 0, 0), sel(1, 1, 0, T(1, 1)), sel(1, 2, 0), sel(1, 3, 0),
    ]);
    expect([a.currentPV, b.currentPV, c.currentPV, d.currentPV]).toEqual([26, 30, 26, 30]);
    expect([a, b, c, d].map(x => x.hasStatus('entumit'))).toEqual([true, false, true, false]);
  });

  it('Cop de vida: a fallen ally rises with half its starting PV and one level of fatigue', () => {
    const me = master('Mestre', [card('cop-de-vida')]);
    const fallen = fighter('Caigut', [wait], { pv: 13 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const e = engineFor([me, fallen], [foe]);
    fallen.currentPV = 0;
    expect(getActionTargetRequirement(me.actions[0].def, registry)).toBe('fallen_ally');
    playRound(e, [sel(0, 0, 0, T(0, 1)), sel(1, 0, 0)]);
    expect(fallen.currentPV).toBe(6);
    expect(fallen.fatigue).toBe(1);
    // Nobody fallen: nothing happens.
    fallen.currentPV = 3;
    playRound(e, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(fallen.currentPV).toBe(3);
    expect(fallen.fatigue).toBe(1);
  });

  it('Tempesta de son: every enemy, no damage; the beaten sleep from the end of the round until they lose PV', () => {
    const storm = card('tempesta-de-son', 0, 9, {
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'sleep_storm', params: { wake: 21 } }],
    });
    const me = master('Mestre', [storm, wait]);
    const friend = fighter('Amic', [wait, blow(4)], { pv: 30 });
    const a = fighter('A', [blow(3)], { pv: 30 });
    const b = fighter('B', [guard(100)], { pv: 30 });
    const e = engineFor([me, friend], [a, b]);
    playRound(e, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(1, 1))]);
    // No damage; its blow this round still lands.
    expect([a.currentPV, b.currentPV, me.currentPV]).toEqual([30, 30, 27]);
    expect(me.fatigue).toBe(2);
    expect(a.hasStatus('adormit')).toBe(true);
    expect(b.hasStatus('adormit')).toBe(false);
    // Asleep: no card (11+ on a d20 can't be rolled at `wake: 21`).
    e.prepareRound();
    expect(e.planActions([sel(0, 0, 1), sel(0, 1, 0), sel(1, 1, 0, T(1, 1))]).map(r => r.actorName)).not.toContain('A');
    let r = e.resolveNextAction();
    while (r.kind !== 'done') r = e.resolveNextAction();
    e.finishRound();
    // Woken by a blow (it had already lost this round's card)…
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 1, 0, T(1, 1))]);
    expect(a.currentPV).toBe(26);
    expect(a.hasStatus('adormit')).toBe(false);
    // …it plays again.
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(1, 1))]);
    expect(me.currentPV).toBe(24);
  });

  it('Tempesta de son: an 11+ on the d20 as a round begins wakes the sleeper', () => {
    const storm = card('tempesta-de-son', 0, 9, {
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'sleep_storm', params: { wake: 1 } }],
    });
    const me = master('Mestre', [storm, wait]);
    const a = fighter('A', [blow(3)], { pv: 30 });
    const e = engineFor([me], [a]);
    playRound(e, [sel(0, 0, 0), sel(1, 0, 0, T(0, 0))]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(me.currentPV).toBe(24);
  });
});

describe('Toc de la mort, in each variant', () => {
  it('ships the default variant, with its own text', () => {
    const c = MESTRE_DEL_XI.actions.find(a => a.id === 'toc-de-la-mort')!;
    const variant = c.effects.find(e => e.type === 'death_touch')!.params!['variant'] as TocVariant;
    expect(variant).toBe('resso');
    expect(c.description).toBe(TOC_DE_LA_MORT_VARIANTS[variant]);
  });

  it('mig-pv: at the end of next round it falls if under half its starting PV', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc('mig-pv') }), wait], 40);
    const friend = fighter('Amic', [blow(8), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 20 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(17);
    expect(me.fatigue).toBe(1);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.isAlive()).toBe(false);
  });

  it('mig-pv: at half or above, it stands', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc('mig-pv') }), wait], 40);
    const foe = fighter('Foe', [wait], { pv: 20 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(17);
    expect(foe.hasStatus('toc-de-la-mort')).toBe(false);
  });

  it('resso: at the end of next round it loses again every PV lost since the touch', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc('resso') }), wait], 40);
    const friend = fighter('Amic', [blow(5), blow(4), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(32);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 0)]);
    // 37 → 32 → 28, then the echo of 5 + 4.
    expect(foe.currentPV).toBe(19);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 2), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(19);
  });

  it('cop-retardat: at the end of next round it takes the dice, undefended, its armour counting', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 5, 0, { effects: toc('cop-retardat', { dice: new DiceRoll(0, 1, 10) }) }), wait], 40);
    const foe = fighter('Foe', [wait, guard(100)], { pv: 40, equipment: [armour(2)] });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(37);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 1, T(1, 0))]);
    // Its guard is up all round: the blow is not defended. 10 − 2.
    expect(foe.currentPV).toBe(29);
  });

  it('cinc-passes: it falls once it has played three more cards; a lost turn does not count', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc('cinc-passes') }), wait], 40);
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    foe.setStatus('held', 1, 1, undefined, { skipsRound: () => true });
    for (let i = 0; i < 3; i++) playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.isAlive()).toBe(true);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.isAlive()).toBe(false);
  });

  it('tres-tocs: the third touch fells it', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 6, 0, { effects: toc('tres-tocs') })], 40);
    const foe = fighter('Foe', [wait], { pv: 60 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // 6, then 6 − 1 fatigue.
    expect(foe.currentPV).toBe(49);
    expect(foe.getStatusValue('toc-de-la-mort')).toBe(2);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.isAlive()).toBe(false);
    expect(me.fatigue).toBe(3);
  });

  it('tres-tocs: a round without a touch loses them all', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 6, 0, { effects: toc('tres-tocs') }), wait], 40);
    const foe = fighter('Foe', [wait], { pv: 60 });
    const e = engineFor([me], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(e, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.hasStatus('toc-de-la-mort')).toBe(false);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.getStatusValue('toc-de-la-mort')).toBe(1);
  });

  it('cor-ferit: at the end of next round it loses 3 PV per wound since the touch', () => {
    const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc('cor-ferit') }), wait], 40);
    const friend = fighter('Amic', [blow(2), blow(3), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 40 });
    const e = engineFor([me, friend], [foe]);
    playRound(e, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(35);
    playRound(e, [sel(0, 0, 1), sel(0, 1, 1, T(1, 0)), sel(1, 0, 0)]);
    // 35 → 32, then two wounds × 3.
    expect(foe.currentPV).toBe(26);
  });

  it('a touch that does not wound leaves nothing', () => {
    for (const variant of Object.keys(TOC_DE_LA_MORT_VARIANTS) as TocVariant[]) {
      const me = master('Mestre', [card('toc-de-la-mort', 3, 0, { effects: toc(variant) })], 40);
      const foe = fighter('Foe', [guard(100)], { pv: 40 });
      playRound(engineFor([me], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
      expect(foe.hasStatus('toc-de-la-mort'), variant).toBe(false);
    }
  });
});
