/**
 * PLANS — what a side of two plays in a round, by card type, whoever plays
 * which: the unit the round table (`round-table.ts`) and the strategy pool
 * (`pool.ts`) reason in. The triangle is a claim about plans (the user,
 * 2026-11-15): "if the enemy played an attack, you wished you played a
 * defense, if the enemy played a defense, you wished to have played a focus,
 * if the enemy plays a focus, you wished you had attack".
 *
 * A plan names types, never cards: WHICH card of the type, and which hero
 * plays which type, is the production search's choice, restricted seat by
 * seat (`LookaheadOptions.restrictTo`). A summoned body past the two heroes
 * plays as it would anyway.
 */
import { ActionType, random, withSeed, type Character, type CombatEngine } from '@pimpampum/engine';
import { bestResponse, DEFAULT_LOOKAHEAD } from '@pimpampum/ai';
import type { Chooser } from './policies.js';

/** A card type, by its letter: Attack, Defense, Focus. */
export type Kind = 'A' | 'D' | 'F';
const TYPE_OF: Record<Kind, ActionType> = { A: ActionType.Atac, D: ActionType.Defensa, F: ActionType.Focus };
const kindOf = (t: ActionType): Kind => (t === ActionType.Atac ? 'A' : t === ActionType.Defensa ? 'D' : 'F');

export const PLANS = ['AA', 'AD', 'AF', 'DD', 'DF', 'FF'] as const;
export type Plan = typeof PLANS[number];

/** The plan two types make (one type: a side down to one hero plays it as the doubled plan). */
export function planOf(kinds: readonly Kind[]): Plan | null {
  if (!kinds.length) return null;
  const [a, b] = [kinds[0], kinds[1] ?? kinds[0]].sort();
  return `${a}${b}` as Plan;
}

/** The triangle's answer to a type: a defense into an attack, a Focus into a defense, an attack into a Focus. */
export const COUNTER: Readonly<Record<Kind, Kind>> = { A: 'D', D: 'F', F: 'A' };

/** The triangle's answer to a plan: each of its types answered. */
export function counterPlan(plan: Plan): Plan {
  return planOf([COUNTER[plan[0] as Kind], COUNTER[plan[1] as Kind]])!;
}

/** The heroes a plan speaks for: a side's first two seats. */
const HEROES = 2;

/** The plan `team` revealed this round (null: no hero played a card). Read
 *  between `planActions` and `finishRound`. */
export function planPlayed(engine: CombatEngine, team: number): Plan | null {
  const kinds = engine.plannedThisRound()
    .filter(p => p.actor.team === team && engine.teams[team].indexOf(p.actor) < HEROES)
    .map(p => kindOf(p.action.actionType));
  return planOf(kinds);
}

/**
 * The cards `team` plays for `plan` in the round just prepared: each hero held
 * to one of the plan's types, the assignment the search values more (on the
 * same rollouts, so the two are compared like with like). A side down to one
 * hero plays whichever of the plan's types the search values more.
 */
export function planChoices(engine: CombatEngine, team: number, plan: Plan): Map<Character, number> {
  const seats = engine.teams[team].slice(0, HEROES).map((c, i) => ({ c, i })).filter(s => s.c.isAlive() && !engine.isSkippingRound(s.c));
  const [x, y] = [plan[0] as Kind, plan[1] as Kind];
  const assignments: Kind[][] = !seats.length ? [] : seats.length === 1 ? (x === y ? [[x]] : [[x], [y]]) : (x === y ? [[x, y]] : [[x, y], [y, x]]);
  if (!assignments.length) return bestResponse(engine, team, DEFAULT_LOOKAHEAD).choices;
  const seed = Math.floor(random() * 1e9);
  let best: { choices: Map<Character, number>; value: number } | null = null;
  for (const kinds of assignments) {
    const bySeat = new Map(seats.map((s, k) => [s.i, [TYPE_OF[kinds[k]]]]));
    const answer = withSeed(seed, () => bestResponse(engine, team, {
      ...DEFAULT_LOOKAHEAD, restrictTo: (en, actor) => bySeat.get(en.teams[actor.team].indexOf(actor)),
    }));
    if (!best || answer.value > best.value) best = answer;
  }
  return best!.choices;
}

/** A side that plays the plan `planFor` names each round, as an action chooser. */
export function planChooser(planFor: (engine: CombatEngine, team: number) => Plan): Chooser {
  let cache: { engine: CombatEngine; round: number; team: number; choices: Map<Character, number> } | null = null;
  return (engine, actor) => {
    if (!cache || cache.engine !== engine || cache.round !== engine.round || cache.team !== actor.team) {
      cache = { engine, round: engine.round, team: actor.team, choices: planChoices(engine, actor.team, planFor(engine, actor.team)) };
    }
    return cache.choices.get(actor) ?? null;
  };
}
