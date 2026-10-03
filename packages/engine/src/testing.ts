/**
 * `@pimpampum/engine/testing` — builders for tests that need a fight but no
 * content.
 *
 * Every package's tests build the same things: a card with fixed dice, a
 * character holding it, a round played with scripted selections. Built once
 * here, content-free, so that no layer's tests have to borrow a real set just
 * to stand two fighters up — which is how the engine's seam tests came to
 * depend on the fantasy registry for nothing.
 *
 * CONVENTIONS THE FIXTURES RELY ON, so exact-PV assertions are possible:
 *  - skill level 0 and `unlockLevel: 0` by default: a roll is dice + the level
 *    in the card's skill, so any level would land on every assertion;
 *  - `1d1` dice by default, which always roll 1;
 *  - an undefended attack auto-hits for its full total.
 */
import { DiceRoll } from './dice.js';
import { ActionType, type ActionDefinition, type EquipmentDefinition, EquipmentSlot } from './types.js';
import { createCharacter, type Character } from './character.js';
import type { CombatEngine, TargetRef } from './combat.js';
import { availableActionIndices } from './policy.js';
import { random } from './rng.js';
import type { EffectRegistry } from './effects.js';

export const TEST_SKILL = 'test';

function card(id: string, actionType: ActionType, over: Partial<ActionDefinition>): ActionDefinition {
  return {
    id, name: id, skillId: TEST_SKILL, unlockLevel: 0, actionType,
    speed: 1, effects: [], description: '', iconPath: '',
    ...over,
  };
}

/** An attack, `1d1` at speed 1 unless told otherwise. */
export function attackCard(id = 'hit', over: Partial<ActionDefinition> = {}): ActionDefinition {
  return card(id, ActionType.Atac, { dice: new DiceRoll(1, 1), ...over });
}

/** A defense, speed 5 and effectively unbeatable unless told otherwise. */
export function defenseCard(id = 'block', over: Partial<ActionDefinition> = {}): ActionDefinition {
  return card(id, ActionType.Defensa, { speed: 5, rollBonus: 1000, ...over });
}

/** A focus with no dice and no effect — playing it does nothing. */
export function focusCard(id = 'wait', over: Partial<ActionDefinition> = {}): ActionDefinition {
  return card(id, ActionType.Focus, { speed: 0, ...over });
}

/** Passive armour as an equipment item. */
export function armour(value: number, speedPenalty = 0): EquipmentDefinition {
  return {
    id: `armour-${value}`, name: `Armour ${value}`, slot: EquipmentSlot.Armor,
    passiveArmor: value, speedPenalty, rollBonuses: [], iconPath: '', description: '',
  };
}

export interface FighterOptions {
  pv?: number;
  /** Level in the test skill (default 0). */
  level?: number;
  equipment?: EquipmentDefinition[];
  fatigue?: number;
  ai?: boolean;
}

/** A character holding exactly `actions`, at level 0 in the test skill. */
export function fighter(name: string, actions: ActionDefinition[], opts: FighterOptions = {}): Character {
  const c = createCharacter({
    name, classCss: 'test', pv: opts.pv ?? 10, skills: { [TEST_SKILL]: opts.level ?? 0 },
    actions, equipment: opts.equipment,
  });
  if (opts.fatigue) c.setFatigue(opts.fatigue);
  c.aiControlled = opts.ai ?? false;
  return c;
}

/** A passive AI-driven punching bag that only waits. */
export function punchingBag(pv = 100): Character {
  return fighter('Sac', [focusCard()], { pv, ai: true });
}

export interface Selection {
  team: number;
  idx: number;
  actionIdx: number;
  targets?: TargetRef[];
}

/**
 * Play one round with scripted selections for any seat; unlisted AI seats ask
 * the engine's chooser. Throws on a target prompt, because a test that did not
 * say who it aims at is not testing what it thinks.
 */
export function playRound(engine: CombatEngine, selections: Selection[]): void {
  engine.prepareRound();
  engine.planActions(selections);
  let r = engine.resolveNextAction();
  while (r.kind !== 'done') {
    if (r.kind === 'target') throw new Error('unexpected target prompt in test');
    r = engine.resolveNextAction();
  }
  engine.finishRound();
}

/**
 * A uniformly random LEGAL action, drawn from the engine's own seeded stream.
 * Not a policy either — it exists so property tests can drive fights through
 * every legal path without an AI's preferences deciding which paths get run.
 */
export function randomLegalChooser(engine: { registry: EffectRegistry }, actor: Character): number | null {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[Math.floor(random() * legal.length)] : null;
}
