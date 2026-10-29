/**
 * THE EQUILIBRIUM PLAYER — a PROTOTYPE (2026-10-28, AI-EQUILIBRIUM-PLAN.md, L2).
 *
 * The referee solves a round exactly; this plays a live round with the same
 * machinery and the shortcuts the exact layer graded cheapest for their gap
 * (`tools/src/ai-shortcut-gap.ts`): a double oracle over joint plans, one
 * round deep, the board then scored by random playouts to the fight's end,
 * in-round decisions greedy against a random rest of the round. No weights,
 * no opinion of good play: what the cards do, played out.
 *
 * Each side's cards are drawn from its equilibrium mix — a mix is the point:
 * a side that always guards its focuser can be read. One solve per round
 * serves both sides when both are AI.
 *
 * NOT YET FOR REAL FIGHTS: a real hand makes hundreds of joint plans a side,
 * far past what this costs per round today. It is graded on the audit's
 * small positions, against the exact referee and against today's AI.
 */
import { Character, availableActionIndices, random, seededRng, withRng, type CombatEngine, type ActionDefinition, type TargetRequirement } from '@pimpampum/engine';
import { BudgetExceeded, Referee, Unsupported, type RefereeOptions } from './audit/referee.js';
import { aiPolicy, type Policy } from './index.js';

export const DEFAULT_EQUILIBRIUM: Partial<RefereeOptions> = {
  strategies: 'oracle', horizon: 1, leaf: 'playout', playouts: 8, decisions: 'greedy',
  epsilon: 0.5, samples: [4], decisionSamples: [4], budget: 20_000_000,
};

/**
 * The settings that make a real round affordable (a few seconds for four
 * heroes against five goblins): one combination added at a time per seat, at
 * most four a side, a looser stop, fewer samples, in-round decisions weighed
 * on the round's own margin. Each is graded against the exact referee
 * (`tools/src/ai-shortcut-gap.ts`).
 */
export const FAST_EQUILIBRIUM: Partial<RefereeOptions> = {
  ...DEFAULT_EQUILIBRIUM, bestResponse: 'seat', pool: 4, epsilon: 2, samples: [2], decisionSamples: [2],
  decisionLeaf: 'margin', playouts: 4,
};

/**
 * A MIDDLE ROAD, from the night of 2026-10-29 (NEXT-STEPS §58): of the fast
 * shortcuts, keep only those whose cost the careful solve could not tell
 * from noise (one seat at a time, decisions on the round's margin), drop the
 * pool cap (the costliest), and take the leaf the exact referee found least
 * biased over long horizons — greedy playouts cut at two rounds — with
 * enough samples to quiet it. `samples`/`playouts` are what trades noise
 * for time.
 */
export const MEDIUM_EQUILIBRIUM: Partial<RefereeOptions> = {
  ...DEFAULT_EQUILIBRIUM, bestResponse: 'seat', decisions: 'greedy', decisionLeaf: 'margin', decisionSamples: [2],
  epsilon: 0.5, leaf: 'playout', playoutPolicy: 'greedy', playoutRounds: 2, playouts: 4, samples: [4],
};

export interface EquilibriumPolicy extends Policy {
  /** Rounds solved, and rounds handed to today's AI because the referee could
   *  not represent them (a card it does not support) or ran out of budget. */
  stats: { solved: number; fallback: number };
}

export function equilibriumPolicy(opts: Partial<RefereeOptions> = {}, targetSamples = 4): EquilibriumPolicy {
  const options = { ...DEFAULT_EQUILIBRIUM, ...opts };
  const fallback = aiPolicy({ depth: 1 });
  const stats = { solved: 0, fallback: 0 };
  let plan: { engine: CombatEngine; round: number; picks: Map<Character, number> | null } | null = null;
  /** The solve's leaf, for live decisions (a fresh referee: its memo is per board). */
  const leafReferee = (): Referee => new Referee({ ...options, seed: Math.floor(random() * 1e9) });

  const solveRound = (engine: CombatEngine): Map<Character, number> | null => {
    try {
      const root = new Referee({ ...options, seed: Math.floor(random() * 1e9) }).solve(engine, 0);
      const picks = new Map<Character, number>();
      const draw = (joints: typeof root.rows, mix: number[], team: number) => {
        let x = random();
        let k = mix.findIndex(p => (x -= p) <= 0);
        if (k < 0) k = mix.length - 1;
        for (const o of joints[k]) picks.set(engine.teams[team][o.idx], o.actionIdx);
      };
      draw(root.rows, root.sol.row, 0);
      draw(root.cols, root.sol.col, 1);
      stats.solved++;
      return picks;
    } catch (e) {
      if (e instanceof Unsupported || e instanceof BudgetExceeded) { stats.fallback++; return null; }
      throw e;
    }
  };

  return {
    stats,
    actionChooser(engine, actor) {
      if (!plan || plan.engine !== engine || plan.round !== engine.round) {
        plan = { engine, round: engine.round, picks: solveRound(engine) };
      }
      const pick = plan.picks?.get(actor);
      return pick !== undefined && pick >= 0 ? pick : fallback.actionChooser(engine, actor);
    },
    targetChooser: (engine, actor, def, req, count, pool) => playoutTargets(engine as CombatEngine, actor, def, req, count, pool, targetSamples, leafReferee()),
    optionChooser: (engine, actor, _def, opts) => playoutOption(engine as CombatEngine, actor, opts.length, targetSamples, leafReferee()),
  };
}

/** A card's reveal option, weighed as `playoutTargets` weighs an aim: each
 *  option played through the rest of the round at random, the fight then
 *  finished by random playouts. */
function playoutOption(engine: CombatEngine, actor: Character, count: number, samples: number, leaf: Referee): number {
  if (count <= 1) return 0;
  const pairSeed = Math.floor(random() * 1e9);
  let best = 0, top = -Infinity;
  for (let option = 0; option < count; option++) {
    let total = 0;
    for (let s = 0; s < samples; s++) {
      total += withRng(seededRng(pairSeed + s * 7919), () => {
        const sim = engine.clone();
        let first = true;
        sim.actionChooser = randomCard;
        sim.targetChooser = randomTargets;
        // The option being weighed for the card the engine is asking about —
        // the first question the clone hears — and random ones after.
        sim.optionChooser = (_e, _a, _d, options) => (first ? (first = false, option) : Math.floor(random() * options.length));
        return finishAndScore(sim, actor.team, leaf);
      });
    }
    if (total / samples > top) { top = total / samples; best = option; }
  }
  return best;
}

/** Play the round out, then read it by the solve's own leaf, `team`'s view. */
function finishAndScore(sim: CombatEngine, team: number, leaf: Referee): number {
  let step = sim.resolveNextAction();
  for (let guard = 0; step.kind !== 'done' && guard < 400; guard++) {
    if (step.kind === 'target') sim.setResolveTarget([]);
    else if (step.kind === 'choice') sim.setResolveChoice();
    step = sim.resolveNextAction();
  }
  sim.finishRound();
  const v = leaf.leafValue(sim);
  return team === 0 ? v : -v;
}

/** A uniformly random legal card, from the engine's stream. */
const randomCard = (e: CombatEngine, a: Character): number | null => {
  const legal = availableActionIndices(a, e.registry);
  return legal.length ? legal[Math.floor(random() * legal.length)] : null;
};
const randomTargets = (_e: unknown, _a: unknown, _d: unknown, _r: unknown, count: number, pool: Character[]): Character[] => {
  const left = [...pool];
  const out: Character[] = [];
  while (out.length < count && left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]);
  return out;
};

/**
 * An in-round decision taken the way the solve assumed: each answer played
 * through the rest of the round with every later decision at random, the
 * board then read by the SOLVE'S OWN LEAF (`Referee.leafValue`); the answer
 * that does best, on the same draws for every answer. A multi-target choice
 * weighs each set of targets, while there are few.
 *
 * It used to finish every answer with random playouts to the fight's end
 * whatever leaf the solve used — the leaf real fights showed to misjudge them
 * (NEXT-STEPS §57) — so every live guard and aim was weighed on it.
 */
function playoutTargets(
  engine: CombatEngine, actor: Character, _def: ActionDefinition, _req: TargetRequirement,
  count: number, pool: Character[], samples: number, leaf: Referee,
): Character[] {
  const sets = subsets(pool, count);
  if (sets.length <= 1) return sets[0] ?? [];
  if (sets.length > 12) return randomTargets(null, null, null, null, count, pool);
  const pairSeed = Math.floor(random() * 1e9);
  const value = (set: Character[]): number => {
    const refs = set.map(c => ({ team: c.team, idx: engine.teams[c.team].indexOf(c) }));
    let total = 0;
    for (let s = 0; s < samples; s++) {
      total += withRng(seededRng(pairSeed + s * 7919), () => {
        const sim = engine.clone();
        sim.actionChooser = randomCard;
        sim.targetChooser = randomTargets;
        sim.optionChooser = (_e, _a, _d, options) => Math.floor(random() * options.length);
        sim.setResolveTarget(refs);
        return finishAndScore(sim, actor.team, leaf);
      });
    }
    return total / samples;
  };
  let best = sets[0], top = -Infinity;
  for (const set of sets) {
    const v = value(set);
    if (v > top) { top = v; best = set; }
  }
  return best;
}

function subsets(pool: Character[], count: number): Character[][] {
  const out: Character[][] = [];
  const walk = (from: number, acc: Character[]): void => {
    if (acc.length === count) { out.push(acc); return; }
    for (let i = from; i <= pool.length - (count - acc.length); i++) walk(i + 1, [...acc, pool[i]]);
  };
  walk(0, []);
  return out;
}
