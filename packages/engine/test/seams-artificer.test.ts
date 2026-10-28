/**
 * The artificer's seams: a blow that knows who else it is aimed at (BlowInfo),
 * a status told its own holder is about to be struck, one that pulls an ally
 * out of a blow, one that stands in front of every blow on its side
 * (guardsBlow), the moment after each blow (afterBlow), a hook just before
 * the holder's card resolves, and an extra attack over several targets with
 * one roll. Each is generic and content-free; `1d1` dice always roll 1 and
 * level 0 adds nothing, so every number is exact.
 */
import { describe, it, expect } from 'vitest';
import {
  type BlowInfo, CombatEngine, DiceRoll, EffectRegistry, type ExtraAttackResult, firstLegalChooser, type StatusBehavior,
} from '../src/index.js';
import { attackCard, defenseCard, fighter, focusCard, playRound } from '../src/testing.js';

const T = (team: number, idx: number) => [{ team, idx }];
const flatDice = (total: number) => new DiceRoll(0, 1, total);

/** A fight between `a` and `b`; statuses set beforehand survive the reset. */
function engine(registry: EffectRegistry, a: ReturnType<typeof fighter>[], b: ReturnType<typeof fighter>[]): CombatEngine {
  const kept = [...a, ...b].map(c => [c, new Map(c.statuses)] as const);
  const e = new CombatEngine(a, b, { registry, actionChooser: firstLegalChooser });
  for (const [c, statuses] of kept) c.statuses = statuses;
  return e;
}

describe('BlowInfo: what a blow knows about itself', () => {
  it('an area attack is one blow over all its targets; the next attack is another', () => {
    const seen: BlowInfo[] = [];
    const listen: StatusBehavior = { onTargeted(_ctx, _attacker, blow) { seen.push(blow); } };
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    x.setStatus('ear', 1, -1, undefined, listen);
    y.setStatus('ear', 1, -1, undefined, listen);
    const sweeper = fighter('Sweeper', [attackCard('sweep', { targetCount: 99 })]);
    const striker = fighter('Striker', [attackCard('hit', {})]);
    playRound(engine(new EffectRegistry(), [x, y], [sweeper, striker]), [
      { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0, targets: T(0, 0) },
    ]);
    expect(seen.map(b => [b.attacker.name, b.targets.map(t => t.name)])).toEqual([
      ['Sweeper', ['X', 'Y']], ['Sweeper', ['X', 'Y']], ['Striker', ['X']],
    ]);
    expect(seen[0].id).toBe(seen[1].id);
    expect(seen[2].id).not.toBe(seen[0].id);
  });
});

describe('onTargeted: the holder itself is about to be struck', () => {
  it('a guard it raises covers that blow, and afterBlow takes it back', () => {
    const trapCard = defenseCard('trap');
    const trap: StatusBehavior = {
      onTargeted(ctx) { ctx.holder.guards.push({ defender: ctx.holder, action: trapCard, fixedTotal: 3 }); },
      afterBlow(ctx, target) {
        if (target !== ctx.holder) return;
        ctx.holder.guards = ctx.holder.guards.filter(g => g.action !== trapCard);
        ctx.holder.clearStatus(ctx.key);
      },
    };
    const x = fighter('X', [focusCard()], { pv: 20 });
    x.setStatus('trap', 1, -1, undefined, trap);
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })]);
    const e = engine(new EffectRegistry(), [x], [foe]);
    playRound(e, [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    // 5 vs the trap's 3 → 2.
    expect(x.currentPV).toBe(18);
    expect(x.hasStatus('trap')).toBe(false);
    expect(x.guards).toEqual([]);
    playRound(e, [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect(x.currentPV).toBe(13);
  });

  it('is not told of its own side\'s blows', () => {
    let told = 0;
    const x = fighter('X', [focusCard()], { pv: 20 });
    x.setStatus('ear', 1, -1, undefined, { onTargeted() { told++; } });
    const friend = fighter('Friend', [attackCard('hit')]);
    const foe = fighter('Foe', [focusCard()], { pv: 20 });
    playRound(engine(new EffectRegistry(), [x, friend], [foe]), [{ team: 0, idx: 1, actionIdx: 0, targets: T(0, 0) }]);
    expect(told).toBe(0);
  });
});

describe('onAllyTargeted returning true: the blow passes over that ally', () => {
  const YANK: StatusBehavior = { onAllyTargeted(ctx) { ctx.holder.clearStatus(ctx.key); return true; } };

  it('no roll, no damage for that one; an area attack still lands on the rest; afterBlow still runs', () => {
    const after: string[] = [];
    const hooker = fighter('Hooker', [focusCard()], { pv: 20 });
    hooker.setStatus('yank', 1, 1, undefined, YANK);
    hooker.setStatus('ear', 1, 1, undefined, { afterBlow(_ctx, target) { after.push(target.name); } });
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('sweep', { rollBonus: 4, targetCount: 99 })]);
    playRound(engine(new EffectRegistry(), [hooker, x, y], [foe]), [{ team: 1, idx: 0, actionIdx: 0 }]);
    // The first ally in the sweep (X) is yanked out; Y and the hooker take 5.
    expect([hooker.currentPV, x.currentPV, y.currentPV]).toEqual([15, 20, 15]);
    expect(after).toEqual(['Hooker', 'X', 'Y']);
  });

  it('an extra attack passed over is a miss', () => {
    const seen: ExtraAttackResult[] = [];
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { seen.push(ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6))); },
    });
    const hooker = fighter('Hooker', [focusCard()], { pv: 20 });
    hooker.setStatus('yank', 1, 1, undefined, YANK);
    const x = fighter('X', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [focusCard('f', { effects: [{ type: 'strike' }] })]);
    playRound(engine(registry, [hooker, x], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) }]);
    expect(seen).toEqual([{ hit: false, damage: 0 }]);
    expect(x.currentPV).toBe(20);
  });
});

describe('guardsBlow: a stand-in for every guard on the side', () => {
  const standIn = (card: ReturnType<typeof defenseCard>, total: number, rolled: number[]): StatusBehavior => ({
    guardsBlow(_ctx, target, _attacker, blow) {
      if (!rolled.includes(blow.id)) rolled.push(blow.id);
      return [{ defender: target, action: card, fixedTotal: total }];
    },
  });

  it('replaces the target\'s own guard; a breach lands on the target', () => {
    const rolled: number[] = [];
    const maker = fighter('Maker', [focusCard()], { pv: 20 });
    maker.setStatus('colossus', 1, -1, undefined, standIn(defenseCard('colossus'), 2, rolled));
    const x = fighter('X', [defenseCard('own', { rollBonus: 50 })], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 6 })]);
    playRound(engine(new EffectRegistry(), [maker, x], [foe]), [
      { team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0, targets: T(0, 1) },
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) },
    ]);
    // 7 vs the stand-in's 2 (X's own 50 is passed over) → 5, on X.
    expect(x.currentPV).toBe(15);
    expect(maker.currentPV).toBe(20);
  });

  it('an area attack asks once per target, with one blow id', () => {
    const rolled: number[] = [];
    const maker = fighter('Maker', [focusCard()], { pv: 20 });
    maker.setStatus('colossus', 1, -1, undefined, standIn(defenseCard('colossus'), 2, rolled));
    const x = fighter('X', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('sweep', { rollBonus: 6, targetCount: 99 })]);
    playRound(engine(new EffectRegistry(), [maker, x], [foe]), [{ team: 1, idx: 0, actionIdx: 0 }]);
    expect([maker.currentPV, x.currentPV]).toEqual([15, 15]);
    expect(rolled).toHaveLength(1);
  });

  it('is not asked for an undefendable blow, nor for one who cannot be guarded', () => {
    const rolled: number[] = [];
    const maker = fighter('Maker', [focusCard()], { pv: 20 });
    maker.setStatus('colossus', 1, -1, undefined, standIn(defenseCard('colossus'), 50, rolled));
    const x = fighter('X', [focusCard()], { pv: 20 });
    x.setStatus('bound', 1, -1, undefined, { preventsGuard: () => true });
    const registry = new EffectRegistry();
    registry.register('feint', { modifyAttack(ctx) { ctx.attackMods!.ignoreDefense = true; } });
    const feinter = fighter('Feinter', [attackCard('feint', { rollBonus: 4, effects: [{ type: 'feint' }] })]);
    const striker = fighter('Striker', [attackCard('hit', { rollBonus: 4 })]);
    playRound(engine(registry, [maker, x], [feinter, striker]), [
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }, { team: 1, idx: 1, actionIdx: 0, targets: T(0, 1) },
    ]);
    expect([maker.currentPV, x.currentPV]).toEqual([15, 15]);
    expect(rolled).toEqual([]);
  });

  it('covers extra attacks too', () => {
    const rolled: number[] = [];
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6)); },
    });
    const maker = fighter('Maker', [focusCard()], { pv: 20 });
    maker.setStatus('colossus', 1, -1, undefined, standIn(defenseCard('colossus'), 4, rolled));
    const foe = fighter('Foe', [focusCard('f', { effects: [{ type: 'strike' }] })]);
    playRound(engine(registry, [maker], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect(maker.currentPV).toBe(18);
    expect(rolled).toHaveLength(1);
  });
});

describe('beforeHolderAction: just before the holder\'s card resolves', () => {
  const sting = (amount: number): StatusBehavior => ({
    beforeHolderAction(ctx) { ctx.engine.applyPvLoss(ctx.holder, amount); },
  });

  it('a wound there interrupts a Focus', () => {
    let resolved = 0;
    const registry = new EffectRegistry();
    registry.register('note', { onResolve() { resolved++; } });
    const foe = fighter('Foe', [focusCard('f', { effects: [{ type: 'note' }] })], { pv: 20 });
    foe.setStatus('aimed', 1, -1, undefined, sting(2));
    const me = fighter('Me', [focusCard()]);
    playRound(engine(registry, [me], [foe]), [{ team: 1, idx: 0, actionIdx: 0 }]);
    expect(foe.currentPV).toBe(18);
    expect(resolved).toBe(0);
  });

  it('an attack still resolves after it; a holder felled there does not act', () => {
    const me = fighter('Me', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })], { pv: 20 });
    foe.setStatus('aimed', 1, -1, undefined, sting(2));
    const e = engine(new EffectRegistry(), [me], [foe]);
    playRound(e, [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect([me.currentPV, foe.currentPV]).toEqual([15, 18]);
    foe.setStatus('aimed', 1, -1, undefined, sting(18));
    playRound(e, [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect([me.currentPV, foe.currentPV]).toEqual([15, 0]);
  });

  it('an earlier hit in the Focus\'s own step still does not interrupt it', () => {
    let resolved = 0;
    const registry = new EffectRegistry();
    registry.register('note', { onResolve() { resolved++; } });
    // A Focus that wounds: it resolves in the same (Focus) step as the foe's.
    registry.register('zap', { getTargetRequirement: () => 'enemy', onResolve(ctx) { ctx.engine.applyPvLoss(ctx.targets[0], 1, ctx.source); } });
    const foe = fighter('Foe', [focusCard('f', { effects: [{ type: 'note' }] })], { pv: 20 });
    foe.setStatus('aimed', 1, -1, undefined, { beforeHolderAction() {} });
    const me = fighter('Me', [focusCard('zap', { effects: [{ type: 'zap' }] })]);
    // Whoever committed first, the Focus is not interrupted by a simultaneous
    // blow in its own step, nor by a hook that dealt nothing.
    for (let i = 0; i < 6; i++) {
      const sel = [{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0 }];
      playRound(engine(registry, [me], [foe]), i % 2 ? sel : [sel[1], sel[0]]);
    }
    expect(resolved).toBe(6);
    expect(foe.currentPV).toBe(19);   // a fresh combat each round: one zap
  });
});

describe('performAreaAttack: one roll over several targets', () => {
  it('every target defends against the same roll separately', () => {
    const seen: ExtraAttackResult[][] = [];
    const registry = new EffectRegistry();
    registry.register('spin', {
      onResolve(ctx) { seen.push(ctx.engine.performAreaAttack(ctx.source, ctx.engine.enemiesOf(ctx.source), new DiceRoll(1, 6))); },
    });
    const me = fighter('Me', [focusCard('f', { effects: [{ type: 'spin' }] })]);
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [defenseCard('g', { rollBonus: 1 })], { pv: 20 });
    playRound(engine(registry, [me], [x, y]), [{ team: 0, idx: 0, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0 }, { team: 1, idx: 1, actionIdx: 0, targets: T(1, 1) }]);
    const [[rx, ry]] = seen;
    // One roll r: X takes r, Y takes r − 1.
    expect(rx.damage - ry.damage).toBe(1);
    expect(20 - x.currentPV).toBe(rx.damage);
  });
});
