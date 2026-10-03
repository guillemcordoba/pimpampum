/**
 * WHICH CARDS MAY BE PLAYED — a rule of the game, enforced by the engine for
 * every seat, human or policy (`policy.ts`). And the policy seam: the engine
 * takes decisions from an injected chooser and never invents one.
 */
import { describe, it, expect } from 'vitest';
import {
  availableActionIndices, CombatEngine, EffectRegistry, firstLegalChooser, type StatusBehavior,
  ActionType,
} from '../src/index.js';
import { attackCard, defenseCard, fighter, focusCard, playRound, punchingBag } from '../src/testing.js';

describe('availableActionIndices', () => {
  it('a card needs its skill at its unlock level', () => {
    const c = fighter('L', [attackCard('l0', { unlockLevel: 0 }), attackCard('l2', { unlockLevel: 2 })], { level: 1 });
    expect(availableActionIndices(c)).toEqual([0]);
    c.raiseSkill('test');
    expect(availableActionIndices(c)).toEqual([0, 1]);
  });

  it('a consumed consumable and a set-aside card are not playable', () => {
    const c = fighter('C', [attackCard('pot', { isConsumable: true }), attackCard('a'), attackCard('b')]);
    c.actions[0].consumed = true;
    c.setAsideActions.set(1, 2);
    expect(availableActionIndices(c)).toEqual([2]);
  });

  it('a last-resort card surfaces only when nothing else is legal', () => {
    const c = fighter('D', [attackCard('a'), attackCard('desperate', { lastResort: true })]);
    expect(availableActionIndices(c)).toEqual([0]);
    c.setAsideActions.set(0, -1);
    expect(availableActionIndices(c)).toEqual([1]);
  });

  it('a status can forbid a type, and an effect can gate its own card', () => {
    const registry = new EffectRegistry();
    registry.register('never', { canPlay: () => false });
    const c = fighter('G', [attackCard('a'), defenseCard('d'), focusCard('f', { effects: [{ type: 'never' }] })]);
    const NO_ATTACKS: StatusBehavior = { blocksActionType: (_ref, t) => t === ActionType.Atac };
    c.setStatus('silenced', 1, 1, undefined, NO_ATTACKS);
    expect(availableActionIndices(c, registry)).toEqual([1]);
  });
});

describe('the policy seam', () => {
  it('an AI seat with no chooser is an error, never a silent default policy', () => {
    const a = fighter('A', [attackCard()], { ai: true });
    const engine = new CombatEngine([a], [punchingBag()], { registry: new EffectRegistry() });
    engine.prepareRound();
    expect(() => engine.planActions([])).toThrow(/no actionChooser/);
  });

  it('a chooser answering with an illegal card gets the first legal one instead', () => {
    const a = fighter('A', [attackCard('locked', { unlockLevel: 5 }), attackCard('ok', { dice: undefined, rollBonus: 3 })], { ai: true });
    const bag = punchingBag(50);
    const engine = new CombatEngine([a], [bag], { registry: new EffectRegistry(), actionChooser: () => 0 });
    playRound(engine, []);
    expect(bag.currentPV).toBe(47);
  });

  it('a human seat plays exactly the card it selected', () => {
    const h = fighter('H', [attackCard('small'), attackCard('big', { rollBonus: 9 })]);
    const bag = punchingBag(50);
    const engine = new CombatEngine([h], [bag], { registry: new EffectRegistry(), actionChooser: firstLegalChooser });
    playRound(engine, [{ team: 0, idx: 0, actionIdx: 1, targets: [{ team: 1, idx: 0 }] }]);
    expect(bag.currentPV).toBe(40);
  });
});
