/**
 * THE MATCH — is one AI stronger than another? The question that accepts or
 * rejects an AI change, asked the way chess engines ask it (Fishtest): the two
 * play each other and a sequential test stops as soon as the answer is clear.
 * Fixing some stored positions is not the test; a fix that mends three and
 * breaks two can leave the AI no better at all.
 *
 *   DUPLICATE  every game is played twice on the same seed with the AIs
 *              swapped between the sides, so the dice and the position's own
 *              lean cancel: what is left is who played better.
 *   SPRT       observations are compared against "no difference" and against
 *              "better (or worse) by δ"; the match stops when one hypothesis is
 *              ahead by the error bounds, so a clear answer costs few positions.
 *
 * Both AIs must run on the SAME engine (same module, same random source): an
 * engine difference would be measured as a strength difference, and an AI
 * with its own copy of the engine would roll dice the seed does not control.
 */
import { withSeed, type Character, type CombatEngine } from '@pimpampum/engine';
import type { Policy } from '../index.js';
import { buildEngine, type Position } from './position.js';
import { outcome } from './referee.js';

/** Each team decides with its own AI. */
export function twoHeaded(team0: Policy, team1: Policy): Policy {
  const of = (c: Character): Policy => (c.team === 0 ? team0 : team1);
  return {
    actionChooser: (e, a) => of(a).actionChooser(e, a),
    targetChooser: (e, a, ...rest) => of(a).targetChooser(e, a, ...rest),
  };
}

function playGame(pos: Position, team0: Policy, team1: Policy, seed: number): number {
  return withSeed(seed, () => {
    const e: CombatEngine = buildEngine(pos, twoHeaded(team0, team1), { ai: true });
    e.runCombat();
    return outcome(e);
  });
}

/**
 * One duplicate pair: the candidate's result, in [−1, 1], averaged over its
 * two seats — +1 it won both, 0 the seats split the same way either round.
 * Policies are made fresh per game: an AI caches its round plan.
 */
export function playPair(pos: Position, candidate: () => Policy, baseline: () => Policy, seed: number): number {
  const asA = playGame(pos, candidate(), baseline(), seed);
  const asB = -playGame(pos, baseline(), candidate(), seed);
  return (asA + asB) / 2;
}

export type MatchVerdict = 'better' | 'worse' | 'equal' | 'undecided';

export interface SprtState {
  n: number;
  mean: number;
  /** Standard error of the mean. */
  se: number;
  /** Log-likelihood ratios of "better by δ" and "worse by δ", each against "no difference". */
  llrBetter: number;
  llrWorse: number;
  verdict: MatchVerdict;
}

/**
 * The sequential test, normal approximation with the variance estimated from
 * the observations (as Fishtest's), and never before `minN` observations: a
 * spread estimated from a few dozen of them is itself too noisy, and an early
 * stop on it is the over-eager kind. `better`/`worse`: that hypothesis beat
 * "no difference" at error rates α, β. `equal`: "no difference" beat both.
 */
export function sprt(xs: readonly number[], delta: number, alpha = 0.05, beta = 0.05, minN = 100): SprtState {
  const n = xs.length;
  const mean = n ? xs.reduce((s, x) => s + x, 0) / n : 0;
  const variance = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const se = n > 1 ? Math.sqrt(variance / n) : Infinity;
  // A sample with no spread yet says nothing about the spread to come.
  const v = Math.max(variance, 1e-3);
  const sum = mean * n;
  const llrBetter = (delta / v) * (sum - n * delta / 2);
  const llrWorse = (delta / v) * (-sum - n * delta / 2);
  const upper = Math.log((1 - beta) / alpha);
  const lower = Math.log(beta / (1 - alpha));
  const verdict: MatchVerdict = n < minN ? 'undecided'
    : llrBetter >= upper ? 'better'
      : llrWorse >= upper ? 'worse'
        : llrBetter <= lower && llrWorse <= lower ? 'equal'
          : 'undecided';
  return { n, mean, se, llrBetter, llrWorse, verdict };
}
