import { describe, it, expect } from 'vitest';
import {
  ActionDefinition, ActionType, AIStrategy, Character, CombatEngine,
  createCharacter, DiceRoll,
} from '@pimpampum/engine';
import { buildCharacter } from '@pimpampum/skills';
import { REGISTRY } from './helpers.js';

/**
 * Deterministic tests for the engine's generic status seams (data fields +
 * StatusBehavior hooks). Unguarded attacks auto-hit with no d20 and 1d1 dice
 * always roll 1, so exact-PV assertions are possible.
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

describe('generic status data fields', () => {
  it('pvFloor: PV cannot drop below the floor', () => {
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac();
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('ultim-ale', 1, -1, { pvFloor: 1 });
    engine.applyPvLoss(a, 999);
    expect(a.currentPV).toBe(1);
    expect(a.isAlive()).toBe(true);
  });

  it('speedMod: added to effective action speed', () => {
    const a = makeChar('A', 20, [atkDef()]);
    expect(a.getEffectiveSpeed(a.actions[0])).toBe(1);
    a.setStatus('llast', 1, -1, { speedMod: -3 });
    expect(a.getEffectiveSpeed(a.actions[0])).toBe(-2);
  });

  it('outgoingDamage / incomingDamage adjust attack damage', () => {
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('verí-a-la-fulla', 1, -1, { outgoingDamage: 3 });
    b.setStatus('pell-de-pedra', 1, -1, { incomingDamage: -2 });
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // 1 (1d1) + 3 − 2 = 2
    expect(b.currentPV).toBe(48);
  });

  it('woundBonus: one-shot, consumed on the first wound', () => {
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    b.setStatus('marca', -1, -1, { woundBonus: 5 });
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // 1 + 5
    expect(b.currentPV).toBe(44);
    expect(b.hasStatus('marca')).toBe(false);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // just 1
    expect(b.currentPV).toBe(43);
  });

  it('noGuard: an otherwise-unbeatable guard is bypassed entirely', () => {
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

    // noGuard: the guard is ignored, the blow auto-hits the target.
    target.setStatus('exposat', 1, -1, { noGuard: true });
    const before = target.currentPV;
    runRound(engine, [
      { idx: 0, actionIdx: 0 },
      { idx: 1, actionIdx: 0, targets: [{ team: 0, idx: 0 }] },
    ]);
    expect(target.currentPV).toBe(before - 1);
  });

  it('guardAbsorb: the guard takes the full blow with no contest', () => {
    const target = makeChar('Target', 20, [focusDef()]);
    const guard = makeChar('Guard', 20, [defenseDef()]);
    const attacker = makeChar('Attacker', 20, [atkDef()]);
    attacker.aiStrategy = AIStrategy.Aggro;
    const engine = new CombatEngine([target, guard], [attacker], { registry: REGISTRY });

    // Refresh the absorb stance each round like a defense action would.
    engine.prepareRound();
    guard.setStatus('aguanta', 1, 1, { guardAbsorb: true });
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

  it('cardSwap: flowSwap spends charges and clears at zero', () => {
    const a = makeChar('A', 20, [atkDef('primera'), atkDef('segona')]);
    const b = sac();
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('flux-test', 2, -1, { cardSwap: true });

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

describe('status behaviours', () => {
  it('cadena: doubles per attacking round (×2, ×4) and breaks on a non-attack round', () => {
    const a = makeChar('A', 20, [atkDef(), focusDef()]);
    const b = sac(100);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });

    engine.prepareRound();
    a.setStatus('cadena', 1, -1, { armedRound: engine.round });
    engine.planActions([{ team: 0, idx: 0, actionIdx: 1 }]); // arming round: focus
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') r = engine.resolveNextAction();
    engine.finishRound();
    expect(a.hasStatus('cadena')).toBe(true); // arming round is exempt from the break

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // ×2 → 2 damage
    expect(b.currentPV).toBe(98);
    expect(a.getStatusValue('cadena', 0)).toBe(2);

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // ×4 → 4 damage
    expect(b.currentPV).toBe(94);
    expect(a.getStatusValue('cadena', 0)).toBe(4);

    runRound(engine, [{ idx: 0, actionIdx: 1 }]); // focus → chain breaks
    expect(a.hasStatus('cadena')).toBe(false);
  });

  it('camp-minat: each mine tripped costs the attacker exactly its blast', () => {
    const a = makeChar('A', 200, [atkDef()]);
    const layer = sac(500);
    const engine = new CombatEngine([a], [layer], { registry: REGISTRY });
    layer.setStatus('camp-minat', 3, -1, { damage: new DiceRoll(1, 1) });

    for (let i = 0; i < 60 && layer.hasStatus('camp-minat'); i++) {
      runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    }
    const minesLeft = layer.getStatusValue('camp-minat', 0);
    expect(200 - a.currentPV).toBe(3 - minesLeft); // 1 PV per tripped 1d1 mine
  });

  it('adrenalina: the attack executes twice, then the status is consumed', () => {
    const a = makeChar('A', 20, [atkDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('adrenalina', 1, 1);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]);
    expect(b.currentPV).toBe(48); // two 1d1 swings
    expect(a.hasStatus('adrenalina')).toBe(false);

    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // back to a single swing
    expect(b.currentPV).toBe(47);
  });

  it('adrenalina: expires at end of round if the holder did not attack', () => {
    const a = makeChar('A', 20, [atkDef(), focusDef()]);
    const b = sac(50);
    const engine = new CombatEngine([a], [b], { registry: REGISTRY });
    a.setStatus('adrenalina', 1, 1);
    runRound(engine, [{ idx: 0, actionIdx: 1 }]); // focus — the surge fizzles
    expect(a.hasStatus('adrenalina')).toBe(false);
    runRound(engine, [{ idx: 0, actionIdx: 0 }]); // single swing only
    expect(b.currentPV).toBe(49);
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
