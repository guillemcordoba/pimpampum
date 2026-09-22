// bench-exempt(depth): mechanics and seam tests — they assert what a card DOES,
// with hand-built one-round positions and scripted choices. There is no AI
// decision to think harder about, so a depth would be noise in the diff rather
// than information; these are the only combats in the package that are not
// measurements.
import { describe, it, expect } from 'vitest';
import {
  ActionDefinition, ActionType, Character, CombatEngine, checkSkillUp, resolveAttack, resolveDamage,
  createCharacter, DiceRoll, StatusBehavior, FATIGUE_MAX_LEVEL, firstLegalChooser,
} from '@pimpampum/engine';
import { buildCharacter } from '@pimpampum/skills';
import { theRegistry } from '@pimpampum/bench';

/**
 * Deterministic tests for the engine's generic StatusBehavior seams. Statuses
 * get their mechanics from behaviours attached to the instance, so each test
 * wires a minimal inline behaviour against the seam under test. Unguarded
 * attacks auto-hit for their full roll and 1d1 dice always roll 1, so exact-PV
 * assertions are possible. (Content behaviours are exercised end-to-end by the
 * Metge tests below and statistically by the balance suite.)
 */

function atkDef(id = 'hit', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 0, actionType: ActionType.Atac,
    speed: 1, dice: new DiceRoll(1, 1), effects: [], description: '', iconPath: '',
    ...opts,
  };
}

function focusDef(id = 'wait', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 0, actionType: ActionType.Focus,
    speed: 0, effects: [], description: '', iconPath: '', ...opts,
  };
}

function defenseDef(id = 'block', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 0, actionType: ActionType.Defensa,
    speed: 5, rollBonus: 1000, effects: [], description: '', iconPath: '', ...opts,
  };
}

function makeChar(name: string, pv: number, actions: ActionDefinition[]): Character {
  // SKILL LEVEL 0, AND EVERY FIXTURE CARD AT `unlockLevel: 0`.
  //
  // A roll is the card's dice plus the actor's level in its skill, so any level
  // here would land on every assertion in this file — and these tests measure
  // what a CARD does, exactly, with 1d1 dice. The level is a separate mechanic
  // with its own tests.
  //
  // `unlockLevel: 0` is what makes level 0 workable: it is the engine's
  // documented "this card needs no skill" convention (types.ts), and without it
  // the unlock gate (`level >= unlockLevel`) would make every fixture card
  // unplayable.
  //
  // These tests were written before a level entered a roll at all, and had been
  // failing since mestratge arrived — 15 of them off by exactly the fixture's
  // level, for however long that was.
  return createCharacter({ name, classCss: 'test', pv, skills: { test: 0 }, actions });
}

/** A passive AI-driven punching bag that only waits. */
function sac(pv = 100): Character {
  const c = makeChar('Sac', pv, [focusDef()]);
  c.aiControlled = true;
  return c;
}

/** Run one round where team-0 humans play the given (actionIdx, targets). */
function runRound(engine: CombatEngine, selections: { idx: number; actionIdx: number; targets?: { team: number; idx: number }[] }[]): void {
  engine.prepareRound();
  engine.planActions(selections.map(s => ({ team: 0, idx: s.idx, actionIdx: s.actionIdx, targets: s.targets })));
  let r = engine.resolveNextAction();
  while (r.kind !== 'done') {
    if (r.kind === 'target') throw new Error('unexpected target prompt in test');
    r = engine.resolveNextAction();
  }
  engine.finishRound();
}

describe('StatusBehavior query seams', () => {
  it('clampPvLoss: PV cannot drop below the behaviour floor', () => {
    const FLOOR_1: StatusBehavior = {
      clampPvLoss(ref, amount) { return Math.min(amount, Math.max(0, ref.holder.currentPV - 1)); },
    };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac();
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('ultim-ale', 1, -1, undefined, FLOOR_1);
    engine.applyPvLoss(a, 999);
    expect(a.currentPV).toBe(1);
    expect(a.isAlive()).toBe(true);
  });

  it('modifySpeed: added to effective action speed', () => {
    const SLOW_3: StatusBehavior = { modifySpeed() { return -3; } };
    const a = makeChar('A', 20, [atkDef()]);
    expect(a.getEffectiveSpeed(a.actions[0])).toBe(1);
    a.setStatus('llast', 1, -1, undefined, SLOW_3);
    expect(a.getEffectiveSpeed(a.actions[0])).toBe(-2);
  });

  it('blocksActionType: the holder can only play the types the status allows', () => {
    const NOMES_FOCUS: StatusBehavior = {
      blocksActionType(_ref, type) { return type !== ActionType.Focus; },
    };
    const a = makeChar('A', 20, [atkDef(), focusDef(), defenseDef()]);
    const engine = new CombatEngine([a], [sac()], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('enterrat', 1, -1, undefined, NOMES_FOCUS);
    expect(engine.canPlayActionIdx(a, 0)).toBe(false);
    expect(engine.canPlayActionIdx(a, 1)).toBe(true);
    expect(engine.canPlayActionIdx(a, 2)).toBe(false);
    a.clearStatus('enterrat');
    expect(engine.canPlayActionIdx(a, 0)).toBe(true);
  });

  it('modifyOutgoingDamage / modifyIncomingDamage transform attack damage', () => {
    const OUT_3: StatusBehavior = { modifyOutgoingDamage(_ref, dmg) { return dmg + 3; } };
    const IN_MINUS_2: StatusBehavior = { modifyIncomingDamage(_ref, dmg) { return dmg - 2; } };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('verí-a-la-fulla', 1, -1, undefined, OUT_3);
    b.setStatus('pell-de-pedra', 1, -1, undefined, IN_MINUS_2);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // 1 (1d1) + 3 − 2 = 2
    expect(b.currentPV).toBe(48);
  });

  it('modifyIncomingDamage can consume its own status (one-shot wound bonus)', () => {
    const WOUND_5_ONCE: StatusBehavior = {
      modifyIncomingDamage(ref, dmg) {
        if (dmg <= 0) return dmg;
        ref.holder.clearStatus(ref.key);
        return dmg + 5;
      },
    };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    b.setStatus('marca', 1, -1, undefined, WOUND_5_ONCE);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // 1 + 5
    expect(b.currentPV).toBe(44);
    expect(b.hasStatus('marca')).toBe(false);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // just 1
    expect(b.currentPV).toBe(43);
  });

  it('preventsGuard: an otherwise-unbeatable guard is bypassed entirely', () => {
    const NO_GUARD: StatusBehavior = { preventsGuard() { return true; } };
    const target = makeChar('Target', 20, [focusDef()]);
    const guard = makeChar('Guard', 20, [defenseDef()]);
    const attacker = makeChar('Attacker', 20, [atkDef()]);
    attacker.aiControlled = true;
    const engine = new CombatEngine([target, guard], [attacker], { registry: theRegistry(), actionChooser: firstLegalChooser });

    // Guarded (rollBonus 1000): the attack is always blocked.
    runRound(engine, [
      { idx: 0, actionIdx: 0 },
      { idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    ]);
    expect(target.currentPV + guard.currentPV).toBe(40);

    // preventsGuard: the guard is ignored, the blow auto-hits the target.
    target.setStatus('exposat', 1, -1, undefined, NO_GUARD);
    const before = target.currentPV;
    runRound(engine, [
      { idx: 0, actionIdx: 0 },
      { idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    ]);
    expect(target.currentPV).toBe(before - 1);
  });

  it('absorbsGuard: the guard takes the full blow with no contest', () => {
    const ABSORB: StatusBehavior = { absorbsGuard() { return true; } };
    const target = makeChar('Target', 20, [focusDef()]);
    const guard = makeChar('Guard', 20, [defenseDef()]);
    const attacker = makeChar('Attacker', 20, [atkDef()]);
    attacker.aiControlled = true;
    const engine = new CombatEngine([target, guard], [attacker], { registry: theRegistry(), actionChooser: firstLegalChooser });

    // Refresh the absorb stance each round like a defense action would.
    engine.prepareRound();
    guard.setStatus('aguanta', 1, 1, undefined, ABSORB);
    engine.planActions([
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 0, idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    ]);
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') r = engine.resolveNextAction();
    engine.finishRound();

    expect(target.currentPV).toBe(20);
    expect(guard.currentPV).toBe(19); // took the 1d1 in full despite rollBonus 1000
  });

  it('cardSwapCharges/spendCardSwapCharge: flowSwap spends and clears at zero', () => {
    const SWAP: StatusBehavior = {
      cardSwapCharges(ref) { return ref.entry.value; },
      spendCardSwapCharge(ref) {
        ref.entry.value--;
        if (ref.entry.value <= 0) ref.holder.clearStatus(ref.key);
      },
    };
    const a = makeChar('A', 20, [atkDef('primera'), atkDef('segona')]);
    const b = sac();
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('flux-test', 2, -1, undefined, SWAP);

    engine.prepareRound();
    engine.planActions([{ team: 0, idx: 0, actionIdx: 0 }]);
    expect(engine.flowSwapRefs()).toHaveLength(1);
    expect(engine.cardSwapCharges(a)).toBe(2);

    let revealed = engine.flowSwap({ team: 0, idx: 0 }, 1);
    expect(revealed.find(x => x.actorTeam === 0)!.actionId).toBe('segona');
    expect(engine.cardSwapCharges(a)).toBe(1);

    revealed = engine.flowSwap({ team: 0, idx: 0 }, 0);
    expect(revealed.find(x => x.actorTeam === 0)!.actionId).toBe('primera');
    expect(engine.cardSwapCharges(a)).toBe(0);
    expect(a.hasStatus('flux-test')).toBe(false);
    expect(engine.flowSwapRefs()).toHaveLength(0);
  });
});

describe('StatusBehavior engine seams', () => {
  it('onAttackAction ladder: multiplier doubles per attacking round, onRoundEnd breaks it', () => {
    const CHAIN: StatusBehavior = {
      onAttackAction(ctx) {
        const mult = ctx.entry.value * 2;
        ctx.entry.value = mult;
        // attackTotalMult alone: the attack total IS the damage margin now.
        return { attackTotalMult: mult };
      },
      onRoundEnd(ctx) {
        if (ctx.entry.data?.['armedRound'] === ctx.engine.round) return;
        if (ctx.playedAction?.actionType !== ActionType.Atac) ctx.holder.clearStatus(ctx.key);
      },
    };
    const a = makeChar('A', 20, [atkDef(), focusDef()]);
    const b = sac(100);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });

    engine.prepareRound();
    a.setStatus('cadena-test', 1, -1, { armedRound: engine.round }, CHAIN);
    engine.planActions([{ team: 0, idx: 0, actionIdx: 1 }]); // arming round: focus
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') r = engine.resolveNextAction();
    engine.finishRound();
    expect(a.hasStatus('cadena-test')).toBe(true); // arming round is exempt from the break

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // ×2 → 2 damage
    expect(b.currentPV).toBe(98);
    expect(a.getStatusValue('cadena-test', 0)).toBe(2);

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // ×4 → 4 damage
    expect(b.currentPV).toBe(94);
    expect(a.getStatusValue('cadena-test', 0)).toBe(4);

    runRound(engine, [{ idx: 0, actionIdx: 1 }]); // focus → chain breaks
    expect(a.hasStatus('cadena-test')).toBe(false);
  });

  it('onEnemyAttackAction hazard: each tripped mine costs the attacker exactly its blast', () => {
    const MINES: StatusBehavior = {
      onEnemyAttackAction(ctx, attacker) {
        if (ctx.entry.value <= 0) return false;
        if (ctx.engine.rollDie(20) <= 10) {
          ctx.engine.applyPvLoss(attacker, 1, undefined);
          ctx.entry.value--;
          if (ctx.entry.value <= 0) ctx.holder.clearStatus(ctx.key);
        }
        return true; // one check per attack
      },
    };
    const a = makeChar('A', 200, [atkDef()]);
    const layer = sac(500);
    const engine = new CombatEngine([a], [layer], { registry: theRegistry(), actionChooser: firstLegalChooser });
    layer.setStatus('mines-test', 3, -1, undefined, MINES);

    for (let i = 0; i < 60 && layer.hasStatus('mines-test'); i++) {
      runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    }
    const minesLeft = layer.getStatusValue('mines-test', 0);
    expect(200 - a.currentPV).toBe(3 - minesLeft); // 1 PV per tripped mine
  });

  it('attackRepeats: the attack executes twice, then the status is consumed', () => {
    const DOUBLE_ONCE: StatusBehavior = {
      attackRepeats(ctx) { ctx.holder.clearStatus(ctx.key); return 1; },
    };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('adrenalina-test', 1, 1, undefined, DOUBLE_ONCE);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    expect(b.currentPV).toBe(48); // two 1d1 swings
    expect(a.hasStatus('adrenalina-test')).toBe(false);

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // back to a single swing
    expect(b.currentPV).toBe(47);
  });

  it('attackRepeats status expires at round end if the holder did not attack', () => {
    const DOUBLE_ONCE: StatusBehavior = {
      attackRepeats(ctx) { ctx.holder.clearStatus(ctx.key); return 1; },
    };
    const a = makeChar('A', 20, [atkDef(), focusDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('adrenalina-test', 1, 1, undefined, DOUBLE_ONCE);
    runRound(engine, [{ idx: 0, actionIdx: 1 }]); // focus — the surge fizzles
    expect(a.hasStatus('adrenalina-test')).toBe(false);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // single swing only
    expect(b.currentPV).toBe(49);
  });

  it('onRoundEnd runs for statuses regardless of the action played (dot ticks)', () => {
    const TICK_2: StatusBehavior = {
      onRoundEnd(ctx) {
        if (ctx.holder.isAlive()) ctx.engine.applyPvLoss(ctx.holder, 2, undefined);
      },
    };
    const a = makeChar('A', 20, [focusDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('crema-test', 2, 3, undefined, TICK_2);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    expect(a.currentPV).toBe(16); // 2 ticks × 2 PV
  });
});

describe('bloqueig conjunt (summed wall)', () => {
  /** Two human blockers (1d1 defenses) + an AI enemy attacker (1d1 + bonus). */
  function wallSetup(atkBonus: number, d1Bonus = 0, opts: Partial<ActionDefinition> = {}) {
    const d1 = makeChar('D1', 20, [defenseDef('bloc1', { dice: new DiceRoll(1, 1), rollBonus: d1Bonus })]);
    const d2 = makeChar('D2', 20, [defenseDef('bloc2', { dice: new DiceRoll(1, 1), rollBonus: 0 }), focusDef()]);
    const e = makeChar('E', 50, [atkDef('cop', { rollBonus: atkBonus, ...opts })]);
    e.aiControlled = true;
    const engine = new CombatEngine([d1, d2], [e], { registry: theRegistry(), actionChooser: firstLegalChooser });
    return { d1, d2, e, engine };
  }
  const blockE = [
    { idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] },
    { idx: 1, actionIdx: 0, targets: [{ team: 1, idx: 0 }] },
  ];

  it('the wall contests with the sum; ties hold and the attacker learns', () => {
    const { d1, d2, e, engine } = wallSetup(1); // attack 2 vs sum 1+1=2 → tie holds
    runRound(engine, blockE);
    expect(d1.currentPV).toBe(20);
    expect(d2.currentPV).toBe(20);
    expect(e.getSkillLevel('test')).toBe(1); // lost by 0 → learns (fixtures start at 0)
  });

  it('a breach damages the weak link (lowest individual roll) only', () => {
    const { d1, d2, engine } = wallSetup(9, 2); // attack 10 vs (3 + 1) → margin 6
    runRound(engine, blockE);
    expect(d1.currentPV).toBe(20);
    expect(d2.currentPV).toBe(14); // D2 rolled 1 < D1's 3
    expect(d1.getSkillLevel('test')).toBe(0); // margin 6 > 2 → nobody learns
    expect(d2.getSkillLevel('test')).toBe(0);
  });

  it('a close breach (≤ SKILL_UP_MARGIN) teaches every blocker', () => {
    const { d1, d2, engine } = wallSetup(5, 2); // attack 6 vs (3 + 1) → margin 2
    runRound(engine, blockE);
    expect(d2.currentPV).toBe(18);
    expect(d1.getSkillLevel('test')).toBe(1); // both learn
    expect(d2.getSkillLevel('test')).toBe(1);
  });

  it('full-coverage AoE ignores the wall: each blocker defends alone', () => {
    const { d1, d2, engine } = wallSetup(9, 0, { targetCount: 99 }); // attack 10 vs 1, twice
    runRound(engine, blockE);
    expect(d1.currentPV).toBe(11); // margin 9 each — NOT a summed contest
    expect(d2.currentPV).toBe(11);
  });

  /** Round runner that accepts raw selections for BOTH teams. */
  function runRoundRaw(engine: CombatEngine, selections: { team: number; idx: number; actionIdx: number; targets?: { team: number; idx: number }[] }[]): void {
    engine.prepareRound();
    engine.planActions(selections);
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') {
      if (r.kind === 'target') throw new Error('unexpected target prompt in test');
      r = engine.resolveNextAction();
    }
    engine.finishRound();
  }

  it('guard wall: two defenders guarding the same ally contest with the sum', () => {
    const a = makeChar('A', 20, [focusDef()]);
    const d1 = makeChar('D1', 20, [defenseDef('g1', { dice: new DiceRoll(1, 1), rollBonus: 2 })]);
    const d2 = makeChar('D2', 20, [defenseDef('g2', { dice: new DiceRoll(1, 1), rollBonus: 0 })]);
    const e = makeChar('E', 50, [atkDef('cop', { rollBonus: 9 })]);
    const engine = new CombatEngine([a, d1, d2], [e], { registry: theRegistry(), actionChooser: firstLegalChooser });
    runRoundRaw(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 0, idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // D1 guards A
      { team: 0, idx: 2, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // D2 guards A
      { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // E attacks A
    ]);
    expect(a.currentPV).toBe(20); // the ally never takes the breach
    expect(d1.currentPV).toBe(20); // rolled 3
    expect(d2.currentPV).toBe(14); // weak link: attack 10 vs (3+1) → margin 6
  });

  it('guard wall: the ally\'s own self-defense joins the sum and can be the weak link', () => {
    const a = makeChar('A', 20, [defenseDef('ga', { dice: new DiceRoll(1, 1), rollBonus: 0 })]);
    const d1 = makeChar('D1', 20, [focusDef()]);
    const d2 = makeChar('D2', 20, [defenseDef('g2', { dice: new DiceRoll(1, 1), rollBonus: 2 })]);
    const e = makeChar('E', 50, [atkDef('cop', { rollBonus: 9 })]);
    const engine = new CombatEngine([a, d1, d2], [e], { registry: theRegistry(), actionChooser: firstLegalChooser });
    runRoundRaw(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 1 }] }, // A defends (guards D1) → self-guard active
      { team: 0, idx: 1, actionIdx: 0 },
      { team: 0, idx: 2, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // D2 guards A
      { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // E attacks A
    ]);
    expect(a.currentPV).toBe(14); // attack 10 vs (A 1 + D2 3) → margin 6, weak link A
    expect(d2.currentPV).toBe(20);
  });

  it('guard wall: a close breach teaches every defender on the wall', () => {
    const a = makeChar('A', 20, [focusDef()]);
    const d1 = makeChar('D1', 20, [defenseDef('g1', { dice: new DiceRoll(1, 1), rollBonus: 2 })]);
    const d2 = makeChar('D2', 20, [defenseDef('g2', { dice: new DiceRoll(1, 1), rollBonus: 0 })]);
    const e = makeChar('E', 50, [atkDef('cop', { rollBonus: 5 })]);
    const engine = new CombatEngine([a, d1, d2], [e], { registry: theRegistry(), actionChooser: firstLegalChooser });
    runRoundRaw(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 0, idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
      { team: 0, idx: 2, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
      { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }, // attack 6 vs (3+1) → margin 2
    ]);
    expect(d2.currentPV).toBe(18);
    expect(d1.getSkillLevel('test')).toBe(1); // both wall members learn
    expect(d2.getSkillLevel('test')).toBe(1);
    expect(a.getSkillLevel('test')).toBe(0); // the ally wasn't on the wall
  });

  it('a single block still resolves as an ordinary one-on-one contest', () => {
    const { d1, d2, engine } = wallSetup(2); // attack 3 vs D1's 1 → margin 2
    runRound(engine, [
      { idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] },
      { idx: 1, actionIdx: 1 }, // D2 idles on a focus — no second block
    ]);
    expect(d1.currentPV).toBe(18); // no sum with anyone
    expect(d1.getSkillLevel('test')).toBe(1); // close loss teaches the blocker
    expect(d2.currentPV).toBe(20);
  });
});

describe('fatigue level', () => {
  it('subtracts one from every roll per level, clamped to the ladder', () => {
    const a = makeChar('A', 20, [atkDef()]);
    expect(a.getRollBonus('test', 'attack')).toBe(0);
    a.setFatigue(2);
    expect(a.getRollBonus('test', 'attack')).toBe(-2);
    expect(a.getRollBonus('test', 'defense')).toBe(-2);
    expect(a.getRollBonus('test')).toBe(-2); // non-contest rolls too
    expect(a.getFatigueStateName()).toBe('Fatigat');
    a.setFatigue(99);
    expect(a.fatigue).toBe(FATIGUE_MAX_LEVEL);
    a.rest();
    expect(a.fatigue).toBe(0);
  });

  it('never gates a card and never moves on its own during a fight', () => {
    const a = makeChar('A', 20, [atkDef()]);
    a.setFatigue(FATIGUE_MAX_LEVEL);
    const enemy = sac(50);
    const engine = new CombatEngine([a], [enemy], { registry: theRegistry(), actionChooser: firstLegalChooser });
    expect(engine.canPlayActionIdx(a, 0)).toBe(true);
    runRound(engine, [{ idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(a.fatigue).toBe(FATIGUE_MAX_LEVEL);
  });

  it('comes off the attack total, so an undefended hit lands N lighter', () => {
    const a = makeChar('A', 20, [atkDef('big', { dice: new DiceRoll(6, 1) })]); // flat 6

    a.setFatigue(2);
    const enemy = sac(50);
    const engine = new CombatEngine([a], [enemy], { registry: theRegistry(), actionChooser: firstLegalChooser });
    runRound(engine, [{ idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);
    expect(enemy.currentPV).toBe(46); // 6 − 2
  });
});

describe('Metge de campanya (full path, zero engine edits)', () => {
  it("injecció d'adrenalina doubles the ally's attack and costs a fatigue level", () => {
    const metge = buildCharacter({ name: 'Metge', pv: 20, skills: { metge: 2 } });
    // Flat 3d1, so the doubling is the only thing being measured.
    const lluitador = makeChar('Lluitador', 20, [atkDef('hit', { dice: new DiceRoll(3, 1) })]);
    const enemy = sac(50);
    const engine = new CombatEngine([metge, lluitador], [enemy], { registry: theRegistry(), actionChooser: firstLegalChooser });

    const injIdx = metge.actions.findIndex(x => x.def.id === 'injeccio-adrenalina');
    runRound(engine, [
      { idx: 0, actionIdx: injIdx, targets: [{ team: 0, idx: 1 }] },
      { idx: 1, actionIdx: 0, targets: [{ team: 1, idx: 0 }] },
    ]);
    // The injection (speed 5) lands before the swing (speed 1), so both
    // swings already carry the new level: two hits of 3 − 1.
    expect(lluitador.fatigue).toBe(1); // the injection; playing cards costs none
    expect(enemy.currentPV).toBe(46);
    expect(lluitador.hasStatus('adrenalina')).toBe(false);
  });

  it('cures de camp heals the roll of its own dice (2d4) in PV', () => {
    const metge = buildCharacter({ name: 'Metge', pv: 20, skills: { metge: 2 } });
    const ferit = makeChar('Ferit', 20, [focusDef()]);
    const enemy = sac(50);
    const engine = new CombatEngine([metge, ferit], [enemy], { registry: theRegistry(), actionChooser: firstLegalChooser });
    ferit.currentPV = 5;

    const curesIdx = metge.actions.findIndex(x => x.def.id === 'cures-de-camp');
    runRound(engine, [
      { idx: 0, actionIdx: curesIdx, targets: [{ team: 0, idx: 1 }] },
      { idx: 1, actionIdx: 0 },
    ]);
    // 2d4 → between 2 and 8 PV healed.
    expect(ferit.currentPV).toBeGreaterThanOrEqual(7);
    expect(ferit.currentPV).toBeLessThanOrEqual(13);
  });
});

describe('flanking (AttackModifiers.defensePenalty)', () => {
  /** Round runner accepting raw selections for BOTH teams. */
  function runRoundRaw(engine: CombatEngine, selections: { team: number; idx: number; actionIdx: number; targets?: { team: number; idx: number }[] }[]): void {
    engine.prepareRound();
    engine.planActions(selections);
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') {
      if (r.kind === 'target') throw new Error('unexpected target prompt in test');
      r = engine.resolveNextAction();
    }
    engine.finishRound();
  }

  /** Two AI-free enemy attackers vs one self-guarding player. E1 (fast, plain)
   *  opens the target; E2 (slow, `flanking`) should find a weakened defense. */
  function flankSetup(defBonus: number, flankBonus: number) {
    const d = makeChar('D', 20, [defenseDef('parada', { dice: new DiceRoll(1, 1), rollBonus: defBonus }), focusDef()]);
    const e1 = makeChar('E1', 50, [atkDef('obre', { speed: 3 })]);
    const e2 = makeChar('E2', 50, [atkDef('traidora', { speed: 1, rollBonus: flankBonus, effects: [{ type: 'flanking' }] })]);
    const engine = new CombatEngine([d], [e1, e2], { registry: theRegistry(), actionChooser: firstLegalChooser });
    return { d, engine };
  }
  const bothAtD = [
    { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    { team: 1, idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
  ];
  const selfGuard = { team: 0, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] };
  const focusing = { team: 0, idx: 0, actionIdx: 1 };

  it('a flanked defense is lowered by 3, so a blow that would miss now lands', () => {
    // Defense 1+5=6. Flanking attack 1+3=4 → 4 vs 6−3=3 → margin 1.
    const { d, engine } = flankSetup(5, 3);
    runRoundRaw(engine, [selfGuard, ...bothAtD]);
    expect(d.currentPV).toBe(19);
  });

  it('without an ally opening the target there is no penalty', () => {
    // Same numbers, but E2 attacks alone: 4 vs 6 → blocked.
    const d = makeChar('D', 20, [defenseDef('parada', { dice: new DiceRoll(1, 1), rollBonus: 5 })]);
    const e2 = makeChar('E2', 50, [atkDef('traidora', { speed: 1, rollBonus: 3, effects: [{ type: 'flanking' }] })]);
    const engine = new CombatEngine([d], [e2], { registry: theRegistry(), actionChooser: firstLegalChooser });
    runRoundRaw(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
      { team: 1, idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    ]);
    expect(d.currentPV).toBe(20);
  });

  it('an UNDEFENDED target takes no extra damage — the penalty is not a roll bonus', () => {
    // D focuses instead of defending: E1 hits for 1, E2 for its full 4 (not 7).
    const { d, engine } = flankSetup(5, 3);
    runRoundRaw(engine, [focusing, ...bothAtD]);
    expect(d.currentPV).toBe(15);
  });
});

describe('combat cloning (the lookahead primitive)', () => {
  function runRoundRaw(engine: CombatEngine, selections: { team: number; idx: number; actionIdx: number; targets?: { team: number; idx: number }[] }[]): void {
    engine.prepareRound();
    engine.planActions(selections);
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') {
      if (r.kind === 'target') throw new Error('unexpected target prompt in test');
      r = engine.resolveNextAction();
    }
    engine.finishRound();
  }

  it('a clone plays forward without touching the original', () => {
    const a = makeChar('A', 20, [atkDef('cop', { rollBonus: 5 })]);
    const b = sac(30);
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });

    const copy = engine.clone();
    const [copyA] = copy.teams[0];
    const [copyB] = copy.teams[1];
    expect(copyA).not.toBe(a);              // genuinely separate objects
    expect(copyB).not.toBe(b);

    runRoundRaw(copy, [{ team: 0, idx: 0, actionIdx: 0, targets: [{ team: 1, idx: 0 }] }]);

    expect(copyB.currentPV).toBeLessThan(30); // the clone advanced…
    expect(b.currentPV).toBe(30);             // …and the original did not
    expect(copy.round).toBe(1);
    expect(engine.round).toBe(0);
    expect(engine.history).toHaveLength(0);
    expect(copy.history.length).toBeGreaterThan(0);
  });

  it('clones statuses, modifiers and consumed cards without sharing them', () => {
    const BEHAVIOR: StatusBehavior = { modifySpeed() { return 0; } };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac();
    const engine = new CombatEngine([a], [b], { registry: theRegistry(), actionChooser: firstLegalChooser });
    a.setStatus('prova', 3, 5, { n: 1 }, BEHAVIOR);

    const copy = engine.clone();
    const copyA = copy.teams[0][0];
    expect(copyA.getStatusValue('prova')).toBe(3);
    expect(copyA.getStatus('prova')!.behavior).toBe(BEHAVIOR); // shared, not copied

    copyA.setStatus('prova', 99, 5, { n: 2 }, BEHAVIOR);
    copyA.actions[0].consumed = true;
    expect(a.getStatusValue('prova')).toBe(3);      // original untouched
    expect(a.getStatus('prova')!.data!.n).toBe(1);
    expect(a.actions[0].consumed).toBe(false);
  });

  it('rewires cross-character references (guards and Characters parked in status data)', () => {
    const LINK: StatusBehavior = {};
    const a = makeChar('A', 20, [defenseDef('g', { dice: new DiceRoll(1, 1) })]);
    const ally = makeChar('B', 20, [focusDef()]);
    const foe = sac();
    const engine = new CombatEngine([a, ally], [foe], { registry: theRegistry(), actionChooser: firstLegalChooser });
    ally.guards = [{ defender: a, action: a.actions[0].def }];
    ally.setStatus('lligat', 1, -1, { binder: foe }, LINK);

    const copy = engine.clone();
    const [copyA, copyAlly] = copy.teams[0];
    const [copyFoe] = copy.teams[1];
    // The clone's guard must point at the CLONE's defender, not the original.
    expect(copyAlly.guards[0].defender).toBe(copyA);
    expect(copyAlly.guards[0].defender).not.toBe(a);
    // …and so must a Character sitting inside an inert status payload.
    expect(copyAlly.getStatus('lligat')!.data!.binder).toBe(copyFoe);
    expect(copyAlly.getStatus('lligat')!.data!.binder).not.toBe(foe);
  });
});

/**
 * Mur de pedra's life pool (the shared standing-wall card). The wall no longer
 * shatters on the first breach: the stone eats the damage, and only crumbles
 * once its own life is spent — any excess carries through to the protected.
 */
describe('standing wall: the wall has life', () => {
  /** Wall card with deterministic dice: 0d0+10 → defends at 10, life 10. */
  function wallDef(): ActionDefinition {
    return {
      id: 'mur-test', name: 'Mur', skillId: 'test', unlockLevel: 0,
      actionType: ActionType.Defensa, speed: 5, dice: new DiceRoll(0, 0, 10),
      effects: [{ type: 'standing_wall' }], description: '', iconPath: '',
    };
  }

  it('soaks each breach into its own life and shatters only when drained', () => {
    // Attack 12 + 1d1 = 13 vs a wall of 10 → every breach is exactly 3.
    const caster = makeChar('Terra', 30, [wallDef(), focusDef()]);
    const attacker = makeChar('Attacker', 20, [atkDef('cop', { rollBonus: 12 })]);
    attacker.aiControlled = true;
    const engine = new CombatEngine([caster], [attacker], { registry: theRegistry(), actionChooser: firstLegalChooser });

    // Round 1: the caster raises the wall on themselves and guards normally, so
    // this breach hits the caster, not the stone.
    runRound(engine, [{ idx: 0, actionIdx: 0, targets: [{ team: 0, idx: 0 }] }]);
    expect(caster.getStatus('mur-de-pedra')!.data!.life).toBe(10);
    expect(caster.currentPV).toBe(27);

    // Rounds 2-3: no live guard — the standing wall contests and eats the margin.
    runRound(engine, [{ idx: 0, actionIdx: 1 }]);
    expect(caster.getStatus('mur-de-pedra')!.data!.life).toBe(7);
    expect(caster.currentPV).toBe(27);
    runRound(engine, [{ idx: 0, actionIdx: 1 }]);
    expect(caster.getStatus('mur-de-pedra')!.data!.life).toBe(4);
    expect(caster.currentPV).toBe(27);

    // Round 4: 4 life left against a breach of 3 → 1 left, still standing.
    runRound(engine, [{ idx: 0, actionIdx: 1 }]);
    expect(caster.getStatus('mur-de-pedra')!.data!.life).toBe(1);
    expect(caster.currentPV).toBe(27);

    // Round 5: the last point of stone absorbs 1, the wall crumbles and the
    // remaining 2 carry through.
    runRound(engine, [{ idx: 0, actionIdx: 1 }]);
    expect(caster.hasStatus('mur-de-pedra')).toBe(false);
    expect(caster.currentPV).toBe(25);
  });
});

describe('the rules themselves — resolution.ts, exactly', () => {
  /*
   * MOVED HERE FROM `balance.test.ts` ON 2026-09-22, and the move is the point.
   *
   * These are millisecond assertions on pure functions, but they were sitting
   * in a file that also runs solved encounters and mirror sweeps — 35 seconds
   * — so they could not join the mutation harness's kill set, which is fast
   * files only (`src/mutation.ts`). The consequence was measured rather than
   * guessed: the mutant "armour stops reducing damage" SURVIVED a 15-mutant
   * run. Deleting armour from the damage rule outright changed nothing any
   * affordable test could see, because the one test that checks it was locked
   * inside a slow file.
   *
   * The rule this encodes: a test of a PURE FUNCTION belongs with the fast
   * tests, whatever subject it is about. Mixing tempos in one file makes the
   * fast half unusable.
   */

  it('the loser levels a skill only on a close loss (≤2)', () => {
    expect(checkSkillUp(0)).toBe(true);   // tie: the attacker lost by 0
    expect(checkSkillUp(1)).toBe(true);
    expect(checkSkillUp(2)).toBe(true);
    expect(checkSkillUp(3)).toBe(false);  // lost by too much to learn
    expect(checkSkillUp(-1)).toBe(false); // winners never level
  });

  it('damage is the margin: defended hits deal attack − defense, undefended the full roll', () => {
    expect(resolveAttack(10, 7)).toEqual({ hit: true, margin: 3 });
    expect(resolveAttack(7, 7)).toEqual({ hit: false, margin: 0 });  // tie: defense holds
    expect(resolveAttack(5, 9)).toEqual({ hit: false, margin: -4 });
    expect(resolveAttack(6, null)).toEqual({ hit: true, margin: 6 }); // undefended: full roll
  });

  it('subtracts armour from the margin, floored at zero', () => {
    // THE MUTANT THAT SURVIVED until this moved. Armour is a bounded lever the
    // whole equipment design rests on; removing it should never be quiet.
    expect(resolveDamage(7, 3)).toBe(4);
    expect(resolveDamage(2, 5)).toBe(0);
    expect(resolveDamage(5, 0)).toBe(5);
  });
});
