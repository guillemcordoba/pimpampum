/**
 * WHAT A CARD IS WORTH, MEASURED AT THE MOMENT IT IS PLAYED.
 *
 * The leave-one-out ablation (`kit-analyzer-lib.ts`, requirement 4/5) asks what
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

/** One card's score at one position, and whether that branch went on to win. */
interface Branch { actionIdx: number; cardId: string; score: number; won: number }

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
  cards: {
    id: string; value: number; valueVsBest: number; score: number; won: number;
    /** The SAME value computed on win probability instead of PV — the surrogate
     *  check. PV differential is only worth using if it agrees with the thing
     *  it stands in for, and that has to be measured rather than assumed. */
    winValue: number;
    /**
     * Was this the best-scoring card at this position? The ABSOLUTE statistic:
     * `value` is relative to the rest of the hand and sums to ~zero across it,
     * so it can rank cards and can never call one dead. "Never the right play"
     * can.
     *
     * Credited IN FULL to every card that reaches the top, not shared: the
     * question is whether the card is ever a right play, and a card tying for
     * best is. See the note at the computation.
     */
    wasBest: number;
    /**
     * How many cards were credited at the top HERE, and out of how many.
     *
     * These give the card's own chance null: if m of k cards reach the top at a
     * position, a card picked at random is among them with probability m/k. A
     * flat 1/k is only right when exactly one card can win, and ties are
     * credited in full — so with m averaging 1.5 on a four-card hand, 1/k
     * understates what chance alone hands out by half again, and every card
     * gets compared to a line that is too low to catch anything.
     *
     * Computed rather than assumed, so the null stays correct if the tie rule
     * ever changes again.
     */
    topCount: number;
    candidates: number;
  }[];
  /** How many cards were on offer — `valueVsBest` is a max over this many
   *  noisy estimates, so the winner's curse scales with it. */
  alternatives: number;
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
   * a card that does literally nothing (`bench/control-kits.ts`) scored 21.2%
   * against a 25% null and escaped the dead-card check; at 6 it scored 17.7%
   * and was caught. Lowering this re-opens that hole, and
   * `requirement-controls.test.ts` will say so.
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
  engine: CombatEngine, seat: number, actionIdx: number, opts: RegretOptions,
): { score: number; won: number } {
  const sim = engine.clone();
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
    let score = 0, won = 0;
    for (let s = 0; s < opts.samples; s++) {
      const r = withSeed(seed + s * 7919, () => rollout(engine, seat, actionIdx, opts));
      score += r.score;
      won += r.won;
    }
    return {
      actionIdx, cardId: actor.actions[actionIdx].def.id,
      score: score / opts.samples, won: won / opts.samples,
    };
  });

  // A POSITION WHERE EVERY CARD SCORES THE SAME IS NOT A DECISION.
  //
  // Short fights reach plenty of them: once the outcome is settled, every
  // branch plays out to the same board and all candidates tie. A tie is SHARED
  // (see `wasBest`), so each card collects 1/k from a position that told us
  // nothing — and 1/k is exactly the chance null. Decided positions therefore
  // drag every card's best-share toward the very line it is tested against,
  // and a card that is NEVER worth playing stops looking like one.
  //
  // Caught by a control kit holding a card that does literally nothing
  // (`bench/control-kits.ts`): the no-op ranked dead last by value, as it must,
  // and still cleared its null. Dropping these positions is not throwing away
  // data — there was none in them.
  const top = Math.max(...branches.map(b => b.score));
  const bottom = Math.min(...branches.map(b => b.score));
  if (top === bottom) return null;

  return {
    alternatives: branches.length - 1,
    cards: branches.map((b, i) => {
      const others = branches.filter((_, j) => j !== i);
      const mean = others.reduce((n, o) => n + o.score, 0) / others.length;
      const best = Math.max(...others.map(o => o.score));
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
      const topCount = branches.filter(o => o.score >= top).length;
      return {
        id: b.cardId,
        // AGAINST THE MEAN ALTERNATIVE is the headline, because it is
        // UNBIASED. `valueVsBest` takes a max over noisy estimates and is
        // therefore inflated by the winner's curse — which here pushes every
        // card's value DOWN, since the max sits on the subtracting side.
        value: b.score - mean,
        valueVsBest: b.score - best,
        score: b.score,
        won: b.won,
        winValue: b.won - wonMean,
        wasBest: isBest,
        candidates: branches.length,
        topCount,
      };
    }),
  };
}

// --- Running it over a whole kit ---------------------------------------------
// ONE implementation, used by both the `card-value.ts` CLI and the kit
// analyzer's requirement 4/5. The last time this package had two ways to
// compute one measurement it had three, and they disagreed (`cells.ts`,
// `instrument`). It takes a `setupFor` rather than importing the analyzer's,
// so it stays content-agnostic and nothing here points back at the analyzer.

import { theRegistry } from './arena.js';
import { CELL_AI, type CellSetup } from './cells.js';
import { theSet, type Cell } from './gameset.js';

/** Every observation of one card: what it was worth at a position, and which
 *  FIGHT that position came from — positions inside a fight are not
 *  independent, so the fight is the cluster the error bar is built on. */
export interface CardObs {
  value: number; winValue: number; wasBest: number;
  candidates: number; topCount: number; fight: number;
}

export interface KitValues {
  byCard: Map<string, CardObs[]>;
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
): KitValues {
  const byCard = new Map<string, CardObs[]>();
  const per = Math.max(1, Math.round(games / Math.max(1, cells.length)));
  let positions = 0, fights = 0;

  for (const cell of cells) {
    const setup = setupFor(cell);
    withSeed(REGRET_SEED + cell.shapeIdx * 101 + cell.companyIdx * 17, () => {
      for (let g = 0; g < per; g++) {
        const players = theSet().buildParty(setup.party);
        _setAI(players);
        const engine = new CombatEngine(players, theSet().buildEncounter(setup.enemies), {
          registry: theRegistry(), maxRounds: 40, actionChooser: _look(CELL_AI),
        });
        const subject = engine.teams[setup.subjectTeam][0];
        const fight = fights++;
        let guard = 0;
        while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
          if (subject?.isAlive()) {
            const priced = valuePosition(engine, subject, { ...opts, team: setup.subjectTeam });
            if (priced) {
              positions++;
              for (const c of priced.cards) {
                const list = byCard.get(c.id) ?? [];
                list.push({
                  value: c.value, winValue: c.winValue,
                  wasBest: c.wasBest, candidates: c.candidates, topCount: c.topCount, fight,
                });
                byCard.set(c.id, list);
              }
            }
          }
          engine.runRound();
        }
      }
    });
  }
  return { byCard, positions, fights };
}

/**
 * 1σ CLUSTERED BY FIGHT. Positions inside one combat share its dice, its
 * seating and its whole history, so treating them as independent divides the
 * error by the root of a number far larger than the real one. The cluster is
 * the fight; the observation is its mean.
 */
export function clusteredStderr(
  obs: CardObs[], pick: (o: CardObs) => number = o => o.value,
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

/** One card's verdict-ready summary. */
export interface CardScore {
  id: string;
  /** Mean value against the average alternative — a RANKING within the hand,
   *  summing to ~zero across it. Never a verdict on its own. */
  value: number;
  stderr: number;
  /** Share of positions where it was the best play, and what chance alone
   *  would have given it. The ABSOLUTE statistic: clearly under its own null
   *  means the game never wants it played. */
  bestShare: number;
  nullShare: number;
  bestStderr: number;
  /** The same value on win probability — the surrogate check. */
  winValue: number;
  observations: number;
}

export function scoreCards(kit: KitValues): CardScore[] {
  const out: CardScore[] = [];
  for (const [id, list] of kit.byCard) {
    const v = clusteredStderr(list);
    const w = clusteredStderr(list, o => o.winValue);
    const b = clusteredStderr(list, o => o.wasBest);
    out.push({
      id, value: v.mean, stderr: v.stderr,
      bestShare: b.mean, bestStderr: b.stderr,
      nullShare: list.reduce((a, o) => a + o.topCount / o.candidates, 0) / list.length,
      winValue: w.mean, observations: list.length,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}
