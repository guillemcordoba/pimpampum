/**
 * The heavy AI: lookahead search over card choices, evaluated by the learned
 * value model.
 *
 * Pim Pam Pum is a SIMULTANEOUS-move game with hidden choices — both sides
 * commit cards, then reveal — so there is no minimax tree to walk. What we do
 * instead:
 *
 *   for each of our characters, for each card it could play:
 *     clone the combat, plan that card (opponents' cards sampled from their
 *     own policy), resolve the whole round, and score the resulting position
 *     with the value model, averaged over several samples of dice + enemy
 *     choices.
 *
 * Because a joint assignment over N characters is exponential, we optimise it
 * by ITERATED BEST RESPONSE: hold everyone else's tentative card fixed,
 * improve one character, repeat. Two passes is normally enough to stop moving,
 * and it captures exactly the combos we care about — the second character's
 * best answer is evaluated against the first one's defense already in place,
 * which is the only way a defense+focus pairing can ever score well.
 *
 * `depth` > 1 recurses: after resolving a round, run the same search for the
 * next round before scoring. Costs multiply, so it is for offline study.
 */
import {
  ActionType, Character, CombatEngine, EffectRegistry, random,
} from '@pimpampum/engine';
import { positionFeatures } from './features.js';
import { ValueModel } from './value.js';

export interface SearchOptions {
  /** Rollout samples per candidate card (dice + enemy choice noise). */
  samples?: number;
  /** Best-response passes over the team. */
  passes?: number;
  /** Rounds of lookahead. 1 = resolve this round then evaluate. */
  depth?: number;
  registry: EffectRegistry;
  model: ValueModel;
  /** Restrict the search to a subset of card types. Used to ask a fair
   *  question: is the ATTACK-ONLY strategy space worse, when both the
   *  restricted and unrestricted players are equally strong? */
  restrictTo?: ActionType[];
}

const DEFAULTS = { samples: 6, passes: 2, depth: 1 };

/** Action indices `actor` may legally play this round. */
export function legalActions(engine: CombatEngine, actor: Character, restrictTo?: ActionType[]): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < actor.actions.length; i++) {
    if (!engine.canPlayActionIdx(actor, i)) continue;
    if (restrictTo && !restrictTo.includes(actor.actions[i].def.actionType)
        && !actor.actions[i].def.lastResort) continue;
    idxs.push(i);
  }
  // A restriction that leaves nothing playable falls back to the full hand —
  // a character with no attack must still act.
  if (idxs.length === 0 && restrictTo) return legalActions(engine, actor);
  return idxs;
}

/** Terminal score, or null when the combat is still going. */
function terminalValue(engine: CombatEngine, team: number): number | null {
  if (!engine.isOver() && engine.round < engine.maxRounds) return null;
  const w = engine.winner();
  return w === null ? 0.5 : w === team ? 1 : 0;
}

/**
 * Play one round forward on `engine` (mutating it) with `choices` forced for
 * `team`, everyone else choosing by their own policy.
 */
function playRound(engine: CombatEngine, team: number, choices: Map<Character, number>): void {
  engine.prepareRound();
  const selections = [...choices.entries()]
    .map(([actor, actionIdx]) => {
      const idx = engine.teams[team].indexOf(actor);
      return idx < 0 || !actor.isAlive() ? null : { team, idx, actionIdx };
    })
    .filter((s): s is { team: number; idx: number; actionIdx: number } => s !== null);
  engine.planActions(selections);
  let step = engine.resolveNextAction();
  let guard = 0;
  while (step.kind !== 'done' && guard++ < 400) {
    // Search never prompts: any target request is filled by the engine's own
    // resolution-time heuristic by passing an empty list.
    if (step.kind === 'target') engine.setResolveTarget([]);
    step = engine.resolveNextAction();
  }
  engine.finishRound();
}

/**
 * Expected value of committing `choices` for `team`, averaged over `samples`
 * playouts of the round (fresh dice and fresh enemy decisions each time).
 */
function evaluate(
  engine: CombatEngine,
  team: number,
  choices: Map<Character, number>,
  opts: SearchOptions & { samples: number; passes: number; depth: number },
  depth: number,
): number {
  let total = 0;
  for (let s = 0; s < opts.samples; s++) {
    const sim = engine.clone();
    // The clone inherits the live chooser — which may be THIS search. Opponent
    // replies inside a rollout must come from the cheap built-in heuristic, or
    // the search recurses into itself forever.
    sim.actionChooser = undefined;
    // Re-key the choices onto the clone's characters (same positions).
    const mapped = new Map<Character, number>();
    for (const [actor, idx] of choices) {
      const pos = engine.teams[team].indexOf(actor);
      if (pos >= 0) mapped.set(sim.teams[team][pos], idx);
    }
    playRound(sim, team, mapped);

    const terminal = terminalValue(sim, team);
    if (terminal !== null) { total += terminal; continue; }
    if (depth > 1) {
      // Look further: play the next round with our best response too.
      const next = bestResponse(sim, team, { ...opts, depth: depth - 1 });
      playRound(sim, team, next.choices);
      const t2 = terminalValue(sim, team);
      total += t2 ?? opts.model.predict(positionFeatures(sim, team));
      continue;
    }
    total += opts.model.predict(positionFeatures(sim, team));
  }
  return total / Math.max(1, opts.samples);
}

export interface SearchResult {
  choices: Map<Character, number>;
  value: number;
}

/**
 * Iterated best response: improve one character at a time until the joint
 * assignment stops changing.
 */
export function bestResponse(
  engine: CombatEngine,
  team: number,
  options: SearchOptions,
): SearchResult {
  const opts = { ...DEFAULTS, ...options };
  const actors = engine.teams[team].filter(c => c.isAlive());
  const choices = new Map<Character, number>();
  // Seed with each actor's first legal card so evaluation always has a full
  // assignment to work with.
  for (const actor of actors) {
    const legal = legalActions(engine, actor, opts.restrictTo);
    if (legal.length > 0) choices.set(actor, legal[0]);
  }
  if (actors.length === 0) return { choices, value: 0.5 };

  let value = evaluate(engine, team, choices, opts, opts.depth);
  for (let pass = 0; pass < opts.passes; pass++) {
    let improved = false;
    for (const actor of actors) {
      const legal = legalActions(engine, actor, opts.restrictTo);
      if (legal.length <= 1) continue;
      const current = choices.get(actor);
      let bestIdx = current ?? legal[0];
      let bestVal = value;
      for (const idx of legal) {
        if (idx === current) continue;
        choices.set(actor, idx);
        const v = evaluate(engine, team, choices, opts, opts.depth);
        if (v > bestVal) { bestVal = v; bestIdx = idx; }
      }
      choices.set(actor, bestIdx);
      if (bestVal > value) { value = bestVal; improved = true; }
    }
    if (!improved) break;
  }
  return { choices, value };
}

/**
 * Wrap the search as an engine `actionChooser`. The search decides for a whole
 * team at once, so results are cached per (round, team) and handed out
 * character by character as the engine asks.
 */
export function searchChooser(options: SearchOptions, teams: number[] = [0, 1]) {
  let cache: { engine: CombatEngine; round: number; team: number; choices: Map<Character, number> } | null = null;
  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    if (!cache || cache.engine !== engine || cache.round !== engine.round || cache.team !== actor.team) {
      cache = {
        engine, round: engine.round, team: actor.team,
        choices: bestResponse(engine, actor.team, options).choices,
      };
    }
    return cache.choices.get(actor) ?? null;
  };
}

/** Uniform-random legal play, for baselining how much the search is worth. */
export function randomChooser(teams: number[] = [0, 1]) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    const legal = legalActions(engine, actor).filter(
      i => actor.actions[i].def.actionType !== undefined && !actor.actions[i].def.lastResort,
    );
    if (legal.length === 0) return null;
    return legal[Math.floor(random() * legal.length)];
  };
}

/** Attack-only play, the strategy we suspect dominates — an explicit baseline. */
export function attackOnlyChooser(teams: number[] = [0, 1]) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    const legal = legalActions(engine, actor);
    const attacks = legal.filter(i => actor.actions[i].def.actionType === ActionType.Atac
      && !actor.actions[i].def.lastResort);
    if (attacks.length === 0) return null;
    // Biggest dice available.
    let best = attacks[0], bestAvg = -1;
    for (const i of attacks) {
      const avg = (actor.actions[i].def.dice?.average() ?? 0) + (actor.actions[i].def.rollBonus ?? 0);
      if (avg > bestAvg) { bestAvg = avg; best = i; }
    }
    return best;
  };
}
