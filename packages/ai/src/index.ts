/**
 * `@pimpampum/ai` — the policy the engine plays with, and the only thing in
 * this repo that decides what a character does.
 *
 * THE ENGINE CONTAINS NO AI. It exposes a view (`AIView`), the legality rules
 * (`availableActionIndices`, `canPlayAction`) and two seams — `actionChooser`
 * and `targetChooser` — and takes its decisions from whatever is plugged in.
 * That split exists because the rules are the GAME and a policy is an
 * INSTRUMENT used to measure it: a fault in `resolution.ts` is a broken game,
 * a fault here is a broken measurement, and they are verified in completely
 * different ways. While the AI lived inside the engine the distinction could
 * not be stated, and neither half could be tested without the other.
 *
 * One AI, one knob:
 *
 *   aiPolicy()                 depth 0 — score each card where it stands
 *   aiPolicy({ depth: 1 })     plays the round out (production)
 *
 * Both return the pair of choosers an engine needs, so a caller wires the AI
 * in once and the engine never learns what it is.
 */
import type { CombatEngine, Character, ActionDefinition, TargetRequirement } from '@pimpampum/engine';
import { selectAction, pickResolveTargets } from './policy.js';
import { bestResponse, DEFAULT_LOOKAHEAD, type LookaheadOptions } from './lookahead.js';

export {
  selectAction, pickResolveTargets, expectedAttackTotal, estimateExpectedDamage,
} from './policy.js';
export {
  bestResponse, positionScore, lookaheadChooser, DEFAULT_LOOKAHEAD, DEFAULT_EVAL_WEIGHTS,
} from './lookahead.js';
export type { LookaheadOptions, EvaluatorWeights } from './lookahead.js';

/** Everything an engine needs to run itself. Hand it to `new CombatEngine`. */
export interface Policy {
  actionChooser: (engine: CombatEngine, actor: Character) => number | null;
  targetChooser: (
    engine: CombatEngine, actor: Character, def: ActionDefinition,
    req: TargetRequirement, count: number, pool: Character[], speed: number,
  ) => Character[];
}

/**
 * The AI, at a depth.
 *
 * `depth: 0` scores cards where they stand. `depth >= 1` plays the round out
 * (see `lookahead.ts`); it is solved ONCE PER TEAM PER ROUND and cached,
 * because best response is a joint decision over the whole team and asking per
 * character would throw away the coordination it exists for.
 */
export function aiPolicy(opts: Partial<LookaheadOptions> = {}): Policy {
  const full: LookaheadOptions = { ...DEFAULT_LOOKAHEAD, ...opts };
  const depth = opts.depth ?? 0;
  let plan: { engine: CombatEngine; round: number; team: number; choices: Map<Character, number> } | null = null;

  return {
    actionChooser(engine, actor) {
      if (depth < 1) return selectAction(engine, actor).actionIdx;
      if (!plan || plan.engine !== engine || plan.round !== engine.round || plan.team !== actor.team) {
        plan = {
          engine, round: engine.round, team: actor.team,
          choices: bestResponse(engine, actor.team, full).choices,
        };
      }
      const pick = plan.choices.get(actor);
      // A character the joint solve did not cover (added mid-round, say) still
      // has to act: fall back to the depth-0 opinion rather than to nothing.
      return pick ?? selectAction(engine, actor).actionIdx;
    },
    targetChooser: (engine, actor, def, req, count, pool, speed) =>
      pickResolveTargets(engine, actor, def, req, count, pool, speed),
  };
}
