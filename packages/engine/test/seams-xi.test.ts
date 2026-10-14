/**
 * The pressure-point seams: a status that takes a whole round away, one that
 * strips the holder's cards to their dice, a hook on every PV lost, a blow
 * that hurts nobody, a target that must have fallen, a penalty on every attack
 * the holder rolls and a modifier's inert payload. Each is generic and content-free; each test wires a minimal inline
 * effect or behaviour. `1d1` dice always roll 1 and level 0 adds nothing, so
 * every number is exact.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, CombatModifier, DiceRoll, EffectRegistry, ModifierDuration, firstLegalChooser, type StatusBehavior } from '../src/index.js';
import { attackCard, defenseCard, fighter, focusCard, playRound } from '../src/testing.js';

const T = (team: number, idx: number) => [{ team, idx }];

/** A fight between `a` and `b`; statuses set beforehand survive the reset. */
function engine(registry: EffectRegistry, a: ReturnType<typeof fighter>[], b: ReturnType<typeof fighter>[]): CombatEngine {
  const kept = [...a, ...b].map(c => [c, new Map(c.statuses)] as const);
  const e = new CombatEngine(a, b, { registry, actionChooser: firstLegalChooser });
  for (const [c, statuses] of kept) c.statuses = statuses;
  return e;
}

describe('skipsRound: no card at all this round', () => {
  it('the holder plays nothing — not even its desperation fallback', () => {
    const me = fighter('Me', [attackCard('hit', { rollBonus: 4 }), attackCard('desesperat', { lastResort: true, rollBonus: 9 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    me.setStatus('held', 1, 1, undefined, { skipsRound: () => true });
    const e = engine(new EffectRegistry(), [me], [foe]);
    e.prepareRound();
    const revealed = e.planActions([]);
    expect(revealed.map(r => r.actorName)).toEqual(['Foe']);
    let r = e.resolveNextAction();
    while (r.kind !== 'done') r = e.resolveNextAction();
    e.finishRound();
    expect(foe.currentPV).toBe(20);
  });

  it('is asked after the round-start hooks, so a status that ends there lets its holder play', () => {
    const me = fighter('Me', [attackCard('hit', { rollBonus: 4 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    me.setStatus('asleep', 1, -1, undefined, {
      onRoundStart(ctx) { ctx.holder.clearStatus(ctx.key); },
      skipsRound: () => true,
    });
    playRound(engine(new EffectRegistry(), [me], [foe]), []);
    expect(foe.currentPV).toBe(15);
  });

  it('reads the round from its context (a hold that starts next round)', () => {
    const me = fighter('Me', [attackCard('hit', { rollBonus: 4 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    me.setStatus('held', 1, 3, undefined, { skipsRound: ctx => ctx.engine.round >= 2 });
    const e = engine(new EffectRegistry(), [me], [foe]);
    playRound(e, []);
    expect(foe.currentPV).toBe(15);
    playRound(e, []);
    expect(foe.currentPV).toBe(15);
  });
});

describe('plainCards: only the dice count', () => {
  function registryFor(log: string[]): EffectRegistry {
    const registry = new EffectRegistry();
    registry.register('rider', {
      modifyAttack(ctx) { ctx.attackMods!.rollBonus += 10; },
      onAttackHit() { log.push('hit-rider'); },
      onPlay() { log.push('paid'); },
    });
    registry.register('cure', {
      getTargetRequirement: () => 'ally',
      onResolve(ctx) { log.push(`cured:${ctx.targets.map(t => t.name).join(',')}`); },
    });
    registry.register('reprisal', { onDefend() { log.push('reprisal'); } });
    return registry;
  }

  it('an attack lands with its dice alone: no rider, no cost, and on one target', () => {
    const log: string[] = [];
    const me = fighter('Me', [attackCard('sweep', { rollBonus: 4, targetCount: 99, effects: [{ type: 'rider' }] })], { ai: true });
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    me.setStatus('off', 1, 1, undefined, { plainCards: () => true });
    playRound(engine(registryFor(log), [me], [x, y]), []);
    expect(log).toEqual([]);
    expect(x.currentPV + y.currentPV).toBe(35);
  });

  it('a focus does nothing, and a defense still guards with its dice but without its rider', () => {
    const log: string[] = [];
    const healer = fighter('Healer', [focusCard('heal', { effects: [{ type: 'cure' }] })]);
    const guard = fighter('Guard', [defenseCard('wall', { rollBonus: 9, speed: 9, effects: [{ type: 'reprisal' }] })], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })]);
    healer.setStatus('off', 1, 1, undefined, { plainCards: () => true });
    guard.setStatus('off', 1, 1, undefined, { plainCards: () => true });
    playRound(engine(registryFor(log), [healer, guard], [foe]), [
      { team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0, targets: T(0, 1) },
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) },
    ]);
    expect(log).toEqual([]);
    expect(guard.currentPV).toBe(20);
  });

  it('with the status gone, the card is itself again', () => {
    const log: string[] = [];
    const me = fighter('Me', [attackCard('hit', { rollBonus: 4, effects: [{ type: 'rider' }] })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 40 });
    me.setStatus('off', 1, 1, undefined, { plainCards: ctx => ctx.engine.round === 1 });
    const e = engine(registryFor(log), [me], [foe]);
    playRound(e, []);
    expect(foe.currentPV).toBe(35);
    playRound(e, []);
    expect(log).toEqual(['paid', 'hit-rider']);
    expect(foe.currentPV).toBe(20);
  });
});

describe('onPvLost', () => {
  it('runs for the one who lost PV, with the amount after armour and clamps', () => {
    const seen: number[] = [];
    const me = fighter('Me', [attackCard('hit', { rollBonus: 6 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    foe.setStatus('counter', 1, -1, undefined, {
      onPvLost(_ctx, amount) { seen.push(amount); },
      clampPvLoss: (_ref, amount) => Math.min(amount, 4),
    });
    playRound(engine(new EffectRegistry(), [me], [foe]), []);
    expect(seen).toEqual([4]);
  });

  it('is not run for a blow that takes nothing, and gets the PV actually lost', () => {
    const seen: number[] = [];
    const me = fighter('Me', [attackCard('hit', { rollBonus: 2 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    foe.setStatus('counter', 1, -1, undefined, { onPvLost(_ctx, amount) { seen.push(amount); } });
    const e = engine(new EffectRegistry(), [me], [foe]);
    e.applyPvLoss(foe, 0);
    e.applyPvLoss(foe, 7);
    playRound(e, []);
    expect(seen).toEqual([7, 3]);
    // The PV actually lost: a 50-point blow on 10 left takes 10.
    e.applyPvLoss(foe, 50);
    expect(seen).toEqual([7, 3, 10]);
  });
});

describe('AttackModifiers.damageMult: a blow that decides whom it beats and hurts nobody', () => {
  it('at 0 it still hits — the riders see it — for no PV', () => {
    const hits: string[] = [];
    const registry = new EffectRegistry();
    registry.register('harmless', {
      modifyAttack(ctx) { ctx.attackMods!.damageMult = 0; },
      onAttackHit(ctx) { hits.push(`${ctx.target?.name}:${ctx.damageDealt}`); },
    });
    const me = fighter('Me', [attackCard('storm', { rollBonus: 9, targetCount: 99, effects: [{ type: 'harmless' }] })], { ai: true });
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [defenseCard('wall', { rollBonus: 50, speed: 9 })], { pv: 20 });
    playRound(engine(registry, [me], [x, y]), [{ team: 1, idx: 1, actionIdx: 0, targets: T(1, 1) }]);
    expect(hits).toEqual(['X:0']);
    expect(x.currentPV).toBe(20);
  });
});

describe("'fallen_ally': a target that has fallen, and nobody standing", () => {
  it('offers only the fallen of the actor\'s own side', () => {
    const targets: string[][] = [];
    const registry = new EffectRegistry();
    registry.register('raise', {
      getTargetRequirement: () => 'fallen_ally',
      onResolve(ctx) { targets.push(ctx.targets.map(t => t.name)); },
    });
    const me = fighter('Me', [focusCard('raise', { effects: [{ type: 'raise' }] })], { ai: true });
    const standing = fighter('Standing', [focusCard()]);
    const fallen = fighter('Fallen', [focusCard()]);
    const foe = fighter('Foe', [focusCard()]);
    const e = engine(registry, [me, standing, fallen], [foe]);
    fallen.currentPV = 0;
    playRound(e, []);
    expect(targets).toEqual([['Fallen']]);
    // Nobody fallen: the card aims at nobody.
    fallen.currentPV = 5;
    playRound(e, []);
    expect(targets).toEqual([['Fallen'], []]);
  });
});

describe('attackRollOfHolder: every attack the holder rolls', () => {
  const weak: StatusBehavior = { attackRollOfHolder: () => -3 };

  it('lowers the total of an undefended blow, and so its damage', () => {
    const me = fighter('Me', [attackCard('hit', { rollBonus: 6 })], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    me.setStatus('weak', 1, -1, undefined, weak);
    playRound(engine(new EffectRegistry(), [me], [foe]), []);
    expect(foe.currentPV).toBe(16);
  });

  it('lowers the contested total, not the damage after it', () => {
    const me = fighter('Me', [attackCard('hit', { rollBonus: 9 })], { ai: true });
    const foe = fighter('Foe', [defenseCard('block', { rollBonus: 3, speed: 9 })], { pv: 20, ai: true });
    me.setStatus('weak', 1, -1, undefined, weak);
    playRound(engine(new EffectRegistry(), [me], [foe]), []);
    // (1 + 9 − 3) − 3 = 4.
    expect(foe.currentPV).toBe(16);
  });

  it('lowers an extra blow too', () => {
    const me = fighter('Me', [focusCard()], { ai: true });
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    me.setStatus('weak', 1, -1, undefined, weak);
    const e = engine(new EffectRegistry(), [me], [foe]);
    e.performExtraAttack(me, foe, new DiceRoll(1, 1), { rollBonus: 5 });
    expect(foe.currentPV).toBe(17);
  });
});

describe('CombatModifier.data: an inert payload', () => {
  it("survives the search's clone, as a copy", () => {
    const me = fighter('Me', [focusCard()]);
    me.addModifier(new CombatModifier('attack', -2, ModifierDuration.RestOfCombat).withData({ harm: 1 }));
    const copy = me.cloneState();
    expect(copy.modifiers[0].data).toEqual({ harm: 1 });
    expect(copy.modifiers[0].data).not.toBe(me.modifiers[0].data);
  });
});
