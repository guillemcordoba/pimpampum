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
  Character, CombatEngine, ActionType, FATIGUE_MAX_LEVEL, random, withSeed, withRng, seededRng, mirrored,
  type ActionDefinition, type TargetRequirement,
} from '@pimpampum/engine';
import {
  selectAction, actionOdds, drawAction, pickResolveTargets, aimedTargets, expectedAttackTotal, type ActionOdds, type AttackAim, type DefenseModel,
} from './policy.js';

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
  /** Rounds each rollout plays on at depth 0 (everyone) after the searched
   *  round, before the leaf is read. Omit or 0: read it right after. Each
   *  round costs about as much as the searched one. */
  continuation?: number;
  /** Rollout OPPONENTS weigh a defense by the PV it expects to save
   *  (`DefenseModel` 'prevented'). The flat model is still the depth-0
   *  policy's, because it predicted the spam baselines best (§20.8); but in a
   *  rollout it never raised the block an advance races or a strike runs
   *  into. (The same for our own seats added nothing on top: §54.3.) */
  opponentDefense?: boolean;
  /** Rollouts in ANTITHETIC pairs: every odd sample replays the one before it
   *  with each die mirrored (high where it rolled low), so the dice's luck
   *  largely cancels in the mean. Same cost per sample. */
  antithetic?: boolean;
  /** How the heuristic aims attacks — in every rollout, and as the target
   *  search's fallback (`AttackAim`). Omit: `share`. */
  attackAim?: AttackAim;
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
  /**
   * Give every seat its own random stream inside a rollout
   * (`CombatEngine.seatStreamSeed`). On by default; set false only to A/B it.
   */
  seatStreams?: boolean;
  /**
   * Rollouts per candidate when an action's single target is chosen at
   * resolution (`searchTargets`); 0 keeps the resolution heuristic alone.
   */
  targetSamples?: number;
  /**
   * Weight of NEXT ROUND'S BLOWS in the leaf (`nextRoundThreat`); 0 scores the
   * board where the searched round ends, as the search always did.
   *
   * WHY: a depth-1 leaf read at the end of the round cannot see anything that
   * lands at the start of the next one. A stun (`skipTurns`) takes a turn that
   * has not come yet; a delayed blow lands as the next round opens; a raised
   * ally first acts next round. All three scored as nothing, or as one more
   * body worth a few PV, and the overnight audit caught the AI passing them
   * up in 26-60% of the positions they were right in (NEXT-STEPS §52). So the
   * leaf is SETTLED — the next round is prepared, round-start effects land,
   * the bodies that lose it are known — and each side's blows for that round
   * are priced in the PV term's own units.
   *
   * Playing that round out at depth 0 instead was measured too, and lost: our
   * own side's depth-0 play is weak enough that it cost the AI strength in the
   * mirror and doubled the search's cost (§52.2).
   */
  tempo?: number;
  /** Search the OPPONENTS' cards once per decision for the rollouts' model of
   *  them (`searchedOdds`); omit for the depth-0 heuristic alone. */
  opponentSearch?: OpponentSearch;
}

export interface OpponentSearch {
  /** Rollouts per opponent card. */
  samples: number;
  /** How far (leaf-score points) a card may trail the foe's best before its
   *  depth-0 odds are cut. */
  margin: number;
  /** How fast they are cut beyond it (per point). */
  sharpness: number;
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
  /** Share of the PV term read in ABSOLUTE PV (both sides' PV over their
   *  mean total) rather than mean fractions. 0 or omitted: fractions only. */
  absolutePv?: number;
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
 *
 * SIX SAMPLES AND TWO PASSES since 2026-10-05 (one pass before). With cards
 * that reward coordination, a second pass — each hero reconsidering once its
 * teammates have chosen — bought more than more samples did, and at less cost
 * (NEXT-STEPS §29, §38).
 */
export const DEFAULT_LOOKAHEAD: LookaheadOptions = {
  depth: 1, samples: 6, passes: 2, topK: 0, targetSamples: 2, tempo: 1, antithetic: true, opponentDefense: true,
  opponentSearch: { samples: 1, margin: 10, sharpness: 1 },
};

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

  const pvFrac = (team_: Character[]) => {
    if (team_.length === 0) return 0;
    let acc = 0;
    for (const c of team_) acc += Math.max(0, c.currentPV) / Math.max(1, c.maxPV);
    return acc / team_.length;
  };

  // A WIN IS WORTH MORE WITH MORE HEALTH LEFT. Every win used to score a flat
  // 100, so two lines that both win — fell the foe now, or let a bomb fell it
  // next round after it has struck once more — were a tie, and the depth-0
  // seed decided (the audit's `bomb-short` control, NEXT-STEPS §52.6). The
  // health term only breaks ties among wins (and among losses): it is never
  // worth a win.
  if (livingThem.length === 0 && livingUs.length === 0) return 0;
  if (livingThem.length === 0) return 100 + w.pv * pvFrac(us);
  if (livingUs.length === 0) return -100 - w.pv * pvFrac(them);

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
  // Dead members count as 0 PV rather than being dropped, else wiping out our
  // own wounded would read as an improvement.
  let pvDiff = pvFrac(us) - pvFrac(them);
  if (w.absolutePv) {
    const sum = (t: Character[], f: (c: Character) => number) => t.reduce((s, c) => s + f(c), 0);
    const scale = (sum(us, c => Math.max(1, c.maxPV)) + sum(them, c => Math.max(1, c.maxPV))) / 2;
    const abs = (sum(us, c => Math.max(0, c.currentPV)) - sum(them, c => Math.max(0, c.currentPV))) / scale;
    pvDiff = (1 - w.absolutePv) * pvDiff + w.absolutePv * abs;
  }
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
      if (!c.isAlive() || !c.holdsStatusWith('positionValue')) continue;
      for (const [key, entry] of c.statuses) {
        const price = entry.behavior?.positionValue;
        if (price) acc += price({ holder: c, key, entry });
      }
    }
    return acc / t.length;
  };
  const statusDiff = statusValue(livingUs) - statusValue(livingThem);

  return w.pv * pvDiff + w.bodies * bodyDiff + w.fatigue * fatigueDiff + w.status * statusDiff;
}

/**
 * NEXT ROUND'S BLOWS, ours minus theirs, in the PV term's own units: each body
 * that acts next round lands the best attack it may legally play (plus the
 * largest exposure a foe carries — `attackRollAgainstHolder`), spread over the
 * other side's full health. Read on a SETTLED board (`LookaheadOptions.tempo`);
 * `skipping` are the bodies that lose the round. Crude on purpose — no
 * defences, no targets — because its job is only to make a turn taken, a body
 * raised or a foe laid open worth something at the leaf; the next decision
 * plays that round for real.
 *
 * NOT capped at the PV the other side has LEFT, though a blow cannot take
 * more: capped so, our threat SHRANK with every point we dealt, and in 4v1
 * fights the search started guarding where striking was right (§52.1).
 */
function nextRoundThreat(engine: CombatEngine, team: number, skipping: Set<Character>, w: EvaluatorWeights): number {
  let acc = 0;
  for (const side of [0, 1]) {
    const foes = engine.teams[1 - side];
    let foeMax = 0;
    let exposure = 0;
    for (const f of foes) {
      foeMax += Math.max(1, f.maxPV);
      if (!f.isAlive()) continue;
      if (!f.holdsStatusWith('attackRollAgainstHolder')) continue;
      let e = 0;
      for (const ref of f.statusRefs()) e += ref.entry.behavior?.attackRollAgainstHolder?.(ref) ?? 0;
      exposure = Math.max(exposure, e);
    }
    let out = 0;
    for (const c of engine.teams[side]) {
      if (!c.isAlive() || skipping.has(c)) continue;
      let best = 0;
      for (let i = 0; i < c.actions.length; i++) {
        const a = c.actions[i];
        if (a.def.actionType !== ActionType.Atac || !engine.canPlayActionIdx(c, i)) continue;
        best = Math.max(best, expectedAttackTotal(c, a.def));
      }
      if (best > 0) out += best + exposure;
    }
    let units = Math.min(out, foeMax) / foeMax;
    if (w.absolutePv) {
      let all = 0;
      for (const c of engine.allCombatants()) all += Math.max(1, c.maxPV);
      units = (1 - w.absolutePv) * units + w.absolutePv * Math.min(out, foeMax) / (all / 2);
    }
    acc += (side === team ? 1 : -1) * w.pv * units;
  }
  return acc;
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
  // A side that chooses after the reveal plays against the cards it SAW, not
  // against a guess of them.
  const seer = engine.teams[team].find(c => c.isAlive());
  const revealed = seer ? engine.revealedPlanFor(seer) : [];
  engine.planActions([...selections, ...revealed]);
  let step = engine.resolveNextAction();
  let guard = 0;
  while (step.kind !== 'done' && guard++ < 400) {
    // The lookahead never prompts: an empty target list makes the engine fall
    // back to its own resolution-time targeting.
    if (step.kind === 'target') engine.setResolveTarget([]);
    // …and answers a reveal option with nothing: the card's own pick.
    else if (step.kind === 'choice') engine.setResolveChoice();
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
interface DecisionMemo {
  /** The side deciding, and how hard it thinks. */
  team: number;
  opts: LookaheadOptions;
  pairSeed: number;
  /** Rollout values already measured, by plan, then by sample index. */
  plans: Map<string, number[]>;
  /** The rollouts' odds, by seat (`team * 1000 + index`). */
  odds: Map<number, ActionOdds>;
  /** The depth-0 heuristic's odds, by seat — `odds` before the opponent
   *  search, and what that search plays everyone else with. */
  base: Map<number, ActionOdds>;
}

const newMemo = (team: number, opts: LookaheadOptions, pairSeed: number, base = new Map<number, ActionOdds>()): DecisionMemo =>
  ({ team, opts, pairSeed, plans: new Map(), odds: opts.opponentSearch ? new Map() : base, base });

/**
 * A foe's cards, each played out for one round against everyone else at depth
 * 0 and scored from the FOE's side; a card that trails its best by more than
 * `OpponentSearch.margin` has its depth-0 odds cut.
 *
 * WHY: the depth-0 heuristic prices an attack by its damage and a Focus at a
 * flat 1.2, so a foe that should dodge (claw and die, or hide and lose
 * nothing) claws almost always, and the search planned against a foe walking
 * into the blow (§49.3: the real goblins hid 43% of the time, the model 1%).
 * Nothing in a card says it hides; only playing it out shows it.
 *
 * WHY ONLY BLUNDERS: replacing the heuristic's odds by the searched values
 * (a quantal response to our depth-0 play) made the search WORSE on the
 * night's positions, worst in 1v1 — the foe it modelled answered a depth-0
 * us, not the us that plays (§20.8 again: the model owes the search
 * accuracy, not quality). Cutting only cards that lose about a side's worth
 * of health leaves the heuristic alone wherever it is merely imprecise
 * (NEXT-STEPS §52.4).
 */
function searchedOdds(root: CombatEngine, actor: Character, base: ActionOdds, shared: DecisionMemo): ActionOdds {
  const os = shared.opts.opponentSearch!;
  const inner = newMemo(actor.team, { ...shared.opts, samples: os.samples, opponentSearch: undefined }, shared.pairSeed + 104_729, shared.base);
  const values = base.indices.map(idx =>
    evaluate(root, actor.team, new Map([[actor, idx]]), inner.opts, 1, inner.pairSeed, undefined, inner));
  const top = Math.max(...values);
  const weights = base.indices.map((_, k) =>
    base.weights[k] * Math.exp(-os.sharpness * Math.max(0, top - values[k] - os.margin)));
  return { indices: base.indices, weights, total: weights.reduce((s, w) => s + w, 0) };
}

/** How a rollout seat weighs its defenses (`opponentDefense`). */
function defenseModel(opts: LookaheadOptions, team: number, a: Character): DefenseModel {
  return a.team !== team && opts.opponentDefense ? 'prevented' : 'flat';
}

/**
 * The rollouts' chooser for everyone the plan does not fix, weighing each seat
 * ONCE per decision.
 *
 * Every rollout of one `bestResponse` clones the same board, and nobody's
 * choice changes it, so a seat that chooses in a rollout reads the same board
 * in every sample of every candidate: the same odds, only a different draw.
 * The weighing (every card's damage estimate and hints) was a tenth of the
 * search's time. Not shared where the board can differ: a round the rollout
 * must prepare itself (round-start effects may roll), a later round, and a
 * seat that chooses after the reveal (it reads the plan).
 */
function rolloutOpponents(root: CombatEngine, shared: DecisionMemo): (e: CombatEngine, a: Character) => number | null {
  const model = (a: Character): DefenseModel => defenseModel(shared.opts, shared.team, a);
  if (!root.roundPrepared) return (e, a) => selectAction(e, a, model(a)).actionIdx;
  return (e, a) => {
    if (e.round !== root.round || a.holdsStatusWith('choosesAfterReveal')) return selectAction(e, a, model(a)).actionIdx;
    const pos = e.teams[a.team].indexOf(a);
    const seat = a.team * 1000 + pos;
    let odds = shared.odds.get(seat);
    if (!odds) {
      // `base` is shared with the opponent-search memo, whose own seats are
      // not ours: keyed by model as well as seat.
      const m = model(a);
      const baseKey = seat + (m === 'prevented' ? 500 : 0);
      let base = shared.base.get(baseKey);
      if (!base) shared.base.set(baseKey, base = actionOdds(e, a, m));
      odds = a.team !== shared.team && shared.opts.opponentSearch && base.indices.length > 1
        ? searchedOdds(root, root.teams[a.team][pos], base, shared)
        : base;
      shared.odds.set(seat, odds);
    }
    return drawAction(odds).actionIdx;
  };
}

/**
 * The odds the search's rollouts give `actor`'s cards when its OPPONENTS
 * decide, on a round already prepared. For tests and probes.
 */
export function rolloutOdds(engine: CombatEngine, actor: Character, opts: LookaheadOptions = DEFAULT_LOOKAHEAD, pairSeed = 1): ActionOdds {
  const shared = newMemo(1 - actor.team, opts, pairSeed);
  const base = actionOdds(engine, actor);
  return opts.opponentSearch && base.indices.length > 1 ? searchedOdds(engine, actor, base, shared) : base;
}

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
  /** What one `bestResponse` has already worked out. Omit to work it all out. */
  shared?: DecisionMemo,
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
  // THE SAME PLAN IS ASKED FOR AGAIN, and its rollouts would be the same. A
  // sample is a pure function of the board, the plan and `pairSeed + s`, so
  // the second pass of `bestResponse` — which re-asks every card of every
  // seat whose teammates have not moved since — reads its values back. The
  // racing rule below still runs over them sample by sample against TODAY's
  // floor, so a plan cut earlier is resumed where it stopped, and one measured
  // in full is cut now exactly where a fresh measurement would cut it.
  let known: number[] | undefined;
  if (shared) {
    let key = '';
    for (const [pos, idx] of seats) key += pos + ':' + idx + ',';
    known = shared.plans.get(key);
    if (!known) shared.plans.set(key, known = []);
  }
  const opponentModel = shared ? rolloutOpponents(engine, shared)
    : (e: CombatEngine, a: Character) => selectAction(e, a, defenseModel(opts, team, a)).actionIdx;
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
    const cached = known?.[s];
    // ANTITHETIC pairs: sample 2k+1 replays 2k's seed with every draw mirrored.
    const seed = pairSeed + (opts.antithetic ? s >> 1 : s) * 7919;
    const mirror = !!opts.antithetic && (s & 1) === 1;
    const one = cached !== undefined ? cached : withRng(mirror ? mirrored(seededRng(seed)) : seededRng(seed), () => {
      const sim = engine.clone();
      if (opts.seatStreams !== false) { sim.seatStreamSeed = seed; sim.seatStreamMirror = mirror; }
      // Rollouts think at depth 0 — otherwise the search recurses into itself
      // once per sample per candidate and never returns. The clone also drops any
      // external chooser, which may be a lookahead wrapper for the same reason.
      // The rollout plays at DEPTH 0 — otherwise the search recurses into
      // itself once per sample per candidate and never returns. It gets the
      // depth-0 policy explicitly, because the engine has none of its own.
      sim.actionChooser = opponentModel;
      // Rollouts aim by the heuristic: searching targets inside a rollout would
      // nest a search per target choice per sample per candidate.
      sim.targetChooser = aimedTargets(opts.attackAim);
      if (opts.rolloutSharpness !== undefined) sim.aiSharpness = opts.rolloutSharpness;
      const mapped = new Map<Character, number>();
      for (const [pos, idx] of seats) mapped.set(sim.teams[team][pos], idx);
      playRound(sim, team, mapped);

      if (depthLeft > 1 && !sim.isOver() && sim.round < sim.maxRounds) {
        return bestResponse(sim, team, { ...opts, depth: depthLeft - 1 }).value;
      }
      // PLAY ON (`LookaheadOptions.continuation`): a few more rounds at depth 0
      // for everyone before the leaf is read — a cost that lands rounds later
      // (a tank spent shielding others from an undefendable blow) is invisible
      // to a leaf read right after this one.
      for (let k = 0; k < (opts.continuation ?? 0) && !sim.isOver() && sim.round < sim.maxRounds; k++) sim.runRound();
      // SETTLE THE LEAF (`LookaheadOptions.tempo`): prepare the next round —
      // round-start effects land, the bodies that lose it are known — and
      // price its blows. Not when that round is the cap: a board there is a
      // draw whatever it holds.
      if (opts.tempo && !sim.isOver() && sim.round + 1 < sim.maxRounds) {
        const { skipping } = sim.prepareRound();
        // A round-start effect may have ended the fight: no blows follow a
        // result (they were once added on top of the win, so a bomb that
        // fells the foe next round outscored a strike that fells it now).
        if (sim.isOver()) return positionScore(sim, team, opts.weights);
        const lost = new Set(skipping.map(r => sim.teams[r.team][r.idx]));
        return positionScore(sim, team, opts.weights)
          + opts.tempo * nextRoundThreat(sim, team, lost, opts.weights ?? DEFAULT_EVAL_WEIGHTS);
      }
      return positionScore(sim, team, opts.weights);
    });
    if (known && cached === undefined) known[s] = one;
    total += one;
    sumSq += one * one;
  }
  return total / Math.max(1, opts.samples);
}

/**
 * What the search believes a fixed plan for `team` is worth: the same paired
 * rollouts and leaf it compares candidates with, at full sample. For tracing a
 * decision (why did it pick that card?), never on the hot path.
 */
export function evaluatePlan(
  engine: CombatEngine, team: number, choices: Map<Character, number>,
  opts: LookaheadOptions = DEFAULT_LOOKAHEAD, pairSeed = 1,
): number {
  return evaluate(engine, team, choices, opts, opts.depth, pairSeed);
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
  const memo = newMemo(team, opts, pairSeed);

  let value = actors.length ? evaluate(engine, team, choices, opts, opts.depth, pairSeed, undefined, memo) : 0;
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
          opts.race === false ? undefined : value, memo);
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

/**
 * Choose an action's single target by playing the rest of the round out once
 * per candidate, on paired rollouts, at the moment the action resolves.
 *
 * WHY: targets were never searched. The card is chosen by the lookahead, but
 * who it hits came from `pickResolveTargets`, a fixed rule — which, for one,
 * gives "interrupt a pending focus" the same bonus whatever the focus does, so
 * beside a harmless focus it could hit the wrong foe and let a deadly one
 * resolve. Searched, the same AI beat the rule ~77% of mirror fights
 * (NEXT-STEPS §31).
 *
 * The heuristic's pick is the incumbent and a candidate must beat it outright,
 * so a choice the rollouts cannot separate stays what it was. Multi-target
 * choices keep the heuristic: their combinations grow too fast.
 */
export function searchTargets(
  engine: CombatEngine, actor: Character, def: ActionDefinition, req: TargetRequirement,
  count: number, pool: Character[], speed: number, samples: number, aim: AttackAim = 'share',
): Character[] {
  const heuristic = pickResolveTargets(engine, actor, def, req, count, pool, speed, aim);
  if (count !== 1 || pool.length < 2 || samples < 1) return heuristic;
  const pairSeed = Math.floor(random() * 1e9);
  const team = actor.team;
  const valueOf = (target: Character): number => {
    const ref = { team: target.team, idx: engine.teams[target.team].indexOf(target) };
    let total = 0;
    for (let s = 0; s < samples; s++) {
      total += withSeed(pairSeed + s * 7919, () => {
        const sim = engine.clone();
        sim.seatStreamSeed = pairSeed + s * 7919;
        sim.actionChooser = (e, a) => selectAction(e, a).actionIdx;
        sim.targetChooser = aimedTargets(aim);
        sim.setResolveTarget([ref]);
        let step = sim.resolveNextAction();
        for (let guard = 0; step.kind !== 'done' && guard < 400; guard++) {
          if (step.kind === 'target') sim.setResolveTarget([]);
          else if (step.kind === 'choice') sim.setResolveChoice();
          step = sim.resolveNextAction();
        }
        sim.finishRound();
        return positionScore(sim, team);
      });
    }
    return total / samples;
  };
  let best = heuristic[0] ?? pool[0];
  let bestValue = valueOf(best);
  for (const candidate of pool) {
    if (candidate === best) continue;
    const v = valueOf(candidate);
    if (v > bestValue) { best = candidate; bestValue = v; }
  }
  return [best];
}
