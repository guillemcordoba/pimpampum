import { describe, it, expect } from 'vitest';
import {
  ActionDefinition, ActionType, AIStrategy, Character, CombatEngine,
  createCharacter, DiceRoll, StatusBehavior,
} from '@pimpampum/engine';
import { buildCharacter } from '@pimpampum/skills';
import { REGISTRY } from './helpers.js';

/**
 * Deterministic tests for the engine's generic StatusBehavior seams. Statuses
 * get their mechanics from behaviours attached to the instance, so each test
 * wires a minimal inline behaviour against the seam under test. Unguarded
 * attacks auto-hit with no d20 and 1d1 dice always roll 1, so exact-PV
 * assertions are possible. (Content behaviours are exercised end-to-end by the
 * Metge tests below and statistically by the balance suite.)
 */

function atkDef(id = 'hit', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 1, actionType: ActionType.Atac,
    speed: 1, damageDice: new DiceRoll(1, 1), effects: [], description: '', iconPath: '',
    ...opts,
  };
}

function focusDef(id = 'wait', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 1, actionType: ActionType.Focus,
    speed: 0, effects: [], description: '', iconPath: '', ...opts,
  };
}

function defenseDef(id = 'block', opts: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'test', unlockLevel: 1, actionType: ActionType.Defensa,
    speed: 5, rollBonus: 1000, effects: [], description: '', iconPath: '', ...opts,
  };
}

function makeChar(name: string, pv: number, actions: ActionDefinition[]): Character {
  return createCharacter({ name, classCss: 'test', pv, skills: { test: 10 }, actions });
}

/** A passive AI-driven punching bag that only waits. */
function sac(pv = 100): Character {
  const c = makeChar('Sac', pv, [focusDef()]);
  c.aiStrategy = AIStrategy.Power;
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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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

  it('modifyOutgoingDamage / modifyIncomingDamage transform attack damage', () => {
    const OUT_3: StatusBehavior = { modifyOutgoingDamage(_ref, dmg) { return dmg + 3; } };
    const IN_MINUS_2: StatusBehavior = { modifyIncomingDamage(_ref, dmg) { return dmg - 2; } };
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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
    attacker.aiStrategy = AIStrategy.Aggro;
    const engine = new CombatEngine([target, guard], [attacker], { registry: REGISTRY });

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
    attacker.aiStrategy = AIStrategy.Aggro;
    const engine = new CombatEngine([target, guard], [attacker], { registry: REGISTRY });

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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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
        return { attackTotalMult: mult, damageMult: mult };
      },
      onRoundEnd(ctx) {
        if (ctx.entry.data?.['armedRound'] === ctx.engine.round) return;
        if (ctx.playedAction?.actionType !== ActionType.Atac) ctx.holder.clearStatus(ctx.key);
      },
    };
    const a = makeChar('A', 20, [atkDef(), focusDef()]);
    const b = sac(100);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });

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
        if (ctx.engine.rollD20() <= 10) {
          ctx.engine.applyPvLoss(attacker, 1, undefined);
          ctx.entry.value--;
          if (ctx.entry.value <= 0) ctx.holder.clearStatus(ctx.key);
        }
        return true; // one check per attack
      },
    };
    const a = makeChar('A', 200, [atkDef()]);
    const layer = sac(500);
    const engine = new CombatEngine([a], [layer], { registry: REGISTRY });
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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
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
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('crema-test', 2, 3, undefined, TICK_2);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    expect(a.currentPV).toBe(16); // 2 ticks × 2 PV
  });
});

describe('Metge de campanya (full path, zero engine edits)', () => {
  it("injecció d'adrenalina doubles the ally's attack and charges +4 fatigue", () => {
    const metge = buildCharacter({ name: 'Metge', pv: 20, skills: { metge: 20 } });
    const lluitador = makeChar('Lluitador', 20, [atkDef()]);
    const enemy = sac(50);
    const engine = new CombatEngine([metge, lluitador], [enemy], { registry: REGISTRY });

    const injIdx = metge.actions.findIndex(x => x.def.id === 'injeccio-adrenalina');
    runRound(engine, [
      { idx: 0, actionIdx: injIdx, targets: [{ team: 0, idx: 1 }] },
      { idx: 1, actionIdx: 0, targets: [{ team: 1, idx: 0 }] },
    ]);
    expect(enemy.currentPV).toBe(48); // double 1d1
    expect(lluitador.fatigue).toBe(5); // +4 injection, +1 own action
    expect(lluitador.hasStatus('adrenalina')).toBe(false);
  });

  it('cures de camp heals (d20 + skill − fatigue) ÷ 4 PV', () => {
    const metge = buildCharacter({ name: 'Metge', pv: 20, skills: { metge: 20 } });
    const ferit = makeChar('Ferit', 20, [focusDef()]);
    const enemy = sac(50);
    const engine = new CombatEngine([metge, ferit], [enemy], { registry: REGISTRY });
    ferit.currentPV = 5;

    const curesIdx = metge.actions.findIndex(x => x.def.id === 'cures-de-camp');
    runRound(engine, [
      { idx: 0, actionIdx: curesIdx, targets: [{ team: 0, idx: 1 }] },
      { idx: 1, actionIdx: 0 },
    ]);
    // (d20 + 20) / 4 → between (1+20)/4=5 and (20+20)/4=10 PV healed.
    expect(ferit.currentPV).toBeGreaterThanOrEqual(10);
    expect(ferit.currentPV).toBeLessThanOrEqual(15);
  });
});
