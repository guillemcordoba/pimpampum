/**
 * THE REQUIREMENT RULES — every decision `analyze` makes, as a pure function of
 * numbers already measured, plus the bars and samples they are judged against.
 *
 * Kept apart from the measuring so they can be tested on inputs whose answer is
 * known (`test/rules.test.ts`), exactly as the pipeline is tested on kits whose
 * answer is known (the controls). A rule that is only ever exercised by real
 * data is a rule nobody has checked — and the one that was not extracted was the
 * only mutant to survive the first mutation run.
 */
import { deltaStderr, exact, gamesFor, stderr } from '@pimpampum/bench';

/** Rounds budget from intentions.md: combats should not run past ~5. */
export const MAX_MEDIAN_ROUNDS = 5;
export const MAX_P90_ROUNDS = 8;
/** Fights that never end. Separate from the two length bars because it is a
 *  different failure: a stalemate is not a slow fight, it is no fight. */
export const MAX_STALL_RATE = 0.02;
/** Win-when-played below this is flagged by requirement 7. */
export const LOSING_FLOOR = 0.4;
/**
 * PLAYS — not combats — before requirement 7 will judge a card.
 *
 * The gate used to be `plays < games * 0.2`, which compares a PLAY count to a
 * COMBAT count. Those are not the same dimension, and the consequence is worse
 * than untidy: because the threshold SCALES with the sample, a card played in
 * fewer than a fifth of fights could never be judged however many fights were
 * run. Ten thousand combats would give it two thousand plays and the gate would
 * still refuse. Found by a control card that is only legal once its holder is
 * nearly dead — 13 plays against a gate of 24, and no sample size could fix it.
 *
 * (This is the same dimension error requirement 4/5 already had and fixed. It
 * survived here because nothing tested requirement 7 at all.)
 *
 * Sixty plays puts 2 sigma at about 12pp on a rate near the floor, which is
 * enough to tell 10% from 40% and not enough to tell 35% from 40% — which is
 * the right place for a flag that is confounded anyway.
 */
export const MIN_PLAYS_JUDGED = 60;
/**
 * A level step this far below zero is a regression — OR the step's own 2σ,
 * whichever is larger.
 *
 * The fixed 3pp alone was not a threshold, it was a coin flip. At the old
 * default (~300 games spread over a 12-cell matrix) a level's winrate carried
 * σ ≈ 2.9pp, so a step carried σ ≈ 4.1pp and a TRULY FLAT level read as a
 * regression about a quarter of the time. Over four or five steps per kit that
 * is a false "❌ level regression" on most kits — which is roughly what the
 * first report card printed. Requiring the step to clear its own noise as well
 * makes the verdict a claim about the cards rather than about the sample size.
 */
export const REGRESSION_PP = 0.03;
/**
 * Requirement 3's bar. Playing the kit properly must beat every MINDLESS
 * strategy — random legal cards, attack-spam, and repeating any single card —
 * by a wide margin, not by a nose. A kit that only edges past them is a kit
 * whose decisions barely matter, whatever its cards say on paper.
 */
export const MINDLESS_MARGIN = 0.20;
/**
 * The one-trick bar, and why it is NOT `MINDLESS_MARGIN`.
 *
 * "Only ever card X" handicaps ONE SEAT of four — a companion does not own the
 * subject's card, so it falls back to playing properly — while `uniform` and
 * the `onlyX` restrictions handicap the whole side. Three quarters of the party
 * still playing well means the winrate barely moves, so the one-trick family
 * can never lose 20pp, ALWAYS wins a max taken across both families, and caps
 * the reported margin near zero by construction. Measured on two kits before
 * this was split out: berserk −0.5pp and earthbender −1.0pp, both of them the
 * one-trick arm rather than any real finding.
 *
 * So the families are scored apart. Roughly a quarter of the side is
 * impoverished, so roughly a quarter of the bar — and it is reported as a FLAG
 * rather than a pass/fail, because §7.1 itself calls it the weaker claim.
 */
export const ONE_TRICK_MARGIN = 0.05;
/**
 * Requirement 3b's bar: how much the STRATEGY SPACE is worth, over and above
 * thinking.
 *
 * Lower than `MINDLESS_MARGIN` on purpose. A side restricted to attacks still
 * searches a round ahead and still attacks whenever an attack is legal — it is
 * a competent player with a smaller hand, not a thoughtless one, so it should
 * not be expected to lose by the same margin. 10pp is what "Defensa and Focus
 * earn their slots" ought to look like.
 *
 * It currently fails on every kit at any bar above ~3pp, which is the finding,
 * not the threshold's fault (NEXT-STEPS §16).
 */
export const STRATEGY_SPACE_MARGIN = 0.10;
/**
 * SAMPLE SIZE IS PER REQUIREMENT, because the thresholds differ by an order of
 * magnitude and the cost is dominated by the tightest one.
 *
 * Requirement 1 asks about a 3pp level step and genuinely needs ~2,200 combats
 * (`gamesFor(3)`); requirement 3 asks about a 20pp margin and needs ~50. Running
 * everything at requirement 1's budget — which is what `--games` used to mean —
 * spent 60% of a run buying precision no verdict could use. Measured at 19.8
 * ms/combat, that was ~8 minutes per kit and ~55 for a full sweep, against a
 * design constraint (NEXT-STEPS §7.2) of "under a minute per kit, a coffee
 * break for a sweep, or it will not get run after each edit".
 *
 * `--games` sizes the LEVEL sweep, which is the claim that needs it. The rest
 * are floored well above their own requirement so the report stays readable.
 */
export const MINDLESS_GAMES = Math.max(300, gamesFor(MINDLESS_MARGIN * 100));
/**
 * 3c's verify run gets its OWN budget, because its bar is four times finer
 * than requirement 3's and a sample sized for one cannot resolve the other.
 *
 * MEASURED, not reasoned (NEXT-STEPS §19.1). At 240 combats an arm the 3c
 * margin moved across a 10.8pp range on Enginyer and 14.4pp on Earthbender
 * with the GAME UNCHANGED and only the dice seed moving — against a 5pp bar.
 * The bare comparison this check used flipped PASSA/FALLA/PASSA/FALLA/PASSA
 * over five seeds. Two things were wrong and only one was the missing error
 * term: gamesFor(5) is 800 combats and the check was running 300.
 */
export const ONE_TRICK_GAMES = Math.max(MINDLESS_GAMES, gamesFor(ONE_TRICK_MARGIN * 100));
/**
 * Baselines are SCREENED at half that to select the toughest, then the winner
 * alone is re-measured on fresh numbers.
 *
 * Because the bar is a MAX over a dozen-odd noisy estimates, whichever one got
 * the luckiest sample wins — and that luck is then subtracted from the policy
 * as if it were skill. At 14 baselines the inflation is ~1.7σ (see
 * `maxOfKBias`), which at the old default was ~5pp off a 20pp threshold, all
 * of it against the kit. Select cheap, verify honestly: the same two-stage
 * shape the balancer uses for exactly this reason.
 */
export const BASELINE_SCREEN_FRACTION = 0.5;
// --- THE DECISION RULES, as pure functions ----------------------------------
//
// Requirements 3, 3b and 3c ask the same question against three different bars:
// "does the real policy beat this impoverished arm by at least X?" They used to
// compute it three times, in three places, and that is exactly how 3c came to
// be missing its error term while its two neighbours had one (NEXT-STEPS
// §19.1). One rule, three bars: the drift has nowhere to happen.
//
// They are pure and exported so they can be CONTROL-TESTED on inputs whose
// answer is known — a margin that clearly clears the bar, one that clearly
// misses, one that misses only inside its own noise, one where the arm wins,
// and one where the sample cannot resolve the bar at all. A verdict rule that
// is only ever exercised by real data is a rule nobody has checked.

export interface MarginCheck {
  ok: boolean;
  margin: number;
  stderr: number;
  /** Misses the bar nominally but reaches it inside its own interval. Worth
   *  saying out loud: the reader should not act on it either way. */
  borderline: boolean;
  /** The impoverished arm BEATS the policy beyond noise. Not a content finding
   *  — an impoverished side outplaying the real one is a statement about the
   *  policy, and pointing it at the kit sends the reader to the wrong file. */
  armWins: boolean;
  /** Whether this many combats can resolve this bar at all (`gamesFor`). A
   *  verdict below its own resolution reports which seed was used. */
  resolvable: boolean;
}

/**
 * Does the policy beat an impoverished arm by at least `bar`?
 *
 * FAILS ONLY ON WHAT IS CLEARLY PAST THE LINE, never on what merely fails to
 * clear it with confidence: a X here means "go look", and a false one costs a
 * session. The asymmetry runs the other way from requirement 1's total-gain
 * check, where failing to DEMONSTRATE a gain is itself the finding.
 */
export function marginVerdict(
  policyWinrate: number, policyGames: number,
  armWinrate: number, armGames: number,
  bar: number,
): MarginCheck {
  const margin = policyWinrate - armWinrate;
  const se = deltaStderr(policyWinrate, policyGames, armWinrate, armGames);
  return {
    margin,
    stderr: se,
    ok: margin + 2 * se >= bar,
    borderline: margin < bar && margin + 2 * se >= bar,
    armWins: margin + 2 * se < 0,
    resolvable: Math.min(policyGames, armGames) >= gamesFor(bar * 100),
  };
}

/** One level step, and whether it is a regression, flat, or just noisy. */
export type StepKind = 'gain' | 'regression' | 'noisy' | 'flat';

/**
 * Classify a level step.
 *
 * A step counts as a REGRESSION only when it is both materially negative AND
 * bigger than its own error bar — otherwise the verdict is a report on the
 * sample size rather than on the kit. At the old default a genuinely flat level
 * read as a regression about one time in four, and over four steps most kits
 * printed a false X.
 */
export function classifyStep(step: number, se: number, regressionPP: number): StepKind {
  if (step < -Math.max(regressionPP, 2 * se)) return 'regression';
  if (step < -regressionPP) return 'noisy';
  if (Math.abs(step) <= 2 * se) return 'flat';
  return 'gain';
}

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

/**
 * Requirement 7: does this card correlate with LOSING?
 *
 * A FLAG, never a verdict, and confounded by construction: a defense gets
 * played precisely when things are going badly, so a healthy defensive card
 * correlates with losing no matter how good it is. Extracted anyway, because a
 * flag nobody has controlled is a flag nobody should act on — and this one had
 * no test of any kind.
 *
 * Draws sit in the denominator and never the numerator, so the figure is
 * depressed by the draw rate. One more reason not to read it as a verdict.
 */
export function correlatesWithLosing(
  wins: number, plays: number, minPlays: number, floor: number,
): { judged: boolean; flagged: boolean; rate: number } {
  if (plays < minPlays) return { judged: false, flagged: false, rate: 0 };
  const rate = wins / plays;
  // CLEARLY below the floor, not merely measured below it.
  return { judged: true, flagged: rate + 2 * stderr(rate, plays) < floor, rate };
}

/**
 * Requirement 4/5's decision: is this card CLEARLY never the right play?
 *
 * "Clearly" is the whole rule. `bestShare` is a sample like every other number
 * here, and comparing it bare to the null flags every card that happens to
 * measure low — which is §17.5 exactly: `DEAD_VALUE` spent a session naming
 * cards against a noise floor nobody had measured. Subtracting 2σ first means a
 * ❌ says "go and look at this card" rather than "this card drew badly".
 *
 * PURE AND EXPORTED because the other four decision rules are, and being the
 * one that was not is why it was the only mutant to survive the first mutation
 * run (`src/mutation.ts`): a rule inlined in `analyze` has no unit test that
 * can reach it, so deleting its error term changed nothing any fast test could
 * see.
 */
export function isDeadCard(bestShare: number, bestStderr: number, nullShare: number): boolean {
  return bestShare + 2 * bestStderr < nullShare;
}

/**
 * Requirement 5's bar: a card that is the best play in more than this share of
 * the decisions it is legal in has erased the decision — whenever it is in
 * hand, the rest of the hand stops mattering. The inverse tail of 4/5 (§7.1):
 * both tails are failures, and the target is a spread.
 *
 * Judged on the same per-decision statistic as dead cards (`bestShare`, over
 * positions where the choice was real), never on how often the AI played it —
 * that would make the evaluator the judge of the content it serves.
 *
 * WHY 85% AND NOT 90. A card built to be the only answer (`dominantKit`:
 * 6d6 at every target, fastest on the table, beside two 1d4s) measured best in
 * 94%±1.6 of its decisions on the synthetic set (2026-09-23) — the rest are
 * positions where ANY card wins, which no construction removes. At 90% the
 * bar sat two sigma from a card that is dominant by construction, so the
 * control flapped; at 85% it clears by more than three.
 */
export const AUTO_INCLUDE_SHARE = 0.85;

/** Is this card CLEARLY the best play almost every time it could be played? */
export function isAutoInclude(bestShare: number, bestStderr: number): boolean {
  return bestShare - 2 * bestStderr > AUTO_INCLUDE_SHARE;
}

/**
 * Requirement 8's band: how far a kit at full level may sit from the neutral
 * stand-in, in winrate. §7.1 asks that no kit exceed ~65% against the field at
 * an equal budget — fifteen points either side of an even fight.
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
