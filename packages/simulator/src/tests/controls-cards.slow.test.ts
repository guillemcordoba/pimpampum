/**
 * END-TO-END CONTROL — requirement 4/5, the dead-card check.
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
  deadCardKit, withControlKit,
} from '@pimpampum/bench';
import { FOR_CARDS, GAMES } from './control-budgets.js';

describe('a kit with a card that does NOTHING', () => {
  const r = withControlKit(deadCardKit(), def =>
    analyze({ mode: 'player', id: def.id } as Subject, GAMES, FOR_CARDS));
  /**
   * The names inside ONE labelled section of the verdict.
   *
   * Sliced by SECTION, not at the first `·` — which is what this used to do,
   * and every card entry carries a `·` of its own, so the old slice cut inside
   * the first dead card's own text and the "does not name the real attacks"
   * check was reading a fragment. It passed, for the wrong reason.
   */
  const section = (label: string): string => {
    const start = r.cardUse.detail.indexOf(label);
    if (start < 0) return '';
    const rest = r.cardUse.detail.slice(start);
    const end = rest.search(/ · (?:⚠️|sense mostra|no mesurables|\[)/);
    return end < 0 ? rest : rest.slice(0, end);
  };

  it('requirement 4/5 fails the kit', () => {
    expect(r.cardUse.ok, `req 4/5 passed a kit holding a no-op: ${r.cardUse.detail}`).toBe(false);
  });

  it('names the no-op as dead under EVERY opponent model', () => {
    // Not merely "mentioned somewhere in the verdict". A card that dies under
    // only some models lands in the SENSITIVE list, which is explicitly not a
    // verdict (§20.11) — and a card that does literally nothing has to clear
    // the stricter bar, or the robustness check has made 4/5 unable to fail.
    expect(
      section('MORTES').includes('NoOp'),
      `req 4/5 did not name the no-op dead under all models: ${r.cardUse.detail}`,
    ).toBe(true);
  });

  it('does NOT name the real attacks as dead', () => {
    // The other half of a control, and the half that is usually skipped: a rule
    // that flags everything is as useless as one that flags nothing.
    expect(
      section('MORTES').includes('Real'),
      `req 4/5 called a working attack dead: ${r.cardUse.detail}`,
    ).toBe(false);
  });

  it('values the no-op below the real cards', () => {
    const byId = new Map(r.cardValues.map(v => [v.id, v.value]));
    const noop = [...byId.entries()].find(([id]) => id.endsWith('c3'))?.[1];
    const real = [...byId.entries()].filter(([id]) => !id.endsWith('c3')).map(([, v]) => v);
    expect(noop, 'the no-op was never priced').toBeDefined();
    expect(noop!, `no-op ${noop} vs real ${real.join(', ')}`).toBeLessThan(Math.min(...real));
  });
});
