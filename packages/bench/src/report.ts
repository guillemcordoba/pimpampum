/**
 * HOW A MEASUREMENT IS PRINTED.
 *
 * Every number this package produces is a sample, and a sample without its
 * error bar invites the one mistake that costs whole sessions: reading a 2pp
 * difference off 300 games as a finding. Before this module only
 * `experiment-seat.ts` printed an interval; everything else printed one
 * decimal place of false precision.
 *
 * So: a winrate is never formatted without its n. `pct(rate, n)` is the only
 * way to render one, and it will not let you forget.
 */

/**
 * 1σ sampling error of a winrate measured over `n` games.
 *
 * Binomial. Two caveats the callers own rather than this function:
 *  - A DRAWN party is redrawn per game, which makes games non-iid and the real
 *    spread ~25% wider (measured — see `simulate.ts`). Inflate at the call
 *    site, as the balancer does; an EXPLICIT party needs no inflation.
 *  - Draws counted as ½ are not Bernoulli either. With draws rare the error is
 *    small; a harness with a fat draw tail should say so rather than lean on
 *    this number.
 */
export function stderr(rate: number, n: number): number {
  if (n <= 0) return NaN;
  // Floor the variance so a 0% or 100% cell quotes an honest "we saw nothing"
  // interval rather than ±0.0, which reads as certainty.
  return Math.sqrt(Math.max(rate * (1 - rate), 0.01) / n);
}

/** A winrate with its 1σ error, e.g. `61.5%±2.8`. The n is REQUIRED. */
export function pct(rate: number, n: number, width = 5): string {
  return `${(rate * 100).toFixed(1).padStart(width)}%±${(stderr(rate, n) * 100).toFixed(1)}`;
}

/** A winrate rounded to the resolution its sample supports — no decimal when
 *  the error is over a point, which is most of the time. */
export function pctCoarse(rate: number, n: number): string {
  const se = stderr(rate, n) * 100;
  return `${(rate * 100).toFixed(se >= 1 ? 0 : 1)}%±${se.toFixed(se >= 1 ? 0 : 1)}`;
}

/**
 * The difference of two independently-measured winrates, in points, with its
 * own 1σ error — which is the thing that decides whether a gap is real.
 *
 * NOTE this assumes the two arms are INDEPENDENT. Under common random numbers
 * (`withSeed` with the same seed on both arms) they are positively correlated
 * and the true error is SMALLER, so this is conservative: a gap it calls real
 * is real. It cannot be made exact without pairing the outcomes per game, which
 * no harness here does — the arms desynchronise as soon as a decision differs.
 */
export function deltaPP(a: number, na: number, b: number, nb: number): string {
  const d = (a - b) * 100;
  const se = Math.sqrt(stderr(a, na) ** 2 + stderr(b, nb) ** 2) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}pp±${se.toFixed(1)}`;
}

/**
 * A signed difference of winrates, in points, with NO error bar.
 *
 * `deltaPP` is the same number with its own 1σ attached, and is what to reach
 * for by default. This exists for callers that already hold the error and need
 * to quote it at a different number of sigmas than 1 — printing a 1σ bar beside
 * a verdict decided at 2σ invites the reader to check the test and get a
 * different answer than the test did.
 */
export function pp(delta: number, decimals = 1): string {
  return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(decimals)}pp`;
}

/** 1σ of a difference of two independent rates, as a fraction. */
export function deltaStderr(a: number, na: number, b: number, nb: number): number {
  return Math.sqrt(stderr(a, na) ** 2 + stderr(b, nb) ** 2);
}

/** Is `a − b` distinguishable from zero at ~2σ? The honest predicate behind
 *  every "X beats Y" claim in this package. */
export function significant(a: number, na: number, b: number, nb: number, sigmas = 2): boolean {
  return Math.abs(a - b) > sigmas * deltaStderr(a, na, b, nb);
}

/** Games needed to resolve an effect of `pp` points at ~2σ, worst case
 *  (p≈0.5). Print it next to a threshold so a too-thin run is obvious. */
export function gamesFor(pp: number, sigmas = 2): number {
  const d = pp / 100;
  return Math.ceil(2 * (sigmas / d) ** 2 * 0.25);
}

// --- Selection bias ---------------------------------------------------------

/** Inverse standard-normal CDF (Acklam's rational approximation, |ε| < 1.2e-9
 *  — far tighter than anything here needs). */
function probit(p: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) return -probit(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * How much the MAX of `k` equally-good noisy estimates overstates the truth,
 * in units of σ (Blom's approximation to E[max of k standard normals]).
 *
 * This is winner's curse, and it is why any harness that picks the best of
 * several samples must RE-MEASURE the winner before quoting it: choosing on a
 * sample and reporting that same sample is biased by roughly this much. The
 * balancer documents the same trap at ~4pp (`simulate.ts`); a report card that
 * takes the toughest of 14 baselines is doing it at ~1.7σ.
 */
export function maxOfKBias(k: number): number {
  if (k <= 1) return 0;
  return probit((k - 0.375) / (k + 0.25));
}

// --- The other two kinds of percentage --------------------------------------
// A rule that says "never format a percentage by hand" only works if there is
// an honest way to print the percentages that are NOT sampled winrates.
// Otherwise the rule gets an exemption, then another, and stops meaning
// anything. These two are those ways, and their names say which is which.

/**
 * A percentage that is KNOWN, not estimated: a requested target winrate, a
 * calibration constant, a probability computed exactly. No interval, because
 * there is no sampling — quoting one would be a lie in the other direction.
 */
export function exact(rate: number, decimals = 0): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

/**
 * A SHARE of a count — what fraction of decisions went to attacks, how often a
 * card was chosen out of the turns it was legal.
 *
 * It is a sampled rate like any other, so it carries an interval; the
 * denominator is the count it is a share OF, not the number of combats. This
 * matters most for the play-rate thresholds in the kit analyzer: a card legal
 * 30 times and played once is "3%±3", which is not the same claim as a card
 * legal 3000 times and played 90.
 */
export function share(n: number, total: number, width = 5): string {
  return total > 0 ? pct(n / total, total, width) : '    —';
}
