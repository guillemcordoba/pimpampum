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
 *    spread ~25% wider (measured — see `@pimpampum/combat-balancer`). Inflate at the call
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
