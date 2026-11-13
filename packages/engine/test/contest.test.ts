/**
 * ONE CONTEST FOR EVERY BLOW (rulings of 2026-11-01): an extra blow — a
 * counter, a strike again — is rolled and defended like a card's attack
 * (roll bonuses, fatigue, walls, the defenders' cards), but
 * it is not a card play, so no card's own effects run for it. A total thrown
 * on is contested as it is. A standing wall defends like a live defense and
 * joins any guard into a wall. ATTACKS ADD UP (the user, 2026-11-13): a
 * defense rolls once a round, and every blow on the body it covers, extra
 * ones included, meets what the earlier blows left of it.
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
  it('carries its roll bonus and fatigue, and no level, like the card attack', () => {
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL, rollBonus: 4 }));
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 4, effects: [{ type: 'strike_again' }] })], { level: 3, fatigue: 1 });
    const t = fighter('T', [focusCard()], { pv: 100 });
    const e = new CombatEngine([a], [t], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    // Each blow: 1 + 4 − fatigue 1 = 4, undefended; level 3 adds nothing.
    expect(t.currentPV).toBe(100 - 4 - 4);
  });

  it('thrown on as a total, is contested as it is: no term added', () => {
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], 7));
    const a = fighter('A', [attackCard('hit', { dice: one(), effects: [{ type: 'strike_again' }] })], { level: 3, fatigue: 2 });
    const t = fighter('T', [focusCard()], { pv: 100 });
    const e = new CombatEngine([a], [t], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    // The card's blow: 1 − fatigue 2, floored at 0; the total thrown on: 7.
    expect(t.currentPV).toBe(100 - 0 - 7);
  });

  it('runs no card\'s own effects: a strike again that hits does not strike again', () => {
    let extras = 0;
    const r = registry(ctx => { extras++; ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL, rollBonus: 50 }); });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 200, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 0 })], { pv: 500 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(extras, 'one extra blow for the card\'s one hit').toBe(1);
    // 201 − 1 uses the guard up; the extra 51 lands whole.
    expect(d.currentPV).toBe(500 - 200 - 51);
  });

  it('meets the defender\'s card like an attack does: a parried extra blow is answered', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 200, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const t = fighter('T', [focusCard()], { pv: 500 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 100, effects: [{ type: 'riposte' }] })], { pv: 500 });
    // A hits T, open; its extra blow goes to D, behind its own guard.
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, d, one(), { skillId: TEST_SKILL }));
    const e = new CombatEngine([a], [t, d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0, targets: [{ team: 1, idx: 1 }] }]);
    // The extra blow's 1 is parried by D's 101, and D's card answers it: 1 on A.
    expect(d.currentPV).toBe(500);
    expect(a.currentPV).toBe(100 - 1);
  });

  it('meets what the card\'s blow left of the guard: the guard rolls once, and a spent guard stops nothing', () => {
    const guardDice = new CountingDice(1, 1);
    const r = registry(ctx => ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], one(), { skillId: TEST_SKILL }));
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 4, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: guardDice, rollBonus: 2 })], { pv: 100 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(guardDice.calls).toBe(1);
    // The card's 5 breaks the guard's 3 by 2 and uses it up; the extra 1 lands whole.
    expect(d.currentPV).toBe(100 - 2 - 1);
  });
});

describe('an extra blow with defense options', () => {
  /** A Focus that throws a 3 at its target with `opts`, and its registry. */
  function thrower(opts: Parameters<CombatEngine['performExtraAttack']>[3]) {
    const r = registry();
    r.register('throw', {
      getTargetRequirement: () => 'enemy',
      onResolve: ctx => { ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], 3, opts); },
    });
    return { r, a: fighter('A', [focusCard('throw', { effects: [{ type: 'throw' }] })], { pv: 100 }) };
  }
  const aim = (team: number, idx: number) => [{ team, idx }];

  it('defenseAdds: the guard adds its total to the blow, and the guard takes it', () => {
    const { r, a } = thrower({ defenseAdds: true });
    const t = fighter('T', [focusCard()], { pv: 100 });
    const g = fighter('G', [defenseCard('parry', { dice: one(), rollBonus: 4 })], { pv: 100 });
    playRound(new CombatEngine([a], [t, g], { registry: r }), [{ team: 0, idx: 0, actionIdx: 0, targets: aim(1, 0) }, { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0, targets: aim(1, 0) }]);
    // 3 + the guard's 5, on the guard.
    expect([t.currentPV, g.currentPV]).toEqual([100, 92]);
  });

  it('defenseAdds: a wall adds its sum', () => {
    const { r, a } = thrower({ defenseAdds: true });
    const t = fighter('T', [defenseCard('parry', { dice: one(), rollBonus: 1 })], { pv: 100 });
    const g = fighter('G', [defenseCard('parry', { dice: one(), rollBonus: 4 })], { pv: 100 });
    playRound(new CombatEngine([a], [t, g], { registry: r }), [{ team: 0, idx: 0, actionIdx: 0, targets: aim(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: aim(1, 0) }, { team: 1, idx: 1, actionIdx: 0, targets: aim(1, 0) }]);
    // 3 + 2 + 5 = 10, shared by the two behind the wall.
    expect([t.currentPV, g.currentPV]).toEqual([95, 95]);
  });

  it('minDefenseRolls: the guard rolls that many times for the blow', () => {
    const { r, a } = thrower({ minDefenseRolls: 5 });
    const guardDice = new CountingDice(1, 1);
    const d = fighter('D', [defenseCard('parry', { dice: guardDice, rollBonus: 0 })], { pv: 100 });
    playRound(new CombatEngine([a], [d], { registry: r }), [{ team: 0, idx: 0, actionIdx: 0, targets: aim(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: aim(1, 0) }]);
    expect(guardDice.calls).toBe(5);
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

  it('alone, is rolled by its caster (no level), and a breach lands on its holder', () => {
    broken.length = 0;
    const caster = fighter('C', [focusCard()], { pv: 30, level: 2 });
    const h = fighter('H', [focusCard()], { pv: 30 });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 15 })], { pv: 30 });
    const e = new CombatEngine([caster, h], [a], { registry: registry() });
    h.setStatus('mur', 1, -1, { caster }, WALL);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }]);
    // 16 against 1 + 9 = 10 (the caster's level 2 adds nothing): a breach of 6, on H, the wall told first.
    expect(h.currentPV).toBe(24);
    expect(caster.currentPV).toBe(30);
    expect(broken).toEqual(['H']);
  });
});

describe('a roll that is not a blow (contestRoll)', () => {
  it('adds the roll bonus, the skill\'s bonuses and fatigue — no level', () => {
    const c = fighter('C', [focusCard()], { level: 2, fatigue: 1 });
    const e = new CombatEngine([c], [fighter('X', [focusCard()])], { registry: registry() });
    expect(e.contestRoll(c, one(), { kind: 'attack', skillId: TEST_SKILL, rollBonus: 3 }))
      .toEqual({ roll: 1, bonus: 3 - 1, total: 3 });
  });
});

describe('every PV loss says how it arrived', () => {
  const round = (e: CombatEngine) => playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
  it('a blow on a body with no guard is open', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 100 });
    const d = fighter('D', [focusCard('wait')], { pv: 100 });
    const e = new CombatEngine([a], [d], { registry: registry() });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    expect(e.pvLosses.map(l => [l.target.name, l.via])).toEqual([['D', 'open']]);
  });
  it('a blow that breaks a guard is guarded', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 19 })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 9 })], { pv: 100 });
    const e = new CombatEngine([a], [d], { registry: registry() });
    round(e);
    expect(e.pvLosses.map(l => [l.target.name, l.via])).toEqual([['D', 'guarded']]);
  });
  it('an effect that takes PV with no roll is uncontested', () => {
    const r = registry(ctx => { ctx.engine.applyPvLoss(ctx.targets[0], 5, ctx.source); });
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9, effects: [{ type: 'strike_again' }] })], { pv: 100 });
    const d = fighter('D', [focusCard('wait')], { pv: 100 });
    const e = new CombatEngine([a], [d], { registry: r });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    // The blow lands on an open body; its effect then takes 5 with no roll.
    expect(e.pvLosses.map(l => [l.lost, l.via])).toEqual([[10, 'open'], [5, 'uncontested']]);
  });
  it('a loss keeps the whole blow, above the PV the body had left', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 100 });
    const d = fighter('D', [focusCard('wait')], { pv: 4 });
    const e = new CombatEngine([a], [d], { registry: registry() });
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0 }]);
    expect(e.pvLosses.map(l => [l.lost, l.dealt])).toEqual([[4, 10]]);
  });
});

describe('chip damage (an option; 0 by the rules)', () => {
  it('a held blow still takes its share off the defender, after armour', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 19 })], { pv: 100 });
    playRound(new CombatEngine([a], [d], { registry: registry(), chipDamage: 0.5 }), [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    // 10 held by 20; half of 10 lands.
    expect(d.currentPV).toBe(95);
  });

  it('by the rules a held blow lands nothing', () => {
    const a = fighter('A', [attackCard('hit', { dice: one(), rollBonus: 9 })], { pv: 100 });
    const d = fighter('D', [defenseCard('parry', { dice: one(), rollBonus: 19 })], { pv: 100 });
    playRound(new CombatEngine([a], [d], { registry: registry() }), [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }, { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(d.currentPV).toBe(100);
  });
});

describe('attacks add up against the defenses', () => {
  const hit = (total: number) => attackCard('hit', { dice: one(), rollBonus: total - 1 });
  const parry = (total: number, dice: DiceRoll = one()) => defenseCard('parry', { dice, rollBonus: total - 1 });
  const at = (team: number, idx: number) => ({ team, idx });
  /** Two attackers on team 0, each aiming at the first body of team 1. */
  const twoOnOne = (defenders: Parameters<typeof playRound>[1]) => [
    { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] }, { team: 0, idx: 1, actionIdx: 0, targets: [at(1, 0)] }, ...defenders,
  ];

  it('two blows of 5 on a guard of 7 take 3: the second meets what the first left', () => {
    const d = fighter('D', [parry(7)], { pv: 100 });
    const e = new CombatEngine([fighter('A', [hit(5)]), fighter('B', [hit(5)])], [d], { registry: registry() });
    playRound(e, twoOnOne([{ team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] }]));
    expect(d.currentPV).toBe(100 - 3);
  });

  it('a defense rolls once for the round, however many blows it meets', () => {
    const guardDice = new CountingDice(1, 1);
    const d = fighter('D', [parry(7, guardDice)], { pv: 100 });
    const e = new CombatEngine([fighter('A', [hit(5)]), fighter('B', [hit(5)])], [d], { registry: registry() });
    playRound(e, twoOnOne([{ team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] }]));
    expect(guardDice.calls).toBe(1);
  });

  it('a spent guard is whole again the next round', () => {
    const d = fighter('D', [parry(7)], { pv: 100 });
    const e = new CombatEngine([fighter('A', [hit(5)]), fighter('B', [hit(5)])], [d], { registry: registry() });
    const round = twoOnOne([{ team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] }]);
    playRound(e, round);
    playRound(e, round);
    expect(d.currentPV).toBe(100 - 3 - 3);
  });

  it('a wall that breaks shares the damage among its members, the odd point to its weak link', () => {
    const d = fighter('D', [parry(3)], { pv: 100 });
    const g = fighter('G', [parry(4)], { pv: 100 });
    const e = new CombatEngine([fighter('A', [hit(6)]), fighter('B', [hit(6)])], [d, g], { registry: registry() });
    // Both guard D: a wall of 7. The first 6 is held; the second meets 1 and breaks it by 5.
    playRound(e, twoOnOne([{ team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] }, { team: 1, idx: 1, actionIdx: 0, targets: [at(1, 0)] }]));
    expect([d.currentPV, g.currentPV]).toEqual([100 - 3, 100 - 2]);
  });

  it('a copy made between two blows carries what the guard has met', () => {
    const d = fighter('D', [parry(7)], { pv: 100 });
    const e = new CombatEngine([fighter('A', [hit(5)]), fighter('B', [hit(5)])], [d], { registry: registry() });
    e.prepareRound();
    e.planActions(twoOnOne([{ team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] }]));
    e.resolveNextAction();   // the guard
    e.resolveNextAction();   // the first blow, held
    const copy = e.clone();
    while (copy.resolveNextAction().kind !== 'done');
    expect(copy.teams[1][0].currentPV).toBe(100 - 3);
  });
});
