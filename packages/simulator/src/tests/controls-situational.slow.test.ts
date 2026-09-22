/**
 * END-TO-END CONTROL — requirement 3c must-FIRE.
 *
 * `requirements.test.ts` controls the DECISION RULES on synthetic numbers.
 * These files control the whole pipeline — build a subject, solve its cells,
 * play the fights, aggregate, judge — on subjects whose verdict follows from
 * their CONSTRUCTION (`bench/control-kits.ts`), not from any measurement.
 *
 * That gap matters. A rule can be perfect and still be fed the wrong number:
 * the wiring between "what was measured" and "what was judged" is where
 * requirement 3c lost its error bar and where `heroWithout` once silently
 * ablated nothing at all. Neither would have been caught by testing the rule.
 *
 * ONE ANALYSIS PER FILE, because vitest parallelises by file and each of these
 * runs its own `analyze()`. Budgets are shared from `control-budgets.ts`.
 */
import { describe, it, expect } from 'vitest';
import { analyze, type Subject } from '../kit-analyzer-lib.js';
import {
  situationalKit, withControlKit,
} from '@pimpampum/bench';
import { FOR_3C, GAMES } from './control-budgets.js';

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
