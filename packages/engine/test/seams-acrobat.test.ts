/**
 * The acrobat's seams: an attacker that cannot reach someone, a defender that
 * dives to whoever is attacked first, a hook once an attack is over, a card
 * whose player picks an option at the reveal — and the extra attack that
 * honours a mark and says who took it. Each is generic and content-free; each
 * test wires a minimal inline effect or behaviour. `1d1` dice always roll 1
 * and level 0 adds nothing, so every number is exact.
 */
import { describe, it, expect } from 'vitest';
import {
  CombatEngine, DiceRoll, EffectRegistry, type ExtraAttackResult, firstLegalChooser, type StatusBehavior,
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

describe('attackTargetsExcluded: one the holder cannot reach', () => {
  const excluding = (who: () => ReturnType<typeof fighter>): StatusBehavior => ({ attackTargetsExcluded: () => [who()] });

  it('leaves the pool: an AI attacker aims at someone else', () => {
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })], { ai: true });
    foe.setStatus('ridden', 1, 2, undefined, excluding(() => x));
    playRound(engine(new EffectRegistry(), [x, y], [foe]), []);
    expect(x.currentPV).toBe(20);
    expect(y.currentPV).toBe(15);
  });

  it('a target named before is passed over, and with nobody left the blow lands on nobody', () => {
    const x = fighter('X', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })]);
    foe.setStatus('ridden', 1, 2, undefined, excluding(() => x));
    playRound(engine(new EffectRegistry(), [x], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect(x.currentPV).toBe(20);
  });

  it('an area attack leaves them out', () => {
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('sweep', { rollBonus: 4, targetCount: 99 })], { ai: true });
    foe.setStatus('ridden', 1, 2, undefined, excluding(() => x));
    playRound(engine(new EffectRegistry(), [x, y], [foe]), []);
    expect(x.currentPV).toBe(20);
    expect(y.currentPV).toBe(15);
  });

  it('their block no longer forces the blow onto them', () => {
    const x = fighter('X', [defenseCard('block', { speed: 9 })], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4, speed: 0 })]);
    foe.setStatus('ridden', 1, 2, undefined, excluding(() => x));
    playRound(engine(new EffectRegistry(), [x, y], [foe]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 0, idx: 1, actionIdx: 0 },
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) },
    ]);
    expect(y.currentPV).toBe(15);
  });

  it('their extra attacks miss them', () => {
    const seen: ExtraAttackResult[] = [];
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { seen.push(ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6))); },
    });
    const x = fighter('X', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    foe.setStatus('ridden', 1, 2, undefined, excluding(() => x));
    playRound(engine(registry, [x], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect(seen).toEqual([{ hit: false, damage: 0 }]);
    expect(x.currentPV).toBe(20);
  });
});

describe('onAllyTargeted: a defender that dives to whoever is attacked first', () => {
  /** On the holder: the first ally attacked gets the holder's guard. */
  const DIVE = (card: ReturnType<typeof defenseCard>): StatusBehavior => ({
    onAllyTargeted(ctx, target) {
      ctx.holder.clearStatus(ctx.key);
      target.guards.push({ defender: ctx.holder, action: card });
    },
  });

  it('the guard it raises covers that very blow, and joins the wall there', () => {
    const shield = defenseCard('shield', { rollBonus: 3 });
    const diver = fighter('Diver', [focusCard()], { pv: 20 });
    const ally = fighter('Ally', [defenseCard('own', { rollBonus: 2, speed: 9 })], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 9, speed: 0 })]);
    diver.setStatus('dive', 1, 1, undefined, DIVE(shield));
    playRound(engine(new EffectRegistry(), [diver, ally], [foe]), [
      { team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0, targets: T(0, 1) },
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) },
    ]);
    // attack 10 vs wall 2 (ally) + 3 (diver) = 5 → 5, taken by the weaker link,
    // the ally (alone, its own 2 would have let 8 through).
    expect(ally.currentPV).toBe(15);
    expect(diver.hasStatus('dive')).toBe(false);
  });

  it('is not told when the holder itself is attacked', () => {
    const diver = fighter('Diver', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [attackCard('hit', { rollBonus: 4 })]);
    diver.setStatus('dive', 1, 2, undefined, DIVE(defenseCard()));
    playRound(engine(new EffectRegistry(), [diver], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) }]);
    expect(diver.currentPV).toBe(15);
    expect(diver.hasStatus('dive')).toBe(true);
  });

  it('is told of extra attacks too', () => {
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6)); },
    });
    const diver = fighter('Diver', [focusCard()], { pv: 20 });
    const ally = fighter('Ally', [focusCard()], { pv: 20 });
    const foe = fighter('Foe', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    diver.setStatus('dive', 1, 1, undefined, DIVE(defenseCard()));
    playRound(engine(registry, [diver, ally], [foe]), [{ team: 1, idx: 0, actionIdx: 0, targets: T(0, 1) }]);
    expect(ally.currentPV).toBe(20);
  });
});

describe('onAttackResolved: once, after every target', () => {
  it('runs once with the final target list, after each target was struck', () => {
    const log: string[] = [];
    const registry = new EffectRegistry();
    registry.register('after', {
      onAttackHit(ctx) { log.push(`hit:${ctx.target?.name}`); },
      onAttackResolved(ctx) { log.push(`done:${ctx.targets.map(t => t.name).join(',')}`); },
    });
    const x = fighter('X', [focusCard()], { pv: 20 });
    const y = fighter('Y', [focusCard()], { pv: 20 });
    const me = fighter('Me', [attackCard('sweep', { targetCount: 99, effects: [{ type: 'after' }] })], { ai: true });
    playRound(engine(registry, [me], [x, y]), []);
    expect(log).toEqual(['hit:X', 'hit:Y', 'done:X,Y']);
  });
});

describe('reveal options: a pick made when the cards are revealed', () => {
  function registryFor(log: string[]): EffectRegistry {
    const registry = new EffectRegistry();
    registry.register('height', {
      revealOptions() { return ['+2', '+4', '+6']; },
      aiRevealOption() { return 1; },
      onRevealOption(ctx, option) { log.push(`picked:${option}`); ctx.source.setStatus('h', [2, 4, 6][option], 1); },
      modifyAttack(ctx) { ctx.attackMods!.rollBonus += ctx.source.getStatusValue('h', 0); },
    });
    registry.register('note', { onResolve(ctx) { log.push(`resolved:${ctx.source.name}`); } });
    return registry;
  }
  const leap = () => attackCard('leap', { speed: 0, effects: [{ type: 'height' }] });

  it('an AI seat takes the card\'s own pick before anything resolves', () => {
    const log: string[] = [];
    const me = fighter('Me', [leap()], { ai: true });
    const foe = fighter('Foe', [focusCard('f', { speed: 9, effects: [{ type: 'note' }] })], { pv: 30 });
    playRound(engine(registryFor(log), [me], [foe]), [{ team: 1, idx: 0, actionIdx: 0 }]);
    expect(log).toEqual(['picked:1', 'resolved:Foe']);
    // 1 + 4
    expect(foe.currentPV).toBe(25);
  });

  it('a human seat is asked, and its answer stands', () => {
    const log: string[] = [];
    const me = fighter('Me', [leap()]);
    const foe = fighter('Foe', [focusCard('f', { speed: 9, effects: [{ type: 'note' }] })], { pv: 30 });
    const e = engine(registryFor(log), [me], [foe]);
    e.prepareRound();
    e.planActions([{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0 }]);
    const step = e.resolveNextAction();
    expect(step).toMatchObject({ kind: 'choice', prompt: { actorName: 'Me', options: ['+2', '+4', '+6'] } });
    expect(log).toEqual([]);
    e.setResolveChoice(2);
    let r = e.resolveNextAction();
    while (r.kind !== 'done') r = e.resolveNextAction();
    e.finishRound();
    expect(log).toEqual(['picked:2', 'resolved:Foe']);
    expect(foe.currentPV).toBe(23);
  });

  it('a prompt answered with nothing takes the card\'s own pick', () => {
    const log: string[] = [];
    const me = fighter('Me', [leap()]);
    const foe = fighter('Foe', [focusCard()], { pv: 30 });
    const e = engine(registryFor(log), [me], [foe]);
    e.prepareRound();
    e.planActions([{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0 }]);
    expect(e.resolveNextAction().kind).toBe('choice');
    e.setResolveChoice();
    expect(log).toEqual(['picked:1']);
  });
});

describe('performExtraAttack and the target', () => {
  it('honours attackRollAgainstHolder, and says who took the blow', () => {
    const seen: ExtraAttackResult[] = [];
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { seen.push(ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6))); },
    });
    const me = fighter('Me', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    const x = fighter('X', [focusCard()], { pv: 20 });
    const guard = fighter('Guard', [defenseCard('g', { rollBonus: 1, speed: 9 })], { pv: 20 });
    x.setStatus('down', 2, 2, undefined, { attackRollAgainstHolder: ref => ref.entry.value });
    playRound(engine(registry, [me], [x, guard]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0 },
      { team: 1, idx: 1, actionIdx: 0, targets: T(1, 0) },
    ]);
    // 6 + 2 vs the guard's 1 → 7, taken by the guard.
    expect(seen).toEqual([{ hit: true, damage: 7, recipient: guard }]);
    expect(guard.currentPV).toBe(13);
  });
});
