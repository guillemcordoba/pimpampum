/**
 * WHAT A CARD IS WORTH, MEASURED AT THE MOMENT IT IS PLAYED.
 *
 * The leave-one-out ablation (the analyzer's old requirement 4/5) asks what
 * a KIT loses without a card and answers it in party winrate. It was calibrated
 * (NEXT-STEPS §17.5) and it is underpowered, for four compounding reasons:
 *
 *   DILUTION     the subject holds 1 seat of 4, so 3 of every 4 decisions in
 *                the fight are somebody else's.
 *   BINARIZATION a fight's outcome is ONE BIT. A card that saves four PV in
 *                every fight is invisible until it flips one.
 *   BREVITY      fights run 3 rounds at the median, so a card gets ~3 chances
 *                to appear at all, and dropping 1 of 5 cards changes ~1 play.
 *   SUBSTITUTION removing a card measures the gap to the NEXT-BEST card, not
 *                what the card does.
 *
 * Together they put a whole 5-card kit's contribution at ~11pp and the noise
 * floor at ~3pp, so the average card is under the floor BY CONSTRUCTION.
 *
 * This measures something different, and all four go away.
 *
 *   At a position P where card C is legal, CLONE the position once per legal
 *   card, force that card, play the fight out, and score the end state. The
 *   card's value at P is its score minus what the alternatives scored.
 *
 * The branches share the IDENTICAL POSITION, not merely a seed — so the paired
 * difference is close to pure signal. (Leave-one-out's two arms are independent
 * games by round 2: they diverge from the first play and never meet again.)
 * Every fight yields one observation per decision instead of one per fight, and
 * dilution is gone because the question is about THIS PLAY, not the party's
 * season.
 *
 * WHAT IS STILL AI-DEPENDENT, because it must be said plainly: the POSITIONS
 * are reached by AI play, and the rollouts are continued by it. A card whose
 * moment never arrives under this policy will not be valued here. That is a
 * weaker dependence than "the AI declined to pick it" — both branches are
 * continued by the same policy, so its bias is differenced away — but it is not
 * zero, and no instrument that plays the game can make it zero.
 */
import {
  availableActionIndices, Character, CombatEngine, random, setAIControlled as _setAI,
  withSeed,
} from '@pimpampum/engine';
import { aiPolicy, lookaheadChooser as _look } from '@pimpampum/ai';

/**
 * THE OUTCOME, and why it is not a weighting I invented.
 *
 * `positionScore` — the AI's own leaf evaluator — prices PV against bodies
 * against fatigue with coefficients somebody chose, and scoring a card with it
 * would be the circularity this whole exercise exists to escape.
 *
 * This is PV on one side minus PV on the other, and nothing else. The rules
 * make that a single currency: damage IS the margin, and the margin is applied
 * to PV, so a point on one side of the board is the same unit as a point on the
 * other. Nobody weighted anything.
 *
 * It also encodes the win condition without being told: a side at 0 has lost,
 * so a won fight scores the winner's surviving PV and a lost one scores minus
 * the other side's. Winning big beats winning narrowly, which is the magnitude
 * a win/loss bit throws away.
 *
 * It is a SURROGATE for winning, not the same thing — 10 damage spread over
 * four enemies is not a kill — so `card-value.ts` validates it against winrate
 * rather than assuming it.
 */
export function pvDifferential(engine: CombatEngine, team: number): number {
  const sum = (t: number): number =>
    engine.teams[t].reduce((n, c) => n + Math.max(0, c.currentPV), 0);
  return sum(team) - sum(1 - team);
}

/** One card's score at one position, and whether that branch went on to win.
 *  `samples` keeps every rollout's score, for the cross-fitted choice cost. */
export interface Branch { actionIdx: number; cardId: string; score: number; won: number; samples: number[] }

/**
 * What a random pick loses against the best card, CROSS-FITTED.
 *
 * The plain "top score minus the mean" is biased upwards: the top is a MAX
 * over noisy rollouts, so two cards worth exactly the same still show a cost
 * — winner's curse, at every decision. Choosing the best on one half of the
 * samples and pricing that choice on the other half (then the reverse) is
 * unbiased: equal cards cost zero on average. With one sample there is
 * nothing to split; the smoke run falls back to the biased form, since it
 * measures nothing anyway.
 */
/** The mean of every other rollout sample, starting at `parity` — one of the
 *  two independent halves a cross-fit splits the samples into. */
function half(b: { samples: number[] }, parity: number): number {
  const xs = b.samples.filter((_, i) => i % 2 === parity);
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}

export function crossFittedCost(branches: Pick<Branch, 'score' | 'samples'>[]): number {
  const n = branches[0]?.samples.length ?? 0;
  const plain = (scores: number[]) => Math.max(...scores) - scores.reduce((a, b) => a + b, 0) / scores.length;
  if (n < 2) return plain(branches.map(b => b.score));
  const priced = (pick: number, price: number): number => {
    const chooser = branches.map(b => half(b, pick));
    const judge = branches.map(b => half(b, price));
    const top = Math.max(...chooser);
    const best = judge.filter((_, i) => chooser[i] === top);
    return best.reduce((a, x) => a + x, 0) / best.length - judge.reduce((a, x) => a + x, 0) / judge.length;
  };
  return (priced(0, 1) + priced(1, 0)) / 2;
}

/**
 * WHEN a card is the best play, by how much it beats the runner-up —
 * cross-fitted: per branch, one observation for each way round in which it
 * was picked as the best (zero, one or two).
 *
 * The question a best-play share cannot answer: a card that is rarely right
 * but decisive when it is. Measured naively (the winner's score minus the
 * second's, on the samples that picked the winner) every winner's lead is
 * inflated by its own luck. So the winner AND its runner-up are picked on one
 * half of the samples and the gap is measured on the other half, both ways
 * round. The two ways stay SEPARATE observations: averaging them per card
 * keeps a card's second pick only when it is also high on the half the first
 * pick is priced on — measured, +0.9 PV of lead between cards worth the same.
 */
export function crossFittedGainsWhenBest(branches: Pick<Branch, 'score' | 'samples'>[]): number[][] {
  const gains = (chooser: number[], judge: number[]): (number | null)[] => {
    const top = Math.max(...chooser);
    return chooser.map((c, i) => {
      if (c < top) return null;
      let runnerUp = -1;
      for (let j = 0; j < chooser.length; j++) {
        if (j !== i && (runnerUp < 0 || chooser[j] > chooser[runnerUp])) runnerUp = j;
      }
      return judge[i] - judge[runnerUp];
    });
  };
  const ways = (branches[0]?.samples.length ?? 0) < 2
    ? [gains(branches.map(b => b.score), branches.map(b => b.score))]
    : [gains(branches.map(b => half(b, 0)), branches.map(b => half(b, 1))),
      gains(branches.map(b => half(b, 1)), branches.map(b => half(b, 0)))];
  return branches.map((_, i) => ways.map(w => w[i]).filter((g): g is number => g !== null));
}

/**
 * What one position yielded: every legal card, priced.
 *
 * READ `value` AS A RANKING, NEVER AS A VERDICT. It is a card's score minus the
 * mean of its alternatives, so across one hand the values SUM TO ZERO by
 * arithmetic: a kit of five superb cards still shows two or three of them
 * negative, because half a hand is always below its own average. "Negative"
 * means "worse than the other things you could do right now", and nothing else.
 *
 * `wasBest` is the statistic that can speak in absolute terms — a card that is
 * never the right play is dead however good it looks on paper.
 */
export interface PositionValues {
  /**
   * What playing a RANDOM legal card here costs against the best one: the best
   * card's score minus the mean of every legal card's, cross-fitted so noise
   * alone costs nothing on average (`crossFittedCost`). Zero when every card
   * scores the same — a decision whose choice did not matter, which is
   * exactly what this number exists to count. Averaged over a kit's decisions
   * it says how much choosing matters at all.
   */
  choiceCost: number;
  /** Every legal card, priced. EMPTY when they all tied: such a position says
   *  nothing about which card is right, so it is no sample for `wasBest`. */
  cards: {
    id: string; value: number; score: number; won: number;
    /** Its lead over the runner-up, once per way round it was picked as the
     *  best play (`crossFittedGainsWhenBest`). */
    gainsWhenBest: number[];
    /** The SAME value computed on win probability instead of PV — the surrogate
     *  check. PV differential is only worth using if it agrees with the thing
     *  it stands in for, and that has to be measured rather than assumed. */
    winValue: number;
    /**
     * Was this the best-scoring card at this position? REPORTED, never judged:
     * with a handful of rollouts per card it cannot tell a useless card from a
     * harmless one in a fight the choice barely moves (NEXT-STEPS §27.3).
     * Still the ABSOLUTE statistic:
     * `value` is relative to the rest of the hand and sums to ~zero across it,
     * so it can rank cards and can never call one dead. "Never the right play"
     * can.
     *
     * Credited IN FULL to every card that reaches the top, not shared: the
     * question is whether the card is ever a right play, and a card tying for
     * best is. See the note at the computation.
     */
    wasBest: number;
  }[];
}

export interface RegretOptions {
  /**
   * How well the REST of the fight is played after the forced card.
   *
   * It was assumed the continuation policy's bias would difference away, since
   * both branches use the same one. MEASURED, and only half true: it cancels
   * the LEVEL and not the ORDERING. Mestre d'Armes at depth 0 ranks Atac
   * llampec first and Contraatac second; at depth 1 they swap, and the swap is
   * significant. The bottom of the ranking is stable at both.
   *
   * That is not only an artefact — a riposte card pays off exactly to the
   * extent that the continuation keeps defending sensibly, so "worth more under
   * better play" is a real property of a card. But it does mean the number is
   * quoted AT A DEPTH, and the default matches `CELL_AI` (depth 1), the same
   * depth the balancer prices encounters at. A harness measuring at one depth
   * while everything else reports another is the mismatch this bench was
   * cleaned up to remove.
   */
  rolloutDepth: number;
  /**
   * How GREEDILY everyone plays in the continuation — the engine's
   * `aiSharpness`.
   *
   * Not a taste knob, a measured BIAS. Sweeping it moves individual cards'
   * measured usage by 4–9× in relative terms, and it moves them most for
   * exactly the set-up cards this requirement calls dead (NEXT-STEPS §20.11).
   * A set-up card pays off against a RANGE of enemy replies; a greedy model
   * collapses every rollout onto one line, so the payoff either never appears
   * or is always punished.
   *
   * It is the same phenomenon `rolloutDepth` above already half-records — the
   * continuation "cancels the LEVEL and not the ORDERING" — one knob further
   * in.
   *
   * There is no defensible single value, so the analyzer does not pick one: it
   * measures under several and calls a card dead only if it is dead under all
   * of them. See `AnalyzeBudget.cardValueModels`.
   */
  continuationSharpness?: number;
  /**
   * Playouts averaged per candidate card at a position.
   *
   * SET BY A CONTROL, not by taste. `wasBest` asks which card topped a
   * position, so it needs the ranking WITHIN that position to be reliable —
   * and a noisy score lets a worthless card take the top spot by luck, which
   * drags its share up toward the 1/k null it is tested against. At 2 samples
   * a card that does literally nothing (`playtest/src/control-kits.ts`) scored 21.2%
   * against a 25% null and escaped the dead-card check; at 6 it scored 17.7%
   * and was caught. Lowering this re-opens that hole, and
   * `playtest/test/controls-cards.slow.test.ts` will say so.
   *
   * Costs linearly. It is affordable because fights are three rounds at the
   * median and a rollout is cheap.
   */
  samples: number;
  /** The seat being measured. */
  team: number;
}

export const DEFAULT_REGRET: RegretOptions = { rolloutDepth: 1, samples: 6, team: 0 };

/**
 * Force `actionIdx` for the actor in SEAT `seat` this round, AI for everyone
 * else, then finish the round. Mirrors `CombatEngine.runRound` with one
 * selection pinned.
 *
 * The seat is an INDEX, not a Character, and that is the whole reason this
 * function exists separately. `clone()` builds fresh Character objects, so
 * `sim.teams[t].indexOf(actorFromTheOriginalEngine)` is −1 — which
 * `planActions` reads as "no selection", quietly hands the seat back to the
 * AI, and makes every branch identical. It did: the first run of this harness
 * priced all five cards at exactly 0.00 ± 0.00.
 */
function forceRound(sim: CombatEngine, seat: number, actionIdx: number, team: number): void {
  const actor = sim.teams[team][seat];
  sim.prepareRound();
  sim.planActions(actor?.isAlive() ? [{ team, idx: seat, actionIdx }] : []);
  let step = sim.resolveNextAction();
  let guard = 0;
  while (step.kind !== 'done' && guard++ < 400) {
    // An empty target list hands targeting back to the engine, which is what
    // the AI would have got anyway.
    if (step.kind === 'target') sim.setResolveTarget([]);
    step = sim.resolveNextAction();
  }
  sim.finishRound();
}

/** Play one candidate card from this position and score where the fight ends. */
function rollout(
  engine: CombatEngine, seat: number, actionIdx: number, opts: RegretOptions, streamSeed: number,
): { score: number; won: number } {
  const sim = engine.clone();
  // Per-seat streams, or the pairing below holds only until the first card
  // that draws a different number of dice (`CombatEngine.seatStreamSeed`).
  sim.seatStreamSeed = streamSeed;
  // THE CLONE PLAYS ON ITS OWN POLICY, NOT THE HARNESS'S — the continuation
  // after the forced card has to be the policy `opts.rolloutDepth` names, or
  // the price of a card is the price of a card followed by whatever the
  // measuring harness happened to be driving with.
  //
  // This used to clear `actionChooser` AFTER installing the policy, which
  // cleared the policy: the clone then reached `planActions` with no chooser
  // at all and the engine threw for the first unforced seat. It threw rather
  // than falling back precisely so this could not pass silently.
  Object.assign(sim, aiPolicy({ depth: opts.rolloutDepth }));
  if (opts.continuationSharpness !== undefined) sim.aiSharpness = opts.continuationSharpness;
  forceRound(sim, seat, actionIdx, opts.team);
  const res = sim.runCombat();
  return {
    score: pvDifferential(sim, opts.team),
    won: res.winner === opts.team ? 1 : res.winner === null ? 0.5 : 0,
  };
}

/**
 * Price every card the actor could legally play from this position.
 *
 * COMMON RANDOM NUMBERS ACROSS THE BRANCHES, and this one is load-bearing: with
 * a fresh stream per branch the actor's three COMPANIONS would also pick
 * differently, and the difference between two branches would be "this card, and
 * also whatever the rest of the party happened to do". One seed per position
 * makes the companions' opening picks and the dice identical, so the branches
 * differ by the forced card and then by its consequences.
 */
export function valuePosition(
  engine: CombatEngine, actor: Character, opts: RegretOptions,
): PositionValues | null {
  const legal = availableActionIndices(actor, engine.registry);
  // One legal card is not a decision, and a card with no alternative has no
  // value relative to anything.
  if (legal.length < 2) return null;

  const seat = engine.teams[opts.team].indexOf(actor);
  if (seat < 0) {
    throw new Error(
      'valuePosition: the actor is not in the team it was given. Seats are resolved by INDEX '
      + 'on each clone, so a mismatch here would silently price every card at zero.',
    );
  }

  const seed = Math.floor(random() * 1e9);
  const branches: Branch[] = legal.map(actionIdx => {
    let won = 0;
    const samples: number[] = [];
    for (let s = 0; s < opts.samples; s++) {
      const r = withSeed(seed + s * 7919, () => rollout(engine, seat, actionIdx, opts, seed + s * 7919));
      samples.push(r.score);
      won += r.won;
    }
    return {
      actionIdx, cardId: actor.actions[actionIdx].def.id,
      score: samples.reduce((a, x) => a + x, 0) / opts.samples, won: won / opts.samples, samples,
    };
  });

  const top = Math.max(...branches.map(b => b.score));
  const bottom = Math.min(...branches.map(b => b.score));
  const choiceCost = crossFittedCost(branches);
  // A POSITION WHERE EVERY CARD SCORES THE SAME SAYS NOTHING ABOUT WHICH CARD
  // IS RIGHT. Short fights reach plenty of them: once the outcome is settled,
  // every branch plays out to the same board. Every card would collect a full
  // `wasBest` from a position that told us nothing, so it is no sample for the
  // best-share — but it IS a decision whose choice cost nothing, and
  // `choiceCost` counts it as exactly that.
  //
  // Caught by a control kit holding a card that does literally nothing
  // (`playtest/src/control-kits.ts`): with decided positions counted, the no-op
  // ranked dead last by value, as it must, and still read alive.
  if (top === bottom) return { choiceCost: 0, cards: [] };

  const gainsWhenBest = crossFittedGainsWhenBest(branches);
  return {
    choiceCost,
    cards: branches.map((b, i) => {
      const others = branches.filter((_, j) => j !== i);
      const mean = others.reduce((n, o) => n + o.score, 0) / others.length;
      const wonMean = others.reduce((n, o) => n + o.won, 0) / others.length;
      // A TIE FOR BEST IS CREDITED IN FULL TO EVERY CARD THAT REACHES IT.
      //
      // The question is "is this card ever the right play", and if two cards
      // tie for best then playing either one IS a right play. Splitting the
      // credit answers a different question — "is it UNIQUELY the best" — and
      // it punishes a kit for holding two good cards: two IDENTICAL attacks
      // each took half of every tie, landing both at 19.7% against a 25% null
      // and reading DEAD, while the no-op beside them escaped.
      //
      // Full credit was tried first and inflated the total to ~127% of
      // positions, which is why it was split. That inflation was not the ties
      // between real cards — it was DECIDED positions, where the outcome is
      // already settled and every card scores the same. Those are now dropped
      // above as the non-decisions they are, and the inflation goes with them.
      const isBest = b.score >= top ? 1 : 0;
      return {
        id: b.cardId,
        // AGAINST THE MEAN ALTERNATIVE, because it is UNBIASED: a value
        // against the best alternative takes a max over noisy estimates and
        // inherits the winner's curse.
        value: b.score - mean,
        score: b.score,
        won: b.won,
        winValue: b.won - wonMean,
        wasBest: isBest,
        gainsWhenBest: gainsWhenBest[i],
      };
    }),
  };
}

// --- Running it over a whole kit ---------------------------------------------
// ONE implementation, used by both the `card-value.ts` CLI and the kit
// analyzer's requirement 3. The last time this package had two ways to
// compute one measurement it had three, and they disagreed (`cells.ts`,
// `instrument`). It takes a `setupFor` rather than importing the analyzer's,
// so it stays content-agnostic and nothing here points back at the analyzer.

import { theRegistry } from './arena.js';
import { countedCached, key } from './cache.js';
import { CELL_AI, type CellSetup } from './cells.js';
import { theSet, type Cell } from './gameset.js';
import { SMOKE } from './games.js';

/** Every observation of one card: what it was worth at a position, and which
 *  FIGHT that position came from — positions inside a fight are not
 *  independent, so the fight is the cluster the error bar is built on. */
export interface CardObs { value: number; winValue: number; wasBest: number; gainsWhenBest: number[]; fight: number }

/** One decision's `choiceCost`, and the fight it came from (the cluster). */
export interface DecisionCost { cost: number; fight: number }

export interface KitValues {
  byCard: Map<string, CardObs[]>;
  /** Every decision the subject faced with two or more legal cards. */
  costs: DecisionCost[];
  /** Decisions that separated the cards — the best-share's sample. */
  positions: number;
  fights: number;
}

/** Base seed. Fixed, so two runs of this over unchanged content agree. */
export const REGRET_SEED = 909_000;

/**
 * Play fights across the cells and price the subject's whole hand at every
 * decision it faces.
 *
 * The REAL fight is played by the real policy, so the positions visited are the
 * ones the game actually reaches; only the counterfactual branches roll out
 * cheaply. That asymmetry is deliberate — the question is what a card is worth
 * in play, not in a position nobody would be in.
 */
export function measureKit(
  cells: Cell[],
  setupFor: (cell: Cell) => CellSetup,
  games: number,
  opts: Omit<RegretOptions, 'team'> = DEFAULT_REGRET,
  /** What the subject is, for the cache key (`subjectPrintFor`); omit to measure uncached. */
  subjectPrint?: string,
): KitValues {
  const byCard = new Map<string, CardObs[]>();
  const costs: DecisionCost[] = [];
  let positions = 0, fights = 0;
  for (let i = 0; i < cells.length; i++) {
    const r = measureKitCell(cells, i, setupFor, games, opts, subjectPrint);
    // Fight ids are per cell; offset them so clusters never merge across cells.
    for (const [id, list] of r.obs) {
      const all = byCard.get(id) ?? [];
      for (const o of list) all.push({ ...o, fight: o.fight + fights });
      byCard.set(id, all);
    }
    for (const c of r.costs) costs.push({ cost: c.cost, fight: c.fight + fights });
    positions += r.positions;
    fights += r.fights;
  }
  return { byCard, costs, positions, fights };
}

/**
 * ONE CELL of `measureKit` — its own entry point so a warm worker can fill the
 * very cache entry `measureKit` will read (bench/parallel.ts). Same arguments
 * as `measureKit` plus the cell's index: the per-cell sample is derived from
 * the whole cell list, and deriving it anywhere else would key a different
 * entry that nothing reads.
 */
export function measureKitCell(
  cells: Cell[],
  cellIdx: number,
  setupFor: (cell: Cell) => CellSetup,
  games: number,
  opts: Omit<RegretOptions, 'team'> = DEFAULT_REGRET,
  subjectPrint?: string,
): CellValues {
  // A smoke run measures nothing, it only has to EXECUTE — and the fight floor
  // (one per cell) does not make that cheap: every decision is still valued by
  // `samples` depth-1 rollouts per legal card, which kept a six-kit smoke over
  // its timeout. One sample runs every line of the same code.
  if (SMOKE) opts = { ...opts, samples: 1 };
  const per = Math.max(1, Math.round(games / Math.max(1, cells.length)));
  const cell = cells[cellIdx];
  // PER CELL, and CACHED like a cell run: it is seeded per cell, so the same
  // content measures the same observations — and this is the most expensive
  // phase of a kit analysis, which a sweep otherwise re-paid on every run.
  const compute = (): CellValues => measureCell(cell, setupFor(cell), per, opts);
  return subjectPrint
    ? countedCached<CellValues>('regret', key('regret-v2', subjectPrint, `${cell.label}@${cell.baseline.toFixed(4)}`, cell.context,
      String(per), JSON.stringify(opts)), compute)
    : compute();
}

/** One cell's observations, JSON-shaped so the cache can hold them. */
export interface CellValues { obs: [string, CardObs[]][]; costs: DecisionCost[]; positions: number; fights: number }

/**
 * Who gets hit in a card-value fight: the production AI's choice, as in every
 * cell arm. The forced card is what varies; targeting must not — the first
 * version used the engine's first-in-line default here, the same mismatch
 * that biased every kit delta (NEXT-STEPS §25.3, F13).
 */
const TARGETS = aiPolicy(CELL_AI).targetChooser;

function measureCell(cell: Cell, setup: CellSetup, per: number, opts: Omit<RegretOptions, 'team'>): CellValues {
  const byCard = new Map<string, CardObs[]>();
  const costs: DecisionCost[] = [];
  let positions = 0, fights = 0;
  withSeed(REGRET_SEED + cell.shapeIdx * 101 + cell.companyIdx * 17, () => {
    for (let g = 0; g < per; g++) {
      const players = theSet().buildParty(setup.party);
      _setAI(players);
      const engine = new CombatEngine(players, theSet().buildEncounter(setup.enemies), {
        registry: theRegistry(), maxRounds: 40, actionChooser: _look(CELL_AI), targetChooser: TARGETS,
      });
      const subject = engine.teams[setup.subjectTeam][0];
      const fight = fights++;
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
        if (subject?.isAlive()) {
          const priced = valuePosition(engine, subject, { ...opts, team: setup.subjectTeam });
          if (priced) costs.push({ cost: priced.choiceCost, fight });
          if (priced?.cards.length) {
            positions++;
            for (const c of priced.cards) {
              const list = byCard.get(c.id) ?? [];
              list.push({ value: c.value, winValue: c.winValue, wasBest: c.wasBest, gainsWhenBest: c.gainsWhenBest, fight });
              byCard.set(c.id, list);
            }
          }
        }
        engine.runRound();
      }
    }
  });
  return { obs: [...byCard], costs, positions, fights };
}

/**
 * 1σ CLUSTERED BY FIGHT. Positions inside one combat share its dice, its
 * seating and its whole history, so treating them as independent divides the
 * error by the root of a number far larger than the real one. The cluster is
 * the fight; the observation is its mean.
 */
export function clusteredStderr<T extends { fight: number }>(
  obs: T[], pick: (o: T) => number,
): { mean: number; stderr: number; clusters: number } {
  const byFight = new Map<number, number[]>();
  for (const o of obs) byFight.set(o.fight, [...(byFight.get(o.fight) ?? []), pick(o)]);
  const means = [...byFight.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length);
  const n = means.length;
  const mean = means.reduce((a, b) => a + b, 0) / Math.max(1, n);
  if (n < 2) return { mean, stderr: Infinity, clusters: n };
  const variance = means.reduce((s, m) => s + (m - mean) ** 2, 0) / (n - 1);
  return { mean, stderr: Math.sqrt(variance / n), clusters: n };
}

/**
 * A mean over observations whose NUMBER per fight depends on the noise — a
 * ratio Σx / Σn, with its 1σ still clustered by fight (the linearised ratio
 * variance).
 *
 * `clusteredStderr` averages per-fight means, which weights every fight
 * equally. That is right when a fight's observation count has nothing to do
 * with their values, and wrong for `gainsWhenBest`: a card picked as the best
 * on BOTH halves of a position's samples contributes two observations, and
 * those are the replicated wins; one picked on a single half contributes one,
 * usually a loss. Averaged per fight, twin cards worth exactly the same read
 * −2 PV; per observation, zero (NEXT-STEPS §27.3).
 */
export function clusteredRatio<T extends { fight: number }>(
  obs: T[], pick: (o: T) => number,
): { mean: number; stderr: number; clusters: number } {
  const byFight = new Map<number, { sum: number; n: number }>();
  for (const o of obs) {
    const f = byFight.get(o.fight) ?? { sum: 0, n: 0 };
    f.sum += pick(o); f.n += 1;
    byFight.set(o.fight, f);
  }
  const fights = [...byFight.values()];
  const total = fights.reduce((a, f) => a + f.n, 0);
  const mean = fights.reduce((a, f) => a + f.sum, 0) / Math.max(1, total);
  const k = fights.length;
  if (k < 2) return { mean, stderr: Infinity, clusters: k };
  const resid = fights.reduce((a, f) => a + (f.sum - mean * f.n) ** 2, 0);
  return { mean, stderr: Math.sqrt((k / (k - 1)) * resid) / total, clusters: k };
}

/** One card's verdict-ready summary. */
export interface CardScore {
  id: string;
  /** Mean value against the average alternative — a RANKING within the hand,
   *  summing to ~zero across it. Never a verdict on its own. */
  value: number;
  stderr: number;
  /** Share of the positions that separated the cards where it was the best
   *  play. The ABSOLUTE statistic: judged against fixed bars, never against
   *  the rest of the hand. */
  bestShare: number;
  bestStderr: number;
  /** Its mean lead over the runner-up in the positions where it was the best
   *  play, and that mean's 1σ; null when it never was. */
  gainWhenBest: number | null;
  gainWhenBestStderr: number | null;
  /** The same value on win probability — the surrogate check. */
  winValue: number;
  observations: number;
}

export function scoreCards(kit: KitValues): CardScore[] {
  const out: CardScore[] = [];
  for (const [id, list] of kit.byCard) {
    const v = clusteredStderr(list, o => o.value);
    const w = clusteredStderr(list, o => o.winValue);
    const b = clusteredStderr(list, o => o.wasBest);
    const whenBest = list.flatMap(o => o.gainsWhenBest.map(gain => ({ gain, fight: o.fight })));
    const g = whenBest.length ? clusteredRatio(whenBest, o => o.gain) : null;
    out.push({
      id, value: v.mean, stderr: v.stderr,
      bestShare: b.mean, bestStderr: b.stderr,
      gainWhenBest: g ? g.mean : null, gainWhenBestStderr: g ? g.stderr : null,
      winValue: w.mean, observations: list.length,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

/** How much choosing matters for this kit: the mean `choiceCost` over every
 *  decision, clustered by fight. Zero decisions is a mean of zero — a kit that
 *  never offers a choice is one where choosing never mattered. */
export function kitChoiceCost(kit: KitValues): { mean: number; stderr: number; decisions: number } {
  if (!kit.costs.length) return { mean: 0, stderr: 0, decisions: 0 };
  const c = clusteredStderr(kit.costs, o => o.cost);
  return { mean: c.mean, stderr: c.stderr, decisions: kit.costs.length };
}
