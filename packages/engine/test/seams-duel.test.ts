/**
 * The duel seams: openings, weak spots, taunts, a blow that parries, a card
 * that aims at the reveal — and the extra attack that reports how it went.
 * Each is generic and content-free; each test wires a minimal inline effect or
 * behaviour against the seam. `1d1` dice always roll 1 and level 0 adds
 * nothing, so every number is exact.
 */
import { describe, it, expect } from 'vitest';
import {
  ActionType, availableActionIndices, CombatEngine, createCharacter, DiceRoll, EffectRegistry, type EquipmentDefinition,
  EquipmentSlot, type ExtraAttackResult,
  firstLegalChooser, type StatusBehavior,
} from '../src/index.js';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound } from '../src/testing.js';

const T = (team: number, idx: number) => [{ team, idx }];
const flatDice = (total: number) => new DiceRoll(0, 1, total);

/** A fight between `a` and `b`. The constructor resets everyone for a new
 *  combat, so statuses a test set beforehand are put back afterwards. */
function engine(registry: EffectRegistry, a: ReturnType<typeof fighter>[], b: ReturnType<typeof fighter>[]): CombatEngine {
  const kept = [...a, ...b].map(c => [c, new Map(c.statuses)] as const);
  const e = new CombatEngine(a, b, { registry, actionChooser: firstLegalChooser });
  for (const [c, statuses] of kept) c.statuses = statuses;
  return e;
}

describe('performExtraAttack', () => {
  function strikeBack(opts: { ignoreDefense?: boolean }, seen: ExtraAttackResult[]): EffectRegistry {
    const registry = new EffectRegistry();
    registry.register('strike', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { seen.push(ctx.engine.performExtraAttack(ctx.source, ctx.targets[0], flatDice(6), { ...opts, label: 'extra' })); },
    });
    return registry;
  }

  it('reports a wound, and an undefendable one passes over the guard', () => {
    const seen: ExtraAttackResult[] = [];
    const a = fighter('A', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    const b = fighter('B', [defenseCard()], { pv: 20 });
    playRound(engine(strikeBack({ ignoreDefense: true }, seen), [a], [b]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) },
    ]);
    expect(seen).toEqual([{ hit: true, damage: 6, recipient: b }]);
    expect(b.currentPV).toBe(14);
  });

  it('reports a held blow as a miss for nothing', () => {
    const seen: ExtraAttackResult[] = [];
    const a = fighter('A', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    const b = fighter('B', [defenseCard()], { pv: 20 });
    playRound(engine(strikeBack({}, seen), [a], [b]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) },
    ]);
    expect(seen).toEqual([{ hit: false, damage: 0 }]);
    expect(b.currentPV).toBe(20);
  });

  it('reports the PV lost after armour, so an absorbed blow is no wound', () => {
    const seen: ExtraAttackResult[] = [];
    const a = fighter('A', [focusCard('f', { speed: 1, effects: [{ type: 'strike' }] })]);
    const b = fighter('B', [focusCard()], { pv: 20, equipment: [armour(6)] });
    playRound(engine(strikeBack({}, seen), [a], [b]), [{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }]);
    expect(seen).toEqual([{ hit: true, damage: 0, recipient: b }]);
  });
});

describe('defensePenaltyAgainst: a weak spot an attacker side found', () => {
  const WEAK: StatusBehavior = { defensePenaltyAgainst(_ref, attacker) { return attacker.name === 'A' ? 3 : 0; } };

  it("lowers the defense against that side's blows", () => {
    const a = fighter('A', [attackCard('hit', { rollBonus: 5, speed: 1 })]);
    const b = fighter('B', [defenseCard('d', { rollBonus: 4 })], { pv: 20 });
    b.setStatus('weak', 1, -1, undefined, WEAK);
    playRound(engine(new EffectRegistry(), [a], [b]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) },
    ]);
    // attack 6 vs defense 4 − 3 = 1 → 5 damage
    expect(b.currentPV).toBe(15);
  });

  it('adds nothing against an undefended holder', () => {
    const a = fighter('A', [attackCard('hit', { rollBonus: 5 })]);
    const b = fighter('B', [focusCard()], { pv: 20 });
    b.setStatus('weak', 1, -1, undefined, WEAK);
    playRound(engine(new EffectRegistry(), [a], [b]), [{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }]);
    expect(b.currentPV).toBe(14);
  });
});

describe('opensGuardTo: an opening one attacker made', () => {
  const OPEN: StatusBehavior = {
    opensGuardTo(ctx, attacker) {
      if (attacker.name !== 'A') return false;
      ctx.holder.clearStatus(ctx.key);
      return true;
    },
  };

  it('the first blow of that attacker cannot be defended; the opening is spent', () => {
    const a = fighter('A', [attackCard('hit', { rollBonus: 5 })]);
    const b = fighter('B', [defenseCard()], { pv: 20 });
    b.setStatus('open', 1, -1, undefined, OPEN);
    const e = engine(new EffectRegistry(), [a], [b]);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) }]);
    expect(b.currentPV).toBe(14);
    expect(b.hasStatus('open')).toBe(false);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) }]);
    expect(b.currentPV).toBe(14);
  });

  it('is vetoed like any feint by preventsGuardBypass', () => {
    const a = fighter('A', [attackCard('hit', { rollBonus: 5 })]);
    const b = fighter('B', [defenseCard()], { pv: 20 });
    b.setStatus('open', 1, -1, undefined, OPEN);
    b.setStatus('aware', 1, -1, undefined, { preventsGuardBypass: () => true });
    playRound(engine(new EffectRegistry(), [a], [b]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) }, { team: 1, idx: 0, actionIdx: 0, targets: T(1, 0) },
    ]);
    expect(b.currentPV).toBe(20);
  });
});

describe('attackTargetsOnly: a taunt', () => {
  it("narrows an AI attack's choice to the named enemy", () => {
    const taunter = fighter('Provocador', [focusCard()], { pv: 30 });
    const other = fighter('Altre', [focusCard()], { pv: 30 });
    const brute = fighter('Bèstia', [attackCard('hit', { rollBonus: 4 })], { ai: true });
    brute.setStatus('provocat', 1, -1, { by: taunter }, { attackTargetsOnly: ctx => [ctx.entry.data!['by'] as typeof taunter] });
    // Without a target policy the engine takes the pool in order: Altre would be first.
    const e = engine(new EffectRegistry(), [other, taunter], [brute]);
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0 }]);
    expect(other.currentPV).toBe(30);
    expect(taunter.currentPV).toBe(25);
  });

  it('an area attack lands once, on the named enemy', () => {
    const taunter = fighter('Provocador', [focusCard()], { pv: 30 });
    const other = fighter('Altre', [focusCard()], { pv: 30 });
    const brute = fighter('Bèstia', [attackCard('sweep', { rollBonus: 4, targetCount: 99 })], { ai: true });
    brute.setStatus('provocat', 1, -1, undefined, { attackTargetsOnly: () => [taunter] });
    playRound(engine(new EffectRegistry(), [other, taunter], [brute]), [{ team: 0, idx: 0, actionIdx: 0 }, { team: 0, idx: 1, actionIdx: 0 }]);
    expect(other.currentPV).toBe(30);
    expect(taunter.currentPV).toBe(25);
  });

  it('with the named enemy gone, the holder aims freely', () => {
    const taunter = fighter('Provocador', [focusCard()], { pv: 30 });
    const other = fighter('Altre', [focusCard()], { pv: 30 });
    const brute = fighter('Bèstia', [attackCard('hit', { rollBonus: 4 })], { ai: true });
    brute.setStatus('provocat', 1, -1, undefined, { attackTargetsOnly: () => [taunter] });
    const e = engine(new EffectRegistry(), [other, taunter], [brute]);
    taunter.currentPV = 0;
    playRound(e, [{ team: 0, idx: 0, actionIdx: 0 }]);
    expect(other.currentPV).toBe(25);
  });
});

describe('a guard already rolled, against one attacker (Guard.fixedTotal / onlyAgainst)', () => {
  it('contests that attacker with its fixed total, sums with other defenders, and ignores everyone else', () => {
    const registry = new EffectRegistry();
    const parry = focusCard('parry', { speed: 9, effects: [{ type: 'parry' }] });
    registry.register('parry', {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action, fixedTotal: 4, onlyAgainst: ctx.targets[0] }); },
    });
    const me = fighter('Jo', [parry], { pv: 30 });
    const x = fighter('X', [attackCard('hit', { rollBonus: 5, speed: 0 })]);
    const y = fighter('Y', [attackCard('hit', { rollBonus: 5, speed: 0 })]);
    playRound(engine(registry, [me], [x, y]), [
      { team: 0, idx: 0, actionIdx: 0, targets: T(1, 0) },
      { team: 1, idx: 0, actionIdx: 0, targets: T(0, 0) },
      { team: 1, idx: 1, actionIdx: 0, targets: T(0, 0) },
    ]);
    // X: 6 vs 4 → 2. Y: undefended → 6.
    expect(me.currentPV).toBe(22);
  });
});

describe('a card that aims at the reveal (aimsAtReveal / onAimed / presetAttackRoll)', () => {
  function registryFor(log: string[]): EffectRegistry {
    const registry = new EffectRegistry();
    registry.register('aim_early', {
      aimsAtReveal() { return true; },
      onAimed(ctx) { log.push(`aimed:${ctx.targets.map(t => t.name).join(',')}`); ctx.source.setStatus('preset', 7, 1); },
      presetAttackRoll(ctx) { return ctx.source.hasStatus('preset') ? ctx.source.getStatusValue('preset') : undefined; },
    });
    registry.register('note', { onResolve(ctx) { log.push(`resolved:${ctx.source.name}`); } });
    return registry;
  }

  it('an AI seat aims when the cards are revealed, and the attack uses the roll made then', () => {
    const log: string[] = [];
    const ai = fighter('IA', [attackCard('early', { speed: 0, dice: new DiceRoll(1, 1), effects: [{ type: 'aim_early' }] })], { ai: true });
    const foe = fighter('Foe', [focusCard('f', { speed: 9, effects: [{ type: 'note' }] })], { pv: 30 });
    const e = engine(registryFor(log), [foe], [ai]);
    e.prepareRound();
    e.planActions([{ team: 0, idx: 0, actionIdx: 0 }]);
    expect(log).toEqual(['aimed:Foe']);
    let r = e.resolveNextAction();
    while (r.kind !== 'done') r = e.resolveNextAction();
    e.finishRound();
    expect(log).toEqual(['aimed:Foe', 'resolved:Foe']);
    expect(foe.currentPV).toBe(23);
  });

  it('a human seat that named no target is asked before anything resolves', () => {
    const log: string[] = [];
    const me = fighter('Jo', [attackCard('early', { speed: 0, effects: [{ type: 'aim_early' }] })]);
    const f1 = fighter('F1', [focusCard('f', { speed: 9, effects: [{ type: 'note' }] })], { pv: 30, ai: true });
    const f2 = fighter('F2', [focusCard()], { pv: 30, ai: true });
    const e = engine(registryFor(log), [me], [f1, f2]);
    e.prepareRound();
    e.planActions([{ team: 0, idx: 0, actionIdx: 0 }]);
    const step = e.resolveNextAction();
    expect(step.kind).toBe('target');
    expect(log).toEqual([]);
    e.setResolveTarget(T(1, 1));
    expect(log).toEqual(['aimed:F2']);
    let r = e.resolveNextAction();
    while (r.kind !== 'done') {
      expect(r.kind).not.toBe('target');
      r = e.resolveNextAction();
    }
    e.finishRound();
    expect(f2.currentPV).toBe(23);
  });
});

describe('equipment whose bonuses need a skill (bonusRequires)', () => {
  const blade: EquipmentDefinition = {
    id: 'blade', name: 'Blade', slot: EquipmentSlot.Weapon, passiveArmor: 0, speedPenalty: 0,
    rollBonuses: [{ skillId: '*', kind: 'defense', value: 1 }], attackBonus: 1,
    bonusRequires: { skillId: 'fencing', level: 2 }, iconPath: '', description: '',
  };
  const wielder = (level: number) => createCharacter({
    name: 'W', classCss: 'test', pv: 10, skills: { fencing: level }, actions: [], equipment: [blade],
  });

  it('below the level: still a weapon, at +0 and no defense bonus', () => {
    const c = wielder(1);
    expect(c.getWeaponAttackBonus()).toBe(0);
    expect(c.getRollBonus('any', 'defense')).toBe(0);
  });

  it('at the level: both bonuses count', () => {
    const c = wielder(2);
    expect(c.getWeaponAttackBonus()).toBe(1);
    expect(c.getRollBonus('any', 'defense')).toBe(1);
    expect(c.getRollBonus('any', 'attack')).toBe(0);
  });

  it('unarmed is undefined, not zero', () => {
    expect(createCharacter({ name: 'U', classCss: 'test', pv: 10, skills: {}, actions: [] }).getWeaponAttackBonus()).toBeUndefined();
  });
});

describe('a lock on a card type never takes the desperation fallback', () => {
  it('a hand of attacks under a no-attacks lock still has its last resort', () => {
    const c = fighter('C', [attackCard('a'), attackCard('desperate', { lastResort: true })]);
    c.setStatus('locked', 1, 2, undefined, { blocksActionType: (_ref, t) => t === ActionType.Atac });
    expect(availableActionIndices(c, new EffectRegistry())).toEqual([1]);
  });
});
