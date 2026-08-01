/**
 * The lean AI the balancer plays with.
 *
 * Difficulty is measured by simulating the real fight, so the quality of every
 * number the balancer produces is the quality of this policy. It is a
 * distillation of the heavy lookahead AI (simulator `train-ai.ts` →
 * `distil-ai.ts`): one dot product over generic action features plus a learned
 * per-card bias, which is cheap enough to run inside thousands of combats.
 *
 * The per-card bias lives HERE rather than in the engine because it is keyed
 * by card id, and the engine is never allowed to know a card by name.
 */
import {
  ActionType, Character, CombatEngine, LearnedPolicy, policyContext, policyFeatures, random,
} from '@pimpampum/engine';
import { POLICY_WEIGHTS, CARD_BIAS } from './ai-policy-data.js';

const policy = new LearnedPolicy(POLICY_WEIGHTS);

export interface LeanPolicyOptions {
  /** Teams the policy drives. Default: both. */
  teams?: number[];
  /**
   * Softmax temperature. 0 = always the top-scoring card (brittle and
   * exploitable); higher = more varied. A little noise plays better than pure
   * greed and stops every combat of a matchup being identical.
   */
  temperature?: number;
}

/**
 * An `actionChooser` driven by the distilled policy. Returns null when the
 * policy has no opinion (untrained weights, no legal card), which makes the
 * engine fall back to its built-in heuristic.
 */
export function leanChooser(opts: LeanPolicyOptions = {}) {
  const teams = opts.teams ?? [0, 1];
  const temperature = opts.temperature ?? 0.35;
  if (!policy.isTrained) return () => null;

  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    const legal: number[] = [];
    for (let i = 0; i < actor.actions.length; i++) {
      if (engine.canPlayActionIdx(actor, i) && !actor.actions[i].def.lastResort) legal.push(i);
    }
    if (legal.length === 0) return null;
    if (legal.length === 1) return legal[0];

    const ctx = policyContext(actor, engine.teams[actor.team], engine.teams[1 - actor.team], {
      round: engine.round, maxRounds: engine.maxRounds,
    });
    const scores = legal.map(i => {
      const def = actor.actions[i].def;
      return policy.score(policyFeatures(def, actor.getEffectiveSpeed(actor.actions[i]), ctx))
        + (CARD_BIAS[def.id] ?? 0);
    });

    if (temperature <= 0) {
      let best = 0;
      for (let c = 1; c < scores.length; c++) if (scores[c] > scores[best]) best = c;
      return legal[best];
    }
    const probs = LearnedPolicy.softmax(scores, temperature);
    let roll = random();
    for (let c = 0; c < probs.length; c++) {
      roll -= probs[c];
      if (roll <= 0) return legal[c];
    }
    return legal[legal.length - 1];
  };
}

/** Whether trained weights are actually present (else the balancer falls back). */
export function isPolicyTrained(): boolean {
  return policy.isTrained;
}

/** Action type of a card id, for reporting tools. */
export const ACTION_TYPES = ActionType;
