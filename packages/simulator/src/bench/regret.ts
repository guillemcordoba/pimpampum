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
  Character, CombatEngine, availableActionIndices, random, withSeed,
} from '@pimpampum/engine';

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
    /** Was this the best-scoring card at this position? The ABSOLUTE statistic:
     *  `value` is relative to the rest of the hand and sums to ~zero across it,
     *  so it can rank cards and can never call one dead. "Never the right
     *  play" can. Its null is 1/k, not 0 — with k noisy candidates a card wins
     *  by luck about one time in k. */
    wasBest: number;
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
  /** Playouts averaged per candidate card at a position. */
  samples: number;
  /** The seat being measured. */
  team: number;
}

export const DEFAULT_REGRET: RegretOptions = { rolloutDepth: 1, samples: 2, team: 0 };

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
  sim.aiDepth = opts.rolloutDepth;
  sim.actionChooser = undefined;   // the clone's own policy, not the harness's
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

  return {
    alternatives: branches.length - 1,
    cards: branches.map((b, i) => {
      const others = branches.filter((_, j) => j !== i);
      const mean = others.reduce((n, o) => n + o.score, 0) / others.length;
      const best = Math.max(...others.map(o => o.score));
      const wonMean = others.reduce((n, o) => n + o.won, 0) / others.length;
      const isBest = b.score >= Math.max(...branches.map(o => o.score)) ? 1 : 0;
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
      };
    }),
  };
}
