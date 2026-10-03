/**
 * HOW A ROUND FLOWS — speed order, simultaneity, interruption, learning, the
 * end of a fight — on hand-built positions with exact dice.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, DiceRoll, EffectRegistry, firstLegalChooser } from '../src/index.js';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, punchingBag } from '../src/testing.js';

const registry = () => new EffectRegistry();
const at = (team: number, idx: number) => ({ team, idx });

describe('speed', () => {
  it('the faster action resolves first — a kill before the slower blow lands', () => {
    const fast = fighter('Fast', [attackCard('stab', { speed: 5, rollBonus: 9 })], { pv: 10 });
    const slow = fighter('Slow', [attackCard('club', { speed: 1, rollBonus: 9 })], { pv: 10 });
    const engine = new CombatEngine([fast], [slow], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(slow.isAlive()).toBe(false);
    expect(fast.currentPV).toBe(10);
    expect(engine.winner()).toBe(0);
  });

  it('equal speed is simultaneous: both blows land, and a double kill is a draw', () => {
    const a = fighter('A', [attackCard('x', { speed: 3, rollBonus: 9 })], { pv: 10 });
    const b = fighter('B', [attackCard('y', { speed: 3, rollBonus: 9 })], { pv: 10 });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(a.isAlive()).toBe(false);
    expect(b.isAlive()).toBe(false);
    expect(engine.winner()).toBeNull();
    expect(engine.isOver()).toBe(true);
  });

  it('heavy armour costs speed, and speed decides who acts first', () => {
    const heavy = fighter('Heavy', [attackCard('x', { speed: 3, rollBonus: 9 })], { pv: 10, equipment: [armour(0, 1)] });
    const light = fighter('Light', [attackCard('y', { speed: 3, rollBonus: 9 })], { pv: 10 });
    const engine = new CombatEngine([heavy], [light], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(heavy.isAlive()).toBe(false);
    expect(light.currentPV).toBe(10);
  });
});

describe('focus', () => {
  it('is cancelled when its holder takes damage first', () => {
    const caster = fighter('C', [focusCard('charge', { speed: 0, effects: [{ type: 'mark' }] })], { pv: 20 });
    const striker = fighter('S', [attackCard('jab', { speed: 5 })], { pv: 20 });
    const r = registry();
    let resolved = 0;
    r.register('mark', { onResolve: () => { resolved++; } });
    const engine = new CombatEngine([caster], [striker], { registry: r, actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(caster.currentPV).toBe(19);
    expect(resolved).toBe(0);
  });

  it('survives a blow that armour absorbs completely', () => {
    const caster = fighter('C', [focusCard('charge', { speed: 0, effects: [{ type: 'mark' }] })], { pv: 20, equipment: [armour(3)] });
    const striker = fighter('S', [attackCard('jab', { speed: 5 })], { pv: 20 });
    const r = registry();
    let resolved = 0;
    r.register('mark', { onResolve: () => { resolved++; } });
    const engine = new CombatEngine([caster], [striker], { registry: r, actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(caster.currentPV).toBe(20);
    expect(resolved).toBe(1);
  });
});

describe('learning in a real contest', () => {
  it('a defender who loses by ≤2 learns; a winner never does; an undefended hit teaches no one', () => {
    // Attack 1d1+3 = 4 vs defense 1d1+1 = 2: the defender loses by 2 → learns.
    const d = fighter('D', [defenseCard('guard', { dice: new DiceRoll(1, 1), rollBonus: 1 })], { pv: 20 });
    const a = fighter('A', [attackCard('hit', { rollBonus: 3, speed: 1 })], { pv: 20 });
    const engine = new CombatEngine([d], [a], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(d.currentPV).toBe(18);
    expect(d.getSkillLevel('test')).toBe(1);
    expect(a.getSkillLevel('test')).toBe(0);

    // Undefended: no contest, no learning for anyone.
    const bag = fighter('Bag', [focusCard()], { pv: 20 });
    const b = fighter('B', [attackCard('hit', { rollBonus: 3 })], { pv: 20 });
    const e2 = new CombatEngine([bag], [b], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(e2, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] }]);
    expect(bag.getSkillLevel('test')).toBe(0);
    expect(b.getSkillLevel('test')).toBe(0);
  });

  it('a tie holds for the defense, and the attacker — who lost by 0 — learns', () => {
    const d = fighter('D', [defenseCard('guard', { dice: new DiceRoll(1, 1), rollBonus: 3 })], { pv: 20 });
    const a = fighter('A', [attackCard('hit', { rollBonus: 3 })], { pv: 20 });
    const engine = new CombatEngine([d], [a], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(d.currentPV).toBe(20);
    expect(a.getSkillLevel('test')).toBe(1);
    expect(d.getSkillLevel('test')).toBe(0);
  });
});

describe('area attacks', () => {
  it('ONE roll per pass: every target is struck by the same total', () => {
    // 3d6 at three undefended bags. Whatever the dice say, they say it once.
    for (let seed = 0; seed < 50; seed++) {
      const bags = [punchingBag(100), punchingBag(100), punchingBag(100)];
      const a = fighter('AoE', [attackCard('sweep', { dice: new DiceRoll(3, 6), targetCount: 3 })], { pv: 10 });
      const engine = new CombatEngine([a], bags, { registry: registry(), actionChooser: firstLegalChooser });
      playRound(engine, [{ team: 0, idx: 0, actionIdx: 0 }]);
      const lost = bags.map(b => 100 - b.currentPV);
      expect(new Set(lost).size).toBe(1);
      expect(lost[0]).toBeGreaterThanOrEqual(3);
    }
  });

  it('rollPerTarget rolls fresh dice for each target instead', () => {
    let differed = false;
    for (let seed = 0; seed < 50 && !differed; seed++) {
      const bags = [punchingBag(100), punchingBag(100), punchingBag(100)];
      const a = fighter('Frag', [attackCard('frag', { dice: new DiceRoll(3, 6), targetCount: 3, rollPerTarget: true })]);
      const engine = new CombatEngine([a], bags, { registry: registry(), actionChooser: firstLegalChooser });
      playRound(engine, [{ team: 0, idx: 0, actionIdx: 0 }]);
      differed = new Set(bags.map(b => b.currentPV)).size > 1;
    }
    expect(differed).toBe(true);
  });
});

describe('the end of a fight', () => {
  it('a fight nobody can win ends as a draw at the round cap', () => {
    const a = fighter('A', [focusCard()], { pv: 10, ai: true });
    const b = fighter('B', [focusCard()], { pv: 10, ai: true });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser, maxRounds: 7 });
    expect(engine.runCombat()).toEqual({ winner: null, rounds: 7 });
  });

  it('the side left standing wins', () => {
    const a = fighter('A', [attackCard('k', { rollBonus: 20 })], { pv: 10, ai: true });
    const b = fighter('B', [focusCard()], { pv: 10, ai: true });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
    expect(engine.runCombat()).toEqual({ winner: 0, rounds: 1 });
  });

  it('a stunned character loses exactly the turns they were told to', () => {
    const a = fighter('A', [attackCard('k')], { pv: 10, ai: true });
    const bag = punchingBag(100);
    const engine = new CombatEngine([a], [bag], { registry: registry(), actionChooser: firstLegalChooser });
    a.skipTurns = 2;
    playRound(engine, []);
    playRound(engine, []);
    expect(bag.currentPV).toBe(100);
    playRound(engine, []);
    expect(bag.currentPV).toBe(99);
  });
});
