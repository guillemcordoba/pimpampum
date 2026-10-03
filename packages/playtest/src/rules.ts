/**
 * THE REQUIREMENT RULES — every decision a requirement makes, as a pure
 * function of numbers already measured, plus the bars they are judged against.
 *
 * Kept apart from the measuring so they can be tested on inputs whose answer is
 * known (`test/rules.test.ts`), exactly as the pipeline is tested on kits whose
 * answer is known (the controls). A rule that is only ever exercised by real
 * data is a rule nobody has checked — and the one that was not extracted was the
 * only mutant to survive the first mutation run.
 *
 * FOUR REQUIREMENTS, one intention each (intentions.md; NEXT-STEPS §27.3):
 *
 *  1. FIGHTS END — "combats should not go on for more than ~5 rounds".
 *  2. INSIDE THE POWER BAND — "builds balanced at equal skill-level sum".
 *  3. CHOOSING MATTERS — "good decisions should matter more than powerful
 *     actions": a random pick must clearly cost against the best one; and no
 *     card is NEVER the right play ("nor so bad it never sees play").
 *  4. THE STRATEGY TRIANGLE — Power > Protect > Aggro > Power. Set-level.
 *
 * EVERY VERDICT FAILS ONLY ON WHAT IS CLEARLY PAST ITS BAR — the 2σ interval,
 * never the point estimate. A ❌ means "go and look", and a false one costs a
 * session.
 */
import { deltaStderr, exact, stderr } from '@pimpampum/bench';

// --- 1. Fights end ------------------------------------------------------------

/** Rounds budget from intentions.md: combats should not run past ~5. */
export const MAX_MEDIAN_ROUNDS = 5;
export const MAX_P90_ROUNDS = 8;
/** Fights that never end. Separate from the two length bars because it is a
 *  different failure: a stalemate is not a slow fight, it is no fight. */
export const MAX_STALL_RATE = 0.02;

/**
 * Do fights end?
 *
 * THREE SEPARATE FAILURES, reported separately. "Drags" and "never ends" are
 * different problems with different fixes, and collapsing them into one boolean
 * sent every reader of a X here to look at the wrong number: measured
 * 2026-09-20, every kit failed this on the DRAW RATE while its median (3) and
 * p90 (6) sat comfortably inside their bars.
 */
export function durationVerdict(
  medianRounds: number, p90Rounds: number, stallRate: number,
  maxMedian: number, maxP90: number, maxStalls: number,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (medianRounds > maxMedian) reasons.push(`mediana ${medianRounds} > ${maxMedian}`);
  if (p90Rounds > maxP90) reasons.push(`p90 ${p90Rounds} > ${maxP90}`);
  if (stallRate >= maxStalls) reasons.push(`encallats ≥ ${exact(maxStalls)} (combats que no acaben MAI)`);
  return { ok: reasons.length === 0, reasons };
}

// --- 2. Inside the power band ----------------------------------------------------

/**
 * How far a kit at full level may sit from the neutral stand-in, in winrate:
 * fifteen points either side of an even fight.
 */
export const KIT_BAND = 0.15;

/**
 * Is the kit CLEARLY outside the band? Fails only when the whole 2σ interval
 * sits beyond it — a verdict must be about the kit, not about a thin sample.
 */
export function strengthVerdict(delta: number, se: number, band: number): { ok: boolean; side: 'above' | 'below' | null } {
  if (delta - 2 * se > band) return { ok: false, side: 'above' };
  if (delta + 2 * se < -band) return { ok: false, side: 'below' };
  return { ok: true, side: null };
}

// --- 3. Choosing matters ------------------------------------------------------
//
// Judged on the per-decision card value (`bench/regret.ts`): the fight played
// out once per legal card from a shared position. Never on how often the AI
// played a card — that would make the evaluator the judge of the content it
// serves.
//
// NOT ON A CARD'S SHARE OF DECISIONS AS THE BEST PLAY. Judged against a dead
// floor (5%) and an automatic ceiling (85%), its controls failed: in a fight
// the subject's choice barely moves, a card that does NOTHING was the best
// play in 25–30% of decisions, at six rollouts and at twenty-four. The share
// cannot tell a useless card from a harmless one (NEXT-STEPS §27.3).

/**
 * How much choosing must matter: the mean PV a RANDOM legal card loses against
 * the best one, per decision (`kitChoiceCost`). PV is the fight's differential
 * — the subject side's PV minus the enemies' — at the end of the rollout.
 *
 * Cross-fitted (`crossFittedCost`), so noise alone costs nothing: two cards
 * worth the same, scored with rollout noise, read zero rather than the max of
 * the noise.
 */
export const MIN_CHOICE_COST = 1;
// ONE POINT OF HEALTH per decision: the smallest cost a player could feel. It
// sits between the controls that must fail (identical cards cost exactly
// nothing, twins differing only by noise read zero) and the one that must pass
// (a two-card combo); the measured values, dated, are in NEXT-STEPS §27.3.

/** Does choosing CLEARLY matter too little? A kit that never offers a choice
 *  (zero decisions) is one where choosing never mattered, and fails. */
export function choiceMattersVerdict(meanCost: number, se: number, bar: number): boolean {
  return meanCost + 2 * se >= bar;
}

/**
 * A card is NEVER THE RIGHT PLAY when, even in the moments it looks best, the
 * runner-up is clearly better on fresh rollouts: its cross-fitted lead when
 * best (`gainWhenBest`) is CLEARLY below zero. A workhorse tied with the
 * alternative reads about zero and passes; so do twin cards, each the other's
 * runner-up; a card that only tops positions by luck reads negative.
 *
 * `gain` null means it was never picked as the best at all — never right,
 * once it has had `MIN_CARD_DECISIONS` chances.
 */
export function isNeverRight(gain: number | null, se: number | null, decisions: number): boolean {
  if (decisions < MIN_CARD_DECISIONS) return false;
  if (gain === null || se === null) return true;
  return gain + 2 * se < 0;
}

/** Decisions a card must have been legal in before it is judged at all. */
export const MIN_CARD_DECISIONS = 30;

// --- 4. The strategy triangle ----------------------------------------------------

/**
 * Mirror fights per edge, across both seats. A 2σ interval of ±3.5pp around an
 * even duel: enough to tell a real edge from a coin flip, which is all an
 * ordering claims.
 */
export const TRIANGLE_GAMES = 800;

/** Does `winrate` (the claimed winner's, over `games`) CLEARLY beat an even
 *  duel? Draws count ½, so a stalemate reads as no edge — as it should. */
export function edgeHolds(winrate: number, games: number): boolean {
  return winrate - 2 * stderr(winrate, games) > 0.5;
}

/** The whole triangle: every edge must hold. Returns the edges that do not. */
export function triangleVerdict(edges: { winner: string; loser: string; winrate: number; games: number }[]): {
  ok: boolean; broken: string[];
} {
  const broken = edges.filter(e => !edgeHolds(e.winrate, e.games)).map(e => `${e.winner} > ${e.loser}`);
  return { ok: broken.length === 0, broken };
}

// --- The armour sweet spot (set-level, not a kit requirement) ---------------------

/**
 * THE ARMOUR SWEET SPOT (intentions.md): armour is worth carrying on SOME of
 * the party and not on all of it. What its bonus buys (fewer points through
 * every hit) and what it costs (speed — the wearer's guards and blows land
 * later) must balance so that a few members are right to wear it and a whole
 * party in it is wrong.
 *
 * `curve[k]` is the party's winrate with `k` members wearing the armour, the
 * rest bare, from `0` to the whole party. The rule passes when some INTERIOR
 * count — neither nobody nor everybody — CLEARLY beats both ends: its 2σ
 * interval clears zero against the bare party AND against the fully armoured
 * one. Flat curves fail, as they must: "armour makes no difference" is not a
 * sweet spot, however harmless.
 *
 * Several interior counts are looked at, so the best of them is favoured by
 * its noise (the winner's curse). `deltaStderr` treats the arms as independent
 * while they are played on common random numbers, which overstates the
 * difference's noise and pays that back; the controls in `rules.test.ts` hold
 * the null silent.
 */
export interface ArmourPoint { worn: number; winrate: number; games: number }

export function sweetSpotVerdict(curve: ArmourPoint[]): {
  ok: boolean;
  /** The interior count that does best, whether or not it clears the bar. */
  best: number | null;
  reasons: string[];
} {
  const sorted = [...curve].sort((a, b) => a.worn - b.worn);
  if (sorted.length < 3) return { ok: false, best: null, reasons: ['cal almenys tres punts: ningú, alguns, tothom'] };
  const none = sorted[0], all = sorted[sorted.length - 1];
  const interior = sorted.slice(1, -1);
  const clearly = (a: ArmourPoint, b: ArmourPoint) =>
    a.winrate - b.winrate - 2 * deltaStderr(a.winrate, a.games, b.winrate, b.games) > 0;
  const winner = interior.find(p => clearly(p, none) && clearly(p, all));
  const best = interior.reduce((m, p) => (p.winrate > m.winrate ? p : m));
  if (winner) return { ok: true, best: winner.worn, reasons: [] };
  const reasons: string[] = [];
  if (!clearly(best, none)) reasons.push(`${best.worn} amb armadura no supera clarament ningú amb armadura`);
  if (!clearly(best, all)) reasons.push(`${best.worn} amb armadura no supera clarament tothom amb armadura`);
  return { ok: false, best: best.worn, reasons };
}
