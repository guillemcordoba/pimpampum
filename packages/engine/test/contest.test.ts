/**
 * ONE CONTEST FOR EVERY BLOW (rulings of 2026-11-01): an extra blow — a
 * counter, a strike again — is rolled and defended like a card's attack
 * (level, roll bonuses, fatigue, Envoltat, walls, the defenders' cards), but
 * it is not a card play, so no card's own effects run for it. A total thrown
 * on is contested as it is. A standing wall defends like a live defense and
 * joins any guard into a wall. Envoltat counts the blows that LAND, extra
 * ones included.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, DiceRoll, EffectRegistry, type StatusBehavior } from '../src/index.js';
import { TEST_SKILL, attackCard, defenseCard, fighter, focusCard, playRound } from '../src/testing.js';

const one = () => new DiceRoll(1, 1);

/** Dice that count how often they are rolled. */
class CountingDice extends DiceRoll {
  calls = 0;
  override roll(): number { this.calls++; return super.roll(); }
}

function registry(extraBlow: (ctx: Parameters<NonNullable<Parameters<EffectRegistry['register']>[1]['onAttackHit']>>[0]) => void = () => {}): EffectRegistry {
  const r = new EffectRegistry();
  r.register('strike_again', { onAttackHit: ctx => extraBlow(ctx) });
  r.register('riposte', {
    onDefend(ctx) { if (ctx.target) ctx.engine.performExtraAttack(ctx.source, ctx.target, one(), { label: 'riposte' }); },
  });
  return r;
}

describe('an extra blow', () => {
  it('carries the skill level and fatigue, like the card attack', () => {
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL }));
    const a = fighter('A', [attackCard('hit', { dice: one(), effects: [{ type: 'strike_again' }] })], { level: 3, fatigue: 1 });
    const t = fighter('T', [focusCard()], { pv: 100 });
    const e = new CombatEngine([a], [t], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    // Each blow: 1 + level 3 − fatigue 1 = 3, undefended.
    expect(t.currentPV).toBe(100 - 3 - 3);
  });

  it('thrown on as a total, is contested as it is: no term added', () => {
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], 7));
    const a = fighter('A', [attackCard('hit', { dice: one(), effects: [{ type: 'strike_again' }] })], { level: 3, fatigue: 2 });
    const t = fighter('T', [focusCard()], { pv: 100 });
    const e = new CombatEngine([a], [t], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    expect(t.currentPV).toBe(100 - (1 + 3 - 2) - 7);
  });

  it('runs no card\'s own effects: a strike again that hits does not strike again', () => {
    let extras = 0;
    const r = registry(ctx => { extras++; ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL, rollBonus: 50 }); });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 200, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 0 })], { pv: 500 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(extras, 'one extra blow for the card\'s one hit').toBe(1);
    // 201 − 1, then the extra 51 − 1.
    expect(d.currentPV).toBe(500 - 200 - 50);
  });

  it('meets the defender\'s card like an attack does: a parried extra blow is answered', () => {
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL }));
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 200, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 100, effects: [{ type: 'riposte' }] })], { pv: 500 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    // The card's 201 breaks D's 101 (no riposte: a hit is not a parry); the
    // extra blow's 1 is parried, and D's card answers it: 1 on A.
    expect(d.currentPV).toBe(500 - 100);
    expect(a.currentPV).toBe(100 - 1);
  });

  it('counts toward Envoltat where it lands: the defense covering the body rolls once more', () => {
    const guardDice = new CountingDice(1, 1);
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL }));
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 10, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: guardDice, rollBonus: 0 })], { pv: 100 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    // The card's blow: 1 landed → one roll. The extra blow: 2 landed → two.
    expect(guardDice.calls).toBe(3);
  });
});

describe('a standing wall', () => {
  const broken: string[] = [];
  const WALL: StatusBehavior = {
    standingGuard: ctx => ({ defender: ctx.entry.data!['caster'] as never, dice: one(), skillId: TEST_SKILL, rollBonus: 9, name: 'mur' }),
    onStandingGuardBroken: ctx => { broken.push(ctx.holder.name); },
  };

  it('joins a live guard into a wall', () => {
    const caster = fighter('C', [focusCard()], { pv: 30 });
    const h = fighter('H', [defenseCard('block', { dice: one(), rollBonus: 9 })], { pv: 30 });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 15 })], { pv: 30 });
    const e = new CombatEngine([caster, h], [a], { registry: registry() });
    h.setStatus('mur', 1, -1, { caster }, WALL);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }]);
    // 16 against the guard 10 + the wall 10.
    expect(h.currentPV).toBe(30);
  });

  it('alone, is rolled by its caster with the caster\'s level, and a breach lands on its holder', () => {
    broken.length = 0;
    const caster = fighter('C', [focusCard()], { pv: 30, level: 2 });
    const h = fighter('H', [focusCard()], { pv: 30 });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 15 })], { pv: 30 });
    const e = new CombatEngine([caster, h], [a], { registry: registry() });
    h.setStatus('mur', 1, -1, { caster }, WALL);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }]);
    // 16 against 1 + 9 + level 2 = 12: a breach of 4, on H, the wall told first.
    expect(h.currentPV).toBe(26);
    expect(caster.currentPV).toBe(30);
    expect(broken).toEqual(['H']);
  });
});

describe('a roll that is not a blow (contestRoll)', () => {
  it('adds the roll bonus, the skill\'s bonuses and fatigue, and the level', () => {
    const c = fighter('C', [focusCard()], { level: 2, fatigue: 1 });
    const e = new CombatEngine([c], [fighter('X', [focusCard()])], { registry: registry() });
    expect(e.contestRoll(c, one(), { kind: 'attack', skillId: TEST_SKILL, rollBonus: 3 }))
      .toEqual({ roll: 1, bonus: 3 - 1 + 2, total: 5 });
  });
});
