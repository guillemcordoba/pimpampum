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
import { Character } from './character.js';
import { CombatEngine } from './combat.js';
import { selectAction } from './ai.js';
import { ActionType } from './types.js';
import { FATIGUE_MAX_LEVEL } from './fatigue.js';

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
}

/**
 * `topK: 3` prunes hard — on a six-card kit roughly half the hand never reaches
 * the search at all, ranked out by the depth-0 heuristic's hand-tuned weights.
 *
 * That looks like a bug and is not. Measured 2026-09-20 at `topK: 5`: draws
 * went from ~2% to 17.8%, p90 rounds hit the 40-round cap, and every card in
 * Mestre d'Armes started correlating with losing. A wider search does not find
 * better cards, it finds STALLING LINES — positions that score well and never
 * end — and the narrow pruning was quietly protecting the game from them.
 *
 * So the number is load-bearing. Raising it is not an improvement waiting to
 * happen; it is a change that needs the leaf evaluator to price an unfinished
 * fight first.
 */
export const DEFAULT_LOOKAHEAD: LookaheadOptions = { depth: 1, samples: 2, passes: 1, topK: 3 };

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
export function positionScore(engine: CombatEngine, team: number): number {
  const us = engine.teams[team];
  const them = engine.teams[1 - team];
  const livingUs = us.filter(c => c.isAlive());
  const livingThem = them.filter(c => c.isAlive());

  if (livingThem.length === 0 && livingUs.length === 0) return 0;
  if (livingThem.length === 0) return 100;
  if (livingUs.length === 0) return -100;

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

  return 10 * pvDiff + 6 * bodyDiff + 0.5 * fatigueDiff + 10 * statusDiff;
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
    // The lookahead never prompts: an empty target list makes the engine fall
    // back to its own resolution-time targeting.
    if (step.kind === 'target') engine.setResolveTarget([]);
    step = engine.resolveNextAction();
  }
  engine.finishRound();
}

/** Expected value of committing `choices`, averaged over `samples` playouts. */
function evaluate(
  engine: CombatEngine,
  team: number,
  choices: Map<Character, number>,
  opts: LookaheadOptions,
  depthLeft: number,
): number {
  let total = 0;
  for (let s = 0; s < opts.samples; s++) {
    const sim = engine.clone();
    // Rollouts think at depth 0 — otherwise the search recurses into itself
    // once per sample per candidate and never returns. The clone also drops any
    // external chooser, which may be a lookahead wrapper for the same reason.
    sim.aiDepth = 0;
    sim.actionChooser = undefined;
    const mapped = new Map<Character, number>();
    for (const [actor, idx] of choices) {
      const pos = engine.teams[team].indexOf(actor);
      if (pos >= 0) mapped.set(sim.teams[team][pos], idx);
    }
    playRound(sim, team, mapped);

    if (depthLeft > 1 && !sim.isOver() && sim.round < sim.maxRounds) {
      const next = bestResponse(sim, team, { ...opts, depth: depthLeft - 1 });
      total += next.value;
    } else {
      total += positionScore(sim, team);
    }
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

  let value = actors.length ? evaluate(engine, team, choices, opts, opts.depth) : 0;
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
        const v = evaluate(engine, team, trial, opts, opts.depth);
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
 * should think harder than the other. Production code should prefer the
 * engine's `aiDepth` option: same AI, one knob, no plumbing.
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
