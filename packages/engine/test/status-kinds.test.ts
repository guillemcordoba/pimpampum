/**
 * THE STATUS VOCABULARY (`status-kinds.ts`): each kind does what it says, and
 * prices itself on the side it should — bad for its holder below zero, good
 * above — so the AI's evaluator sees it. The engine fields the vocabulary
 * prices too (turns to lose, roll modifiers) as well.
 */
import { describe, it, expect } from 'vitest';
import {
  ActionType, CombatEngine, CombatModifier, DiceRoll, EffectRegistry, STATUS_KINDS, applyKind, fieldValue, firstLegalChooser,
} from '../src/index.js';
import { TEST_SKILL, attackCard, defenseCard, fighter, focusCard, playRound } from '../src/testing.js';

const one = () => new DiceRoll(1, 1);
const price = (e: CombatEngine, c: ReturnType<typeof fighter>, key: string) => {
  const entry = c.statuses.get(key)!;
  return entry.behavior!.positionValue!({ holder: c, key, entry }, e);
};
function duel(a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 }), focusCard()], { pv: 30 }),
  b = fighter('B', [attackCard('hit', { dice: one(), rollBonus: 9 }), focusCard()], { pv: 30 })) {
  return { a, b, e: new CombatEngine([a], [b], { registry: new EffectRegistry(), actionChooser: firstLegalChooser }) };
}
const waitBoth = [{ team: 0, idx: 0, actionIdx: 1 }, { team: 1, idx: 0, actionIdx: 1 }];

describe('the status kinds', () => {
  it('damage over time ticks at each round end, and is priced against its holder', () => {
    const { a, e } = duel();
    applyKind(a, 'damageOverTime', 'veri', 3, 2);
    expect(price(e, a, 'veri')).toBeCloseTo(-3 * 2 / 30);
    playRound(e, waitBoth);
    expect(a.currentPV).toBe(27);
  });

  it('heal over time heals, priced at no more than the health missing', () => {
    const { a, e } = duel();
    a.currentPV = 28;
    applyKind(a, 'healOverTime', 'regen', 5, 3);
    expect(price(e, a, 'regen')).toBeCloseTo(2 / 30);
    playRound(e, waitBoth);
    expect(a.currentPV).toBe(30);
  });

  it('a delayed blow lands as its round opens — through every defense unless defendable', () => {
    const { a, b, e } = duel();
    applyKind(a, 'delayedBlow', 'condemna', 1, -1, { source: b, total: 8, atRound: 1 });
    expect(price(e, a, 'condemna')).toBeCloseTo(-8 / 30);
    e.prepareRound();
    expect(a.currentPV).toBe(22);
    expect(a.statuses.has('condemna')).toBe(false);
  });

  it('a primed attack adds its bonus once, then is spent', () => {
    const { a, b, e } = duel();
    applyKind(a, 'primed', 'carregat', 1, -1, { bonus: 5 });
    expect(price(e, a, 'carregat')).toBeGreaterThan(0);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 1 }]);
    expect(b.currentPV).toBe(30 - (10 + 5));
    expect(a.statuses.has('carregat')).toBe(false);
  });

  it('a lock forbids its card types, priced against the holder', () => {
    const { a, e } = duel();
    applyKind(a, 'locked', 'bloquejat', 1, 1, { types: [ActionType.Atac] });
    expect(e.canPlayActionIdx(a, 0)).toBe(false);
    expect(e.canPlayActionIdx(a, 1)).toBe(true);
    expect(price(e, a, 'bloquejat')).toBeLessThan(0);
  });

  it('a ward soaks damage until its life runs out', () => {
    const { a, b, e } = duel();
    applyKind(a, 'ward', 'escut', 1, -1, { life: 6 });
    expect(price(e, a, 'escut')).toBeGreaterThan(0);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 1 }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }]);
    // 10 undefended: 6 soaked, 4 through, and the ward is gone.
    expect(a.currentPV).toBe(26);
    expect(a.statuses.has('escut')).toBe(false);
  });

  it('a standing wall is defended by its caster like a live defense, and soaks a breach with its life', () => {
    const caster = fighter('C', [focusCard()], { pv: 30, level: 1 });
    const h = fighter('H', [focusCard()], { pv: 30 });
    const b = fighter('B', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 30 });
    const e = new CombatEngine([caster, h], [b], { registry: new EffectRegistry(), actionChooser: firstLegalChooser });
    applyKind(h, 'standingWall', 'mur', 1, -1, { caster, dice: one(), skillId: TEST_SKILL, rollBonus: 4, life: 3 });
    expect(price(e, h, 'mur')).toBeGreaterThan(0);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }]);
    // 10 against 1 + 4 + level 1 = 6: a breach of 4, 3 soaked by the wall.
    expect(h.currentPV).toBe(29);
    expect(h.statuses.has('mur')).toBe(false);
  });

  it('untargetable: its foes cannot pick it', () => {
    const { a, b, e } = duel();
    applyKind(b, 'untargetable', 'amagat', 1, 1);
    expect(e.enemiesOf(a)).not.toContain(b);
    expect(price(e, b, 'amagat')).toBeGreaterThan(0);
  });

  it('unguardable: no defense covers it', () => {
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 100 })], { pv: 30 });
    const b = fighter('B', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 30 });
    const e = new CombatEngine([d], [b], { registry: new EffectRegistry(), actionChooser: firstLegalChooser });
    applyKind(d, 'unguardable', 'aillat', 1, 1);
    expect(price(e, d, 'aillat')).toBeLessThan(0);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }]);
    expect(d.currentPV).toBe(20);
  });

  it('taunted and redirected attacks land where the kind says', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 30 });
    const x = fighter('X', [focusCard()], { pv: 30 });
    const y = fighter('Y', [focusCard()], { pv: 30 });
    const e = new CombatEngine([a], [x, y], { registry: new EffectRegistry(), actionChooser: firstLegalChooser });
    applyKind(a, 'redirected', 'girat', 1, 1, { to: y });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0 }]);
    expect([x.currentPV, y.currentPV]).toEqual([30, 20]);
    // Next round, taunted by X: aimed at Y, it must take X.
    applyKind(a, 'taunted', 'provocat', 1, 1, { taunter: x });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 1 }] }, { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0 }]);
    expect([x.currentPV, y.currentPV]).toEqual([20, 20]);
  });

  it('every kind that is bad for its holder says so (harmful), and none that is good does', () => {
    expect(Object.entries(STATUS_KINDS).filter(([, b]) => b.harmful).map(([k]) => k).sort())
      .toEqual(['damageOverTime', 'delayedBlow', 'locked', 'redirected', 'taunted', 'unguardable']);
  });

  it('a snapshot names the kinds itself: no content name needed', () => {
    const { a, e } = duel();
    applyKind(a, 'damageOverTime', 'veri', 3, 2);
    const back = CombatEngine.restore(structuredClone(e.snapshot(() => undefined)), e.registry, () => { throw new Error('asked the content'); });
    expect(back.teams[0][0].statuses.get('veri')!.behavior).toBe(STATUS_KINDS.damageOverTime);
  });
});

describe('the engine fields the evaluator prices', () => {
  it('turns to lose cost a turn of offence each; roll modifiers are worth their points', () => {
    const { a, e } = duel();
    expect(fieldValue(a, e)).toBe(0);
    a.skipTurns = 2;
    expect(fieldValue(a, e)).toBeCloseTo(-2 * 10 / 30);
    a.skipTurns = 0;
    a.modifiers.push(new CombatModifier('attack', 2, { remaining: 2, pending: false }));
    expect(fieldValue(a, e)).toBeCloseTo(2 * 2 / 30);
    a.modifiers = [new CombatModifier('defense', -3, 'RestOfCombat')];
    expect(fieldValue(a, e)).toBeLessThan(0);
  });
});
