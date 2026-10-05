/**
 * FANTASY CARDS, PLAYED EXACTLY — the set's handlers on hand-built one-round
 * positions with scripted choices and `1d1` dice, so each assertion is an exact
 * PV rather than a rate. Where the engine's own seam tests check that a hook is
 * CALLED, these check that this set's cards USE it the way their descriptions
 * say (an action's description wins over its handler — CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, ActionType, CombatEngine, DiceRoll, firstLegalChooser } from '@pimpampum/engine';
import {
  attackCard, defenseCard, fighter, focusCard, playRound, punchingBag, type Selection,
} from '@pimpampum/engine/testing';
import { buildCharacter, createRegistry } from '../src/index.js';

const registry = createRegistry();
const atkDef = attackCard;
const defenseDef = defenseCard;
const focusDef = focusCard;
const makeChar = (name: string, pv: number, actions: ActionDefinition[]) => fighter(name, actions, { pv });
const sac = punchingBag;
/** A round where team-0 humans play the given selections. */
const runRound = (engine: CombatEngine, selections: Omit<Selection, 'team'>[]) =>
  playRound(engine, selections.map(s => ({ team: 0, ...s })));
const theRegistry = () => registry;

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


describe('Berserk: Entrar en Fúria', () => {
  it('protects for the two whole rounds after it resolves, not one', () => {
    // "Durant 2 torns res et pot fer baixar PV": cast late in round 1, the
    // rage must hold through rounds 2 and 3. A status's countdown ticks at the
    // end of the round it was set in, so set to 2 it held for round 2 only,
    // while the card's +5 (a modifier that skips its first tick) ran on.
    const berserker = buildCharacter({ name: 'Berserker', pv: 12, skills: { berserk: 4 }, equipment: ['destral'] });
    // Slower than the rage, which a blow landing first would interrupt.
    const foe = fighter('Foe', [atkDef('hit', { dice: new DiceRoll(1, 1), rollBonus: 5, speed: -5 })], { pv: 500, ai: true });
    const engine = new CombatEngine([berserker], [foe], { registry: theRegistry(), actionChooser: firstLegalChooser });
    const rage = berserker.actions.findIndex(a => a.def.id === 'entrar-en-furia');
    const swing = berserker.actions.findIndex(a => a.def.id === 'atac-temerari');
    const strike = [{ idx: 0, actionIdx: swing, targets: [{ team: 1, idx: 0 }] }];

    runRound(engine, [{ idx: 0, actionIdx: rage }]);
    expect(berserker.currentPV).toBe(1);
    runRound(engine, strike);
    runRound(engine, strike);
    expect(berserker.currentPV, 'untouchable through rounds 2 and 3').toBe(1);
    runRound(engine, strike);
    expect(berserker.isAlive(), 'the rage is over in round 4').toBe(false);
  });
});

describe('Berserk: Aguantar el cop', () => {
  it('takes the blow in full and turns it, doubled, into attack for the next turn only', () => {
    // Banked for the rest of combat, a berserker blocking round after round
    // stacked the bonus without limit and hit for 45 (NEXT-STEPS §32).
    const berserker = buildCharacter({ name: 'Berserker', pv: 30, skills: { berserk: 3 }, equipment: ['destral'] });
    // Slower than the brace, so the blow lands on a braced body, in full: 8.
    const foe = fighter('Foe', [atkDef('hit', { dice: new DiceRoll(1, 1), rollBonus: 7, speed: -5 })], { pv: 500, ai: true });
    const engine = new CombatEngine([berserker], [foe], { registry: theRegistry(), actionChooser: firstLegalChooser });
    const brace = berserker.actions.findIndex(a => a.def.id === 'aguantar-el-cop');
    const swing = berserker.actions.findIndex(a => a.def.id === 'atac-temerari');

    runRound(engine, [{ idx: 0, actionIdx: brace, targets: [{ team: 0, idx: 0 }] }]);
    expect(berserker.currentPV).toBe(22);
    expect(berserker.getRollBonus('berserk', 'attack'), 'twice the 8 taken, ready for round 2').toBe(16);
    runRound(engine, [{ idx: 0, actionIdx: swing, targets: [{ team: 1, idx: 0 }] }]);
    expect(berserker.getRollBonus('berserk', 'attack'), 'gone after round 2').toBe(0);
  });
});

describe('Berserk: Aguantar el cop holds the line', () => {
  it('a braced berserker cannot be felled this turn, however hard the blow', () => {
    const berserker = buildCharacter({ name: 'Berserker', pv: 12, skills: { berserk: 3 }, equipment: ['destral'] });
    const foe = fighter('Foe', [atkDef('hit', { dice: new DiceRoll(1, 1), rollBonus: 49, speed: -5 })], { pv: 500, ai: true });
    const engine = new CombatEngine([berserker], [foe], { registry: theRegistry(), actionChooser: firstLegalChooser });
    const brace = berserker.actions.findIndex(a => a.def.id === 'aguantar-el-cop');
    runRound(engine, [{ idx: 0, actionIdx: brace, targets: [{ team: 0, idx: 0 }] }]);
    expect(berserker.isAlive(), 'a 50-point blow leaves him standing').toBe(true);
    expect(berserker.currentPV).toBe(1);
  });
});
