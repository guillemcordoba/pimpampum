/**
 * LOOKAHEAD — the depth knob on the one AI.
 *
 * `ai.ts` scores CARDS: how good does this action look right now. That is
 * depth 0, and it is all the AI did for a long time. It cannot see the one
 * thing this game is actually about, because a card's worth depends on what
 * everyone ELSE commits the same round: guarding the ally who is walking into
 * a slow focus is either the play of the round or a wasted turn, and nothing
 * about the card itself says which.
 *
 * Depth ≥ 1 answers that by playing it out. For each candidate card: clone the
 * combat, commit the card, let everyone else choose at DEPTH 0, resolve the
 * whole round, and score the position it leaves behind — averaged over a few
 * samples, since dice and the opponents' choices both vary. Because a joint
 * choice over N characters is exponential, the team is optimised by ITERATED
 * BEST RESPONSE: hold everyone else's tentative card, improve one character,
 * repeat. That is what lets a defense be evaluated with the focus it protects
 * already on the table.
 *
 * Measured cost (2026-08-08, 4v7 reference fight): depth 0 ≈ 4.4 ms/combat,
 * depth 1 at 2 samples/1 pass ≈ 37 ms, depth 2 ≈ 19 s. Depth 1 is the working
 * setting; depth ≥ 2 is for offline study only.
 *
 * There is NO learned model anywhere in here: the leaf evaluator below is
 * hand-written and its weights are readable, so the AI can never go stale when
 * content changes — which is exactly what an instrument used to price
 * encounters needs.
 */
import {
  Character, CombatEngine, ActionType, FATIGUE_MAX_LEVEL, random, withSeed,
} from '@pimpampum/engine';
import { selectAction } from './policy.js';

/** How hard the lookahead thinks. Depth 0 never reaches this module. */
export interface LookaheadOptions {
  /** Rounds played forward before scoring. 1 = resolve this round, then score. */
  depth: number;
  /** Rollouts per candidate card — dice and opponent choices vary per sample. */
  samples: number;
  /** Iterated best-response passes over the team. */
  passes: number;
  /** Only look ahead on the best K candidates by depth-0 score (0 = all). Most
   *  cards in a hand are obviously wrong, and rolling them out costs the same
   *  as rolling out the plausible ones. */
  topK: number;
  /** Restrict the AI to these card types. This is how "is attack-spam actually
   *  optimal?" gets asked FAIRLY: both sides think equally hard, one of them
   *  merely has a smaller strategy space. A restriction that leaves nothing
   *  legal falls back to the full hand — a character with no attack must still
   *  act. */
  restrictTo?: ActionType[];
  /** Leaf evaluator weights. Omit for `DEFAULT_EVAL_WEIGHTS`; set only to
   *  A/B the evaluator against itself (see `EvaluatorWeights`). */
  weights?: EvaluatorWeights;
  /**
   * How greedily the OPPONENTS play inside a rollout (their `aiSharpness`).
   * Omit to leave the clone as it is.
   *
   * A rollout is not a prediction of one enemy move, it is an integral over the
   * moves they might make — the searching side has not seen their card. A
   * greedy model collapses that integral onto one line; a soft one covers more
   * of the hand. Which is better is an empirical question, and the reason it is
   * worth asking is §20.8: making the opponent model play BETTER made the
   * search measurably worse, so what it owes the search is accuracy, not
   * quality.
   */
  rolloutSharpness?: number;
  /**
   * Stop sampling a candidate once its OWN rollouts say it cannot beat the
   * incumbent (see `evaluate`'s `floor`). On by default.
   *
   * Set false to spend the full sample on every candidate, which is what an
   * A/B of the racing rule itself needs — and the only way to show that the
   * saving is free rather than paid for in decision quality.
   */
  race?: boolean;
}

/**
 * What `positionScore` is made of, as data rather than as four literals buried
 * in an expression.
 *
 * Exposed for ONE reason: these are the numbers the search actually maximises,
 * and the only honest way to ask whether one of them is wrong is to play the
 * two variants against each other. Budget is exhausted as a source of strength
 * (NEXT-STEPS §20.10) — an 8× and a 32× search are both level with production —
 * so anything left to gain is in the DESIGN, and the design starts here.
 *
 * They are not a tuning surface for content work. Changing one changes every
 * number this package produces, and §16.1 still applies: an evaluator weight
 * may be moved on evidence from the strength ladder, never to make a content
 * requirement go green.
 */
export interface EvaluatorWeights {
  /** Mean fraction of health left, us minus them. The headline term. */
  pv: number;
  /** Bodies still standing — action economy. A team down a member loses a card
   *  every round for the rest of the fight. */
  bodies: number;
  /** Fatigue differential: a cost paid in a currency that outlives the combat,
   *  so it is worth a little, not a lot. */
  fatigue: number;
  /** What each side's statuses say they are worth
   *  (`StatusBehavior.positionValue`). */
  status: number;
}

export const DEFAULT_EVAL_WEIGHTS: EvaluatorWeights = { pv: 10, bodies: 6, fatigue: 0.5, status: 10 };

/**
 * NO PRUNING (`topK: 0`), AND THAT IS THE SINGLE BIGGEST THING THE AI HAS EVER
 * GAINED.
 *
 * It used to be `topK: 3`, which on a six-card kit kept roughly half the hand
 * out of the search entirely — ranked out by SAMPLING `selectAction`, i.e. by
 * the depth-0 heuristic. That heuristic plays `Contraatac` on 0.6% of the turns
 * it is legal (the full search plays it ~50%), because it prices a defence at a
 * flat 1.5 beside an attack that scales with damage, and then squares the gap
 * through `aiSharpness`. Using a policy measured WORSE THAN UNIFORM RANDOM to
 * decide what the good policy is allowed to look at is not an optimisation; it
 * is a bottleneck, and it was excluding exactly the cards the search needed.
 *
 * Measured 2026-09-22, 300 mirror combats a cell, against `spam`:
 *
 *   s2 p1 k3   53.0%±2.9   0.0% draws   3.7 rounds   2.3 ms/combat
 *   s2 p1 k0   88.7%±1.8   0.0% draws   3.3 rounds   3.2 ms
 *   s4 p1 k0   94.7%±1.3   0.0% draws   3.1 rounds   6.0 ms
 *   s4 p2 k0   94.0%±1.4   0.0% draws   3.0 rounds  10.2 ms
 *
 * Removing the pruner is worth +36pp where TRIPLING the sample is worth +9pp,
 * and `s4 p1 k0` beats `s8 p3 k3` while costing half as much. A second pass
 * buys nothing once the first one can see the whole hand.
 *
 * THE OLD COMMENT'S FEAR WAS REAL AND IS NOW PAID FOR. It recorded that
 * `topK: 5` once sent draws from ~2% to 17.8% with p90 at the round cap — a
 * wider search finding STALLING lines — and said the fix was "the leaf
 * evaluator [pricing] an unfinished fight first". That is exactly the terminal
 * check `positionScore` now carries: a board at `maxRounds` is a DRAW, worth 0,
 * because that is what `winner()` returns. With it, draws measure 0.0% at every
 * budget above and fights get SHORTER, not longer.
 *
 * Cost is the honest trade: 6.0 ms against the old 2.3. Worth it — at 53%
 * against a one-line strategy the instrument was measuring its own blind spot
 * rather than the game.
 */
export const DEFAULT_LOOKAHEAD: LookaheadOptions = { depth: 1, samples: 4, passes: 1, topK: 0 };

/**
 * How good is this position for `team`? Hand-written on purpose (see the file
 * comment). The terms, in order of weight:
 *
 *  - PV differential — the headline. Mean fraction of health left, us minus
 *    them, so it reads the same in a 4v1 boss fight and a 4v6 swarm.
 *  - Bodies still standing — action economy. A team down a member loses a card
 *    every round for the rest of the fight, which is worth more than the PV
 *    that member had left.
 *  - Fatigue level — a cost paid in a currency that outlives the combat (a
 *    level is −1 on every roll until a long rest, and only a few cards can
 *    add one), so it is worth a little, not a lot.
 *
 * A finished combat short-circuits to a win/loss, which has to dominate every
 * positional term or the AI would trade a win away for a healthier board.
 */
export function positionScore(engine: CombatEngine, team: number, w: EvaluatorWeights = DEFAULT_EVAL_WEIGHTS): number {
  const us = engine.teams[team];
  const them = engine.teams[1 - team];
  const livingUs = us.filter(c => c.isAlive());
  const livingThem = them.filter(c => c.isAlive());

  if (livingThem.length === 0 && livingUs.length === 0) return 0;
  if (livingThem.length === 0) return 100;
  if (livingUs.length === 0) return -100;

  // OUT OF ROUNDS IS A RESULT, AND THE RESULT IS A DRAW.
  //
  // `runCombat` loops `while (!isOver() && round < maxRounds)` and then
  // `winner()` returns null — the engine's own word for a draw, the same
  // outcome a mutual wipe produces, which this function already scores 0. A
  // position at the cap is therefore TERMINAL and worth nothing to either side,
  // however the board looks.
  //
  // Without this the evaluator read a stalled board with a PV lead as a
  // comfortable win right up to the final round, which is not a taste about
  // how to value tempo — it contradicts what the engine will actually return.
  // (It is only the terminal case. Pricing an unfinished fight that is HEADING
  // for the cap is the harder, open problem the `topK` comment names, and that
  // one needs a design decision rather than a correction — NEXT-STEPS §20.6.)
  if (engine.round >= engine.maxRounds) return 0;

  const pvFrac = (team_: Character[]) => {
    if (team_.length === 0) return 0;
    let acc = 0;
    for (const c of team_) acc += Math.max(0, c.currentPV) / Math.max(1, c.maxPV);
    return acc / team_.length;
  };
  // Dead members count as 0 PV rather than being dropped, else wiping out our
  // own wounded would read as an improvement.
  const pvDiff = pvFrac(us) - pvFrac(them);
  const bodyDiff = (livingUs.length - livingThem.length) / Math.max(1, livingUs.length + livingThem.length);
  const fatigue = (t: Character[]) => (t.length ? t.reduce((s, c) => s + c.fatigue, 0) / t.length : 0);
  const fatigueDiff = (fatigue(livingThem) - fatigue(livingUs)) / FATIGUE_MAX_LEVEL;

  // What each side's STATUSES are worth (StatusBehavior.positionValue). Without
  // this the evaluator could only see PV, bodies and fatigue, so a wall that
  // has not yet been breached, an enemy who cannot act, or a set-up being held
  // all scored exactly zero — and the search never chose any of them. Measured
  // 2026-09-20: eleven cards across six kits under 3% of the turns they were
  // legal, nearly all of them control, prevention or set-up.
  //
  // Averaged per body, like the PV term, so a big team does not out-score a
  // small one simply by holding more statuses.
  const statusValue = (t: Character[]): number => {
    if (t.length === 0) return 0;
    let acc = 0;
    for (const c of t) {
      if (!c.isAlive()) continue;
      for (const ref of c.statusRefs()) acc += ref.entry.behavior?.positionValue?.(ref) ?? 0;
    }
    return acc / t.length;
  };
  const statusDiff = statusValue(livingUs) - statusValue(livingThem);

  return w.pv * pvDiff + w.bodies * bodyDiff + w.fatigue * fatigueDiff + w.status * statusDiff;
}

/** Action indices `actor` may legally play, via the engine's own gate, honouring
 *  a type restriction when one is set (and ignoring it when it would leave the
 *  character with nothing to play). */
function legal(engine: CombatEngine, actor: Character, restrictTo?: ActionType[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < actor.actions.length; i++) {
    if (!engine.canPlayActionIdx(actor, i)) continue;
    const def = actor.actions[i].def;
    if (restrictTo && !restrictTo.includes(def.actionType) && !def.lastResort) continue;
    out.push(i);
  }
  if (out.length === 0 && restrictTo) return legal(engine, actor);
  return out;
}

/** Play one round forward on `engine` (mutating it) with `choices` forced for
 *  `team`; everyone else decides at depth 0. */
function playRound(engine: CombatEngine, team: number, choices: Map<Character, number>): void {
  // ONLY PREPARE A ROUND THAT HAS NOT BEGUN.
  //
  // The search is invoked from inside `planActions`, which the engine reaches
  // only after its own `prepareRound()` — so this used to prepare the SAME
  // round twice. Two consequences, both probed: the rollout ran the round
  // counter one ahead of the round it was choosing for, and `prepareRound`
  // rebuilt `skippingThisRound` from a `skipTurns` the real round had already
  // decremented, so a character stunned for exactly this round ACTED in every
  // rollout. The AI could not see a turn it had just taken away, and it planned
  // against enemies who could not act.
  //
  // Deeper recursions still need it: they run after `finishRound`, on a round
  // that genuinely has not begun. Hence the flag rather than a parameter.
  if (!engine.roundPrepared) engine.prepareRound();
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
    // The lookahead never prompts: an empty target list makes the engine fall
    // back to its own resolution-time targeting.
    if (step.kind === 'target') engine.setResolveTarget([]);
    step = engine.resolveNextAction();
  }
  engine.finishRound();
}

/**
 * Expected value of committing `choices`, averaged over `samples` playouts.
 *
 * COMMON RANDOM NUMBERS, and they are the difference between a search and a
 * lottery. `pairSeed` is drawn once per `bestResponse` call and handed to every
 * evaluation inside it, so sample `s` of one candidate meets exactly the dice,
 * the opponents' picks and the tie-shuffles that sample `s` of every other
 * candidate meets. The branches then differ by the CARD and its consequences,
 * which is the only thing the comparison is supposed to be about.
 *
 * Unpaired, this was the very error the measurement layer spent a session
 * removing from itself: `bestResponse` compared a 2-rollout average against an
 * incumbent drawn from DIFFERENT randomness and never refreshed, so the winner
 * of a close call was whichever candidate got lucky dice — selection bias, at
 * `samples: 2`, on every decision the instrument makes. §12 records the same
 * mistake in the mirror sweeps ("independent ±2pp samples"), §19.7 in
 * requirement 3's bar, and `bench/regret.ts` already pairs its branches for
 * exactly this reason.
 *
 * Holding the seed FIXED across passes is deliberate too: iterated best
 * response is then a hill-climb on one fixed sampled objective, rather than a
 * climb on a surface that reshuffles under it between passes.
 */
function evaluate(
  engine: CombatEngine,
  team: number,
  choices: Map<Character, number>,
  opts: LookaheadOptions,
  depthLeft: number,
  pairSeed: number,
  /**
   * Stop early once this candidate cannot beat `floor` — the value the search
   * would keep anyway. Omit to always spend the full sample.
   *
   * RACING, not pruning. `topK` used to drop candidates on the depth-0
   * heuristic's OPINION, before any rollout, and cost 36 points by excluding
   * the defences (§20.7). This drops them on their OWN measured rollouts, after
   * at least half the budget, and only when the remaining samples cannot
   * plausibly rescue them. A candidate cut here was already losing on its own
   * evidence, and the value returned is still below `floor`, so the caller's
   * comparison reaches the same conclusion it would have.
   */
  floor?: number,
): number {
  let total = 0;
  let sumSq = 0;
  const minSamples = Math.max(2, Math.ceil(opts.samples / 2));
  // Seat indices resolved ONCE, not per sample. `choices` is keyed by the
  // Character objects of the live engine while each rollout works on fresh
  // copies, so the mapping is by position — and re-running `indexOf` for every
  // actor on every sample was quadratic work inside the hottest loop here.
  const seats: [number, number][] = [];
  for (const [actor, idx] of choices) {
    const pos = engine.teams[team].indexOf(actor);
    if (pos >= 0) seats.push([pos, idx]);
  }
  for (let s = 0; s < opts.samples; s++) {
    if (floor !== undefined && s >= minSamples) {
      // Two sigma of the running mean, floored so a run of identical rollouts
      // (every branch settled, a common thing in a 3-round fight) cannot claim
      // certainty and cut on nothing.
      const mean = total / s;
      const variance = Math.max(0, sumSq / s - mean * mean);
      const slack = 2 * Math.sqrt(variance / s) + 1e-9;
      if (mean + slack < floor) return mean;
    }
    const one = withSeed(pairSeed + s * 7919, () => {
      const sim = engine.clone();
      // Rollouts think at depth 0 — otherwise the search recurses into itself
      // once per sample per candidate and never returns. The clone also drops any
      // external chooser, which may be a lookahead wrapper for the same reason.
      // The rollout plays at DEPTH 0 — otherwise the search recurses into
      // itself once per sample per candidate and never returns. It gets the
      // depth-0 policy explicitly, because the engine has none of its own.
      sim.actionChooser = (e, a) => selectAction(e, a).actionIdx;
      if (opts.rolloutSharpness !== undefined) sim.aiSharpness = opts.rolloutSharpness;
      const mapped = new Map<Character, number>();
      for (const [pos, idx] of seats) mapped.set(sim.teams[team][pos], idx);
      playRound(sim, team, mapped);

      if (depthLeft > 1 && !sim.isOver() && sim.round < sim.maxRounds) {
        return bestResponse(sim, team, { ...opts, depth: depthLeft - 1 }).value;
      }
      return positionScore(sim, team, opts.weights);
    });
    total += one;
    sumSq += one * one;
  }
  return total / Math.max(1, opts.samples);
}

/**
 * Choose a card for every living member of `team`, by iterated best response.
 * Returns the assignment and its expected value.
 */
export function bestResponse(
  engine: CombatEngine,
  team: number,
  opts: LookaheadOptions = DEFAULT_LOOKAHEAD,
): { choices: Map<Character, number>; value: number } {
  const actors = engine.teams[team].filter(c => c.isAlive());
  const choices = new Map<Character, number>();
  // Seed with the depth-0 pick, so a pass that improves nothing still leaves a
  // sane card on the table.
  for (const a of actors) {
    const allowed = legal(engine, a, opts.restrictTo);
    const idx = selectAction(engine, a).actionIdx;
    // Under a restriction the depth-0 seed may be an illegal card here; fall
    // back to the first allowed one so the pass starts from something valid.
    if (allowed.includes(idx)) choices.set(a, idx);
    else if (allowed.length) choices.set(a, allowed[0]);
  }

  // ONE SEED FOR THE WHOLE DECISION. Every evaluation below — the incumbent's
  // and every candidate's, on every pass — runs against the same rollouts, so
  // the comparisons are PAIRED. See `evaluate`.
  const pairSeed = Math.floor(random() * 1e9);

  let value = actors.length ? evaluate(engine, team, choices, opts, opts.depth, pairSeed) : 0;
  for (let pass = 0; pass < opts.passes; pass++) {
    let improved = false;
    for (const actor of actors) {
      let candidates = legal(engine, actor, opts.restrictTo);
      if (candidates.length <= 1) continue;
      if (opts.topK > 0 && candidates.length > opts.topK) {
        // Prune by the depth-0 opinion: sample it a few times and keep the
        // cards it actually reaches for. Cheap, and it never drops the card
        // depth 0 would have played.
        //
        // EVERY SAMPLE IS FILTERED THROUGH `allowed`. `selectAction` knows
        // nothing about `restrictTo` — it samples the actor's whole legal hand
        // — so without this filter the pruner handed back cards the restriction
        // had just excluded, and a search restricted to attacks would evaluate,
        // and play, defenses. That silently corrupted every restricted
        // measurement: the "attacks only" arm was only ~74% attacks.
        const allowed = new Set(candidates);
        const seen = new Map<number, number>();
        for (let i = 0; i < opts.topK * 2; i++) {
          const idx = selectAction(engine, actor).actionIdx;
          if (idx >= 0 && allowed.has(idx)) seen.set(idx, (seen.get(idx) ?? 0) + 1);
        }
        const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
        const current = choices.get(actor);
        if (current !== undefined && allowed.has(current) && !ranked.includes(current)) ranked.push(current);
        // Sampling can miss allowed cards entirely (it is weighted and random,
        // and under a restriction most draws may be rejected). Top up from the
        // allowed list so the search always has `topK` real options.
        for (const idx of candidates) {
          if (ranked.length >= opts.topK) break;
          if (!ranked.includes(idx)) ranked.push(idx);
        }
        if (ranked.length > 0) candidates = ranked.slice(0, opts.topK);
      }
      for (const idx of candidates) {
        if (choices.get(actor) === idx) continue;
        const trial = new Map(choices);
        trial.set(actor, idx);
        // `value` is the incumbent, measured on the SAME paired rollouts, so a
        // candidate that cannot reach it is not worth finishing.
        const v = evaluate(engine, team, trial, opts, opts.depth, pairSeed,
          opts.race === false ? undefined : value);
        if (v > value) { value = v; choices.set(actor, idx); improved = true; }
      }
    }
    if (!improved) break; // settled — further passes would repeat themselves
  }
  return { choices, value };
}

/**
 * The lookahead as an `actionChooser`, for callers that need it on ONE team
 * only — benchmarks holding an opponent constant, or a fight where one side
 * should think harder than the other.
 *
 * Prefer `aiPolicy()` from the package root: it returns the action AND target
 * choosers together, which is what an engine needs.
 */
export function lookaheadChooser(opts: Partial<LookaheadOptions> = {}, teams: number[] = [0, 1]) {
  const full: LookaheadOptions = { ...DEFAULT_LOOKAHEAD, ...opts };
  let cache: { engine: CombatEngine; round: number; team: number; choices: Map<Character, number> } | null = null;
  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    if (!cache || cache.engine !== engine || cache.round !== engine.round || cache.team !== actor.team) {
      cache = { engine, round: engine.round, team: actor.team, choices: bestResponse(engine, actor.team, full).choices };
    }
    return cache.choices.get(actor) ?? null;
  };
}
