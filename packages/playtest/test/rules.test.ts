/**
 * CONTROL EXPERIMENTS FOR EVERY REQUIREMENT'S DECISION RULE.
 *
 * A verdict rule that is only ever exercised by real data is a rule nobody has
 * checked. Real data never tells you whether a ❌ fired because the kit is
 * broken or because the rule is — the numbers look equally plausible either
 * way, which is how the one-card requirement spent a session reporting which seed
 * it had been given (NEXT-STEPS §19.1) and how `DEAD_VALUE` spent one flagging cards
 * against a floor nobody had measured (§17.5).
 *
 * So each rule is fed inputs whose answer is known WITHOUT measuring anything:
 *
 *   - a case that must PASS,
 *   - a case that must FAIL,
 *   - the NULL: no effect at all, where the rule must stay silent,
 *   - the UNDER-POWERED case, where the rule must not pretend to know.
 *
 * The null and the under-powered case are the ones that matter. Every mistake
 * this harness has made was a rule confidently answering a question its sample
 * could not resolve.
 */
import { describe, it, expect } from 'vitest';
import {
  choiceMattersVerdict, durationVerdict, edgeHolds, isBlindSpot, isNeverRight, KIT_BAND, MIN_CARD_DECISIONS,
  MIN_CHOICE_COST, strengthVerdict, sweetSpotVerdict, TRIANGLE_GAMES, triangleVerdict,
} from '../src/index.js';

/** A sample big enough that a 1pp effect is resolvable — so these tests are
 *  about the RULE, not about noise. */
const BIG = 100_000;

describe('requirement 1 — the duration rule', () => {
  const OK = { median: 3, p90: 6, draws: 0.01 };
  const BARS = [5, 8, 0.02] as const;
  const check = (m: number, p: number, d: number) => durationVerdict(m, p, d, ...BARS);

  it('passes a fight that ends promptly', () => {
    const v = check(OK.median, OK.p90, OK.draws);
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('names WHICH of the three failed, not just that something did', () => {
    // These are three different problems with three different fixes. Collapsing
    // them into one boolean sent every reader of a ❌ to the wrong number:
    // measured 2026-09-20, all six kits failed on the DRAW RATE while median
    // (3) and p90 (6) sat comfortably inside their bars.
    const draws = check(3, 6, 0.04);
    expect(draws.ok).toBe(false);
    expect(draws.reasons).toHaveLength(1);
    expect(draws.reasons[0]).toMatch(/encallats/);

    const slow = check(9, 6, 0.01);
    expect(slow.reasons).toHaveLength(1);
    expect(slow.reasons[0]).toMatch(/mediana/);

    const tail = check(3, 20, 0.01);
    expect(tail.reasons).toHaveLength(1);
    expect(tail.reasons[0]).toMatch(/p90/);
  });

  it('reports every failing condition at once', () => {
    expect(check(9, 20, 0.5).reasons).toHaveLength(3);
  });

  it('THE NULL: a fight at exactly the bars passes', () => {
    // The bars are inclusive for length and exclusive for draws — a stalemate
    // rate AT the bar is already too many fights that never end.
    expect(check(5, 8, 0.019).ok).toBe(true);
    expect(check(5, 8, 0.02).ok).toBe(false);
  });
});


describe('requirement 2 — the power band', () => {
  it('passes a kit near the neutral stand-in', () => {
    expect(strengthVerdict(0.03, 0.02, KIT_BAND)).toEqual({ ok: true, side: null });
  });

  it('names the side a kit clearly falls out on', () => {
    expect(strengthVerdict(0.30, 0.02, KIT_BAND)).toEqual({ ok: false, side: 'above' });
    expect(strengthVerdict(-0.30, 0.02, KIT_BAND)).toEqual({ ok: false, side: 'below' });
  });

  it('does NOT fail a kit that is out of band only inside its own noise', () => {
    expect(strengthVerdict(0.18, 0.03, KIT_BAND).ok).toBe(true);
    expect(strengthVerdict(-0.18, 0.03, KIT_BAND).ok).toBe(true);
  });

  it('THE NULL: exactly zero is in band at any sample size', () => {
    for (const se of [0, 0.01, 0.2]) expect(strengthVerdict(0, se, KIT_BAND).ok).toBe(true);
  });
});


describe('requirement 3 — choosing must matter', () => {
  it('passes a kit where a random pick clearly costs more than the bar', () => {
    expect(choiceMattersVerdict(MIN_CHOICE_COST * 3, 0.1, MIN_CHOICE_COST)).toBe(true);
  });

  it('fails a kit where a random pick clearly costs too little', () => {
    expect(choiceMattersVerdict(MIN_CHOICE_COST / 4, 0.05, MIN_CHOICE_COST)).toBe(false);
  });

  it('THE NULL: a kit that never offers a choice — zero decisions, zero cost — fails', () => {
    expect(choiceMattersVerdict(0, 0, MIN_CHOICE_COST)).toBe(false);
  });

  it('does NOT fail a kit that is under the bar only inside its own noise', () => {
    expect(choiceMattersVerdict(MIN_CHOICE_COST * 0.8, MIN_CHOICE_COST * 0.2, MIN_CHOICE_COST)).toBe(true);
  });
});

describe('requirement 3 — a card is never the right play', () => {
  const N = 500;

  it('fails a card whose runner-up is clearly better even where it looks best', () => {
    expect(isNeverRight(-2.8, 0.5, N)).toBe(true);
  });

  it('THE NULL: a card tied with the alternative when best is a real choice — workhorses and twins', () => {
    expect(isNeverRight(0, 0.3, N)).toBe(false);
    expect(isNeverRight(0.3, 0.3, N)).toBe(false);
  });

  it('does NOT fail a card that is negative only inside its own noise', () => {
    expect(isNeverRight(-0.5, 0.5, N)).toBe(false);
  });

  it('a card never picked as the best at all is never right', () => {
    expect(isNeverRight(null, null, N)).toBe(true);
  });

  it('a card with too few decisions is not judged at all', () => {
    expect(isNeverRight(-10, 0.1, MIN_CARD_DECISIONS - 1)).toBe(false);
    expect(isNeverRight(null, null, MIN_CARD_DECISIONS - 1)).toBe(false);
  });
});

describe('requirement 4 — the triangle', () => {
  const N = TRIANGLE_GAMES;

  it('an edge holds when its winner clearly beats an even duel', () => {
    expect(edgeHolds(0.60, N)).toBe(true);
  });

  it('THE NULL: an even duel holds no edge, at any sample size', () => {
    for (const n of [50, N, 100_000]) expect(edgeHolds(0.5, n)).toBe(false);
  });

  it('does NOT claim an edge inside its own noise', () => {
    // 54% over 100 duels: σ ≈ 5pp, the interval reaches 50%.
    expect(edgeHolds(0.54, 100)).toBe(false);
  });

  it('a losing edge never holds', () => {
    expect(edgeHolds(0.30, N)).toBe(false);
  });

  it('the triangle needs EVERY edge, and names the ones that break', () => {
    const edge = (winner: string, loser: string, winrate: number) => ({ winner, loser, winrate, games: N });
    expect(triangleVerdict([edge('A', 'B', 0.6), edge('B', 'C', 0.6), edge('C', 'A', 0.6)]))
      .toEqual({ ok: true, broken: [] });
    expect(triangleVerdict([edge('A', 'B', 0.6), edge('B', 'C', 0.3), edge('C', 'A', 0.5)]))
      .toEqual({ ok: false, broken: ['B > C', 'C > A'] });
  });
});

describe('the armour sweet spot', () => {
  const curve = (...w: number[]) => w.map((winrate, worn) => ({ worn, winrate, games: BIG }));

  it('passes a hump: a few wearers beat both nobody and everybody', () => {
    expect(sweetSpotVerdict(curve(0.60, 0.66, 0.68, 0.64, 0.58))).toMatchObject({ ok: true, best: 1 });
  });

  it('fails armour that is best on everyone — the lever it must not be', () => {
    const v = sweetSpotVerdict(curve(0.50, 0.55, 0.60, 0.65, 0.70));
    expect(v.ok).toBe(false);
    expect(v.best).toBe(3);
    expect(v.reasons.join()).toMatch(/tothom/);
  });

  it('fails armour that only ever hurts (F18, today)', () => {
    const v = sweetSpotVerdict(curve(0.80, 0.75, 0.70, 0.62, 0.55));
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toMatch(/ningú/);
  });

  it('THE NULL: armour that changes nothing is not a sweet spot', () => {
    expect(sweetSpotVerdict(curve(0.65, 0.65, 0.65, 0.65, 0.65)).ok).toBe(false);
  });

  it('does NOT pass a hump its sample cannot resolve', () => {
    const thin = [0.60, 0.66, 0.68, 0.64, 0.58].map((winrate, worn) => ({ worn, winrate, games: 50 }));
    expect(sweetSpotVerdict(thin).ok).toBe(false);
  });

  it('THE NULL, sampled: a flat curve read through binomial noise passes rarely', () => {
    // The rule looks at several interior counts and keeps the best, so its
    // false-positive rate is above a single 2σ test's. This is the claim in
    // its doc comment, made executable: independent arms (no common random
    // numbers to help), a realistic sample, a flat truth.
    let seed = 12345;
    const rand = () => {   // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const n = 800, trials = 2000;
    let passes = 0;
    for (let t = 0; t < trials; t++) {
      const pts = [0, 1, 2, 3, 4].map(worn => {
        let wins = 0;
        for (let g = 0; g < n; g++) if (rand() < 0.65) wins++;
        return { worn, winrate: wins / n, games: n };
      });
      if (sweetSpotVerdict(pts).ok) passes++;
    }
    expect(passes / trials).toBeLessThan(0.05);
  });

  it('needs nobody, somebody and everybody', () => {
    expect(sweetSpotVerdict(curve(0.6, 0.7)).ok).toBe(false);
  });
});

describe('a blind spot: often the best play, almost never played', () => {
  // Shares measured 2026-10-04 (NEXT-STEPS §30), as fixtures for the rule.
  it('flags a card the AI plays far less than it is right', () => {
    expect(isBlindSpot(0.21, 0.02, 0.026)).toBe(true);   // Presó de terra
    expect(isBlindSpot(0.20, 0.02, 0.036)).toBe(true);   // Marca, with the AI blind to statuses
  });

  it('passes a card played in proportion, or rarely right to begin with', () => {
    expect(isBlindSpot(0.14, 0.02, 0.061)).toBe(false);  // Entrar en Fúria: rare, and played when right
    expect(isBlindSpot(0.21, 0.02, 0.053)).toBe(false);  // Paisatge congelat: under-played, not blind
    expect(isBlindSpot(0.11, 0.02, 0.0)).toBe(false);    // best share not clearly above the floor
  });
});
