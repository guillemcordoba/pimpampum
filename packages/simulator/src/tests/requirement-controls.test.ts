/**
 * END-TO-END CONTROLS FOR THE REQUIREMENTS THEMSELVES.
 *
 * `requirements.test.ts` controls the DECISION RULES on synthetic numbers.
 * This controls the whole pipeline — build a subject, solve its cells, play the
 * fights, aggregate, judge — on subjects whose verdict follows from their
 * CONSTRUCTION (`bench/control-kits.ts`), not from any measurement.
 *
 * That gap matters. A rule can be perfect and still be fed the wrong number:
 * the wiring between "what was measured" and "what was judged" is where
 * requirement 3c lost its error bar and where `heroWithout` once silently
 * ablated nothing at all. Neither would have been caught by testing the rule.
 *
 * These are slower than a unit test and far cheaper than a sweep, because the
 * effects being asserted are enormous by construction: a kit of identical cards
 * has a margin of exactly zero, so distinguishing it from a 20pp bar takes very
 * few combats.
 */
import { describe, it, expect } from 'vitest';
import { analyze, type Subject } from '../kit-analyzer-lib.js';
import {
  blitzKit, deadCardKit, defenceOnlyKit, flatKit, ladderKit, losingOnlyKit,
  situationalKit, trapKit, withControlKit,
} from '../bench/control-kits.js';

/** Small, because every effect asserted here is huge by construction. */
/**
 * EVERY BLOCK PAYS ONLY FOR THE REQUIREMENT IT ASSERTS.
 *
 * `analyze` measures all seven requirements whatever you are checking, so a
 * single shared budget makes every control pay 3c's bill — and 3c's bar is
 * 5pp, which `gamesFor` prices at 800 combats an arm (§19.1). Handing that to
 * the requirement-1 and requirement-2 controls took the file past half an hour
 * and it was killed. A control suite nobody can afford to run is a control
 * suite nobody runs.
 *
 * So: a floor cheap enough to be irrelevant, and each block raises the one
 * number its own assertion depends on.
 */
const CHEAP = { mindlessGames: 60, oneTrickGames: 60, cardValueGames: 40 };
/** 3c's bar needs its own sample or the control fails for §19.1's reason
 *  rather than for the reason it is testing. */
const FOR_3C = { ...CHEAP, oneTrickGames: 800 };
/** 4/5 is per-DECISION, so it needs fights, not verify passes. */
const FOR_CARDS = { ...CHEAP, cardValueGames: 240 };
const GAMES = 120;

const run = (def: { id: string }) => analyze({ mode: 'player', id: def.id } as Subject, GAMES, CHEAP);

describe('a kit of IDENTICAL cards — levels and thinking cannot matter', () => {
  const r = withControlKit(flatKit(4), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, FOR_3C));

  it('requirement 1 does not report a gain the kit cannot have', () => {
    // Every card is the same card. A level adds an option identical to the one
    // already held, so the only thing a level buys is the +1 roll bonus that
    // comes with it — and requirement 1 asks for more than that.
    expect(r.monotonicity.ok, `req 1 claimed a gain: ${r.monotonicity.detail}`).toBe(false);
  });

  // NO END-TO-END CONTROL FOR 3 AND 3b HERE, and the reason is a finding.
  //
  // Both impoverish the WHOLE SUBJECT SIDE — all four seats — while a control
  // kit occupies one. The other three are calibration heroes with real kits,
  // so thinking still matters enormously for them and the margin stays large
  // however flat the subject is: measured +13.5pp on a kit with exactly one
  // distinct card, against a 20pp bar.
  //
  // That is not a bug. `cells.ts` documents the side-wide scope and it is the
  // only fair form of "does thinking matter". But it does mean 3 and 3b are
  // largely measuring the FIXED COMPANY, identical for every subject, which is
  // why their verdicts cluster across kits. Controlling them end-to-end needs a
  // party of four control kits, which the analyzer cannot field today. The
  // decision RULE they share is controlled in requirements.test.ts; the gap is
  // recorded in NEXT-STEPS §19.6.
  it('3 and 3b measure the SIDE, so a flat subject does not zero their margin', () => {
    expect(r.spam.detail).toMatch(/COSTAT SENCER/);
  });

  it('requirement 3c does not claim the kit beats its own one-trick', () => {
    // Repeating one card IS playing the kit, exactly.
    expect(r.oneTrick.ok, `req 3c claimed a margin: ${r.oneTrick.detail}`).toBe(false);
  });
});

describe('a kit with a card that does NOTHING', () => {
  const r = withControlKit(deadCardKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, FOR_CARDS));
  const named = (name: string): boolean => r.cardUse.detail.includes(name);

  it('requirement 4/5 fails the kit', () => {
    expect(r.cardUse.ok, `req 4/5 passed a kit holding a no-op: ${r.cardUse.detail}`).toBe(false);
  });

  it('names the no-op as dead', () => {
    expect(named('NoOp'), `req 4/5 did not name the no-op: ${r.cardUse.detail}`).toBe(true);
  });

  it('does NOT name the real attacks as dead', () => {
    // The other half of a control, and the half that is usually skipped: a rule
    // that flags everything is as useless as one that flags nothing.
    const dead = r.cardUse.detail.slice(0, r.cardUse.detail.indexOf('·') + 1);
    expect(dead.includes('Real'), `req 4/5 called a working attack dead: ${r.cardUse.detail}`).toBe(false);
  });

  it('values the no-op below the real cards', () => {
    const byId = new Map(r.cardValues.map(v => [v.id, v.value]));
    const noop = [...byId.entries()].find(([id]) => id.endsWith('c3'))?.[1];
    const real = [...byId.entries()].filter(([id]) => !id.endsWith('c3')).map(([, v]) => v);
    expect(noop, 'the no-op was never priced').toBeDefined();
    expect(noop!, `no-op ${noop} vs real ${real.join(', ')}`).toBeLessThan(Math.min(...real));
  });
});

describe('a LADDER kit — each card strictly bigger than the last', () => {
  const r = withControlKit(ladderKit(4), run);

  it('requirement 1 finds the gain', () => {
    // 1d6 → 3d6 → 5d6 → 7d6. If a monotone ramp this steep does not register,
    // requirement 1 cannot detect a level being worth anything at all.
    expect(r.monotonicity.ok, `req 1 missed an obvious ramp: ${r.monotonicity.detail}`).toBe(true);
  });

  it('reports no regression on a kit that only improves', () => {
    expect(r.monotonicity.detail).not.toMatch(/regressions:/);
  });
});

describe('a kit whose second card costs its user dearly', () => {
  const r = withControlKit(trapKit(), run);

  /*
   * REQUIREMENT 1'S REGRESSION BRANCH CANNOT BE CONTROLLED END TO END, and the
   * reason is worth more than the control would have been.
   *
   * A level adds an OPTION and a +1 on every roll. Both are pure gain, so under
   * any reasonable policy level N+1 is at least level N: a regression is not
   * something a kit can be built to have. Two attempts here, both instructive:
   *
   *   4d6 costing 6 PV   → level 2 measured +8.7pp BETTER. Against a 41-PV
   *                        basilisk the damage outweighs the blood.
   *   8d6 costing 20 PV  → +10.4pp better still, and the AI plays it 37% of the
   *                        time. Trading a 12-PV hero for 28 damage to a boss
   *                        beats plinking 2d6 for the whole fight. It is a
   *                        kamikaze, not a trap.
   *
   * So the branch only ever fires on POLICY ERROR, and manufacturing a reliable
   * one needs a cost the depth-1 lookahead cannot see — damage arriving two or
   * more rounds later. That retro-explains the project's own history: every
   * level regression this harness ever found (§5.1, §15.4) was closed by fixing
   * the ROLL RULES or the AI, never by changing a card.
   *
   * The regression branch is controlled at the RULE level in
   * requirements.test.ts. What is controlled here is the other direction, which
   * matters just as much: that requirement 1 stays SILENT when a kit improves
   * in a way that looks alarming.
   */
  it('does not invent a regression from a card that merely looks suicidal', () => {
    expect(
      r.monotonicity.detail,
      `req 1 reported a regression on a kit that got better: ${r.monotonicity.detail}`,
    ).not.toMatch(/regressions:/);
  });
});

describe('a kit of SITUATIONAL cards — no single card is right everywhere', () => {
  // Requirement 3c's must-FIRE direction. Wide-and-weak clears a horde of 1-PV
  // goblins; narrow-and-heavy is the only thing that touches a 41-PV basilisk.
  // Repeating either has to lose to playing both.
  const r = withControlKit(situationalKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, FOR_3C));

  it('requirement 3c passes a kit no one card can carry', () => {
    expect(
      r.oneTrick.ok,
      `req 3c failed a kit whose cards split by matchup: ${r.oneTrick.detail}`,
    ).toBe(true);
  });

  it('passes for the RIGHT reason — a real margin, not a wide error bar', () => {
    // The margin rule passes anything not CLEARLY below the bar, so a noisy
    // measurement passes by default. For this to be a control the measured
    // margin has to be positive on its own: full play genuinely beating the
    // best single card, not merely failing to lose to it.
    const m = r.oneTrick.detail.match(/marge ([+-][0-9.]+)pp/);
    expect(m, `no margin in: ${r.oneTrick.detail}`).not.toBeNull();
    expect(Number(m![1]), `margin not positive: ${r.oneTrick.detail}`).toBeGreaterThan(0);
  });
});

describe('requirement 2 — a fight that CANNOT end', () => {
  /*
   * Four seats of nothing-but-defence, with a 10d6 wall. The party can never
   * kill (no attack card, and Cop desesperat is lastResort so it never becomes
   * legal while a defence is), and nothing penetrates the wall. Both sides
   * survive to the 40-round cap every time.
   *
   * This needs `allSeats`, and that is the point: requirement 2 is a property
   * of the whole FIGHT, so a control kit in one seat of four cannot move it —
   * the other three would go on killing things. Same limit that blocks the
   * requirement 3 / 3b controls (§19.6); this is the seam that lifts it.
   */
  const r = withControlKit(defenceOnlyKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, 60, { ...CHEAP, allSeats: true }));

  it('fails requirement 2', () => {
    expect(r.duration.ok, `req 2 passed a fight nobody can win: ${r.duration.detail}`).toBe(false);
  });

  it('fails for the RIGHT reason — the draw rate, not the length bars', () => {
    // "Drags" and "never ends" are different problems with different fixes.
    // Before `durationVerdict` named them separately, every reader of a ❌ went
    // to look at the median, which was fine.
    expect(r.duration.detail, `req 2 blamed the wrong thing: ${r.duration.detail}`).toMatch(/taules/);
  });
});

describe('requirement 2 — a fight that ends on round one', () => {
  // The other direction, and the one that catches a bar set so tight nothing
  // could ever pass it: 20d6 at every enemy, fastest on the field.
  const r = withControlKit(blitzKit(), run);

  it('passes requirement 2', () => {
    expect(r.duration.ok, `req 2 failed an instant win: ${r.duration.detail}`).toBe(true);
  });
});

describe('requirement 7 — a card only legal once its holder is nearly dead', () => {
  /*
   * Requirement 7 is CONFOUNDED by design — a card played only in trouble
   * correlates with losing however good it is — and that confound is exactly
   * what makes it controllable. `Desperate` is a perfectly good 3d6 attack
   * gated on the holder being down to a third of their PV, so it can only ever
   * be played from a losing position.
   *
   * A ❌ here is the harness working. §7.1 calls this a flag to investigate,
   * never a verdict, and this control is why that wording has to stay.
   */
  // More fights than the other controls: the gated card is only legal from a
  // losing position, so it appears in roughly a fifth of them, and requirement
  // 7 will not judge a card on fewer than 60 PLAYS. (That gate used to scale
  // with the sample — see MIN_PLAYS_JUDGED — which made a rare card
  // unjudgeable at ANY sample size.)
  const r = withControlKit(losingOnlyKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, 400, CHEAP));

  it('flags the card that only ever appears when losing', () => {
    expect(
      r.correlation.ok,
      `req 7 missed a card that is only legal when losing: ${r.correlation.detail}`,
    ).toBe(false);
    expect(r.correlation.detail).toMatch(/Desperate/);
  });

  it('does NOT flag the ungated card beside it', () => {
    // The other half, and the half usually skipped: a flag that fires on
    // everything is as useless as one that never fires.
    expect(
      r.correlation.detail.includes('Normal'),
      `req 7 flagged the healthy card too: ${r.correlation.detail}`,
    ).toBe(false);
  });
});
