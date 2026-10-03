/**
 * `@pimpampum/playtest/vitest` — THE ASSERTION API A SET'S TESTS ARE WRITTEN IN.
 *
 * A set's test files are meant to be short and declarative: the framework
 * supplies the assertions, the set supplies the content. One call per kit —
 * one file per kit, so vitest measures kits in parallel — and every
 * requirement becomes a test:
 *
 *     kitSuite({ set: SET, kit: 'berserk', known: KNOWN.berserk });
 *
 * THE KNOWN-FINDINGS RATCHET. Real content fails some requirements, and those
 * failures are findings, not flakes: every measurement here is seeded, so a
 * verdict only moves when the content, the AI or the rules do. A requirement
 * listed in `known` (with the reason, and where it is written down) is asserted
 * to STILL fail. Fixing it turns the test red, which is the point: the entry is
 * deleted the day it stops being true, instead of rotting into a permanent
 * excuse. Anything not listed must pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SMOKE } from '@pimpampum/bench';
import type { AnalyzeBudget, KitReport, Verdict } from './analyze.js';
import { analyzeIsolated } from './isolated.js';

/** The requirements a kit is judged on. Requirement 7 (win correlation) is
 *  confounded by design and is a FLAG, never a verdict (§7.1): it is reported,
 *  not asserted. */
export const REQUIREMENTS = {
  monotonicity: '1 · a higher level is a better kit',
  duration: '2 · fights do not drag',
  spam: '3 · thinking beats not thinking, by a lot',
  strategySpace: '3b · the strategy space matters',
  oneTrick: '3c · no one card carries the kit',
  cardUse: '4 · no dead cards',
  autoInclude: '5 · no card erases the decision',
  strength: '8 · inside the power band',
} as const;
export type Requirement = keyof typeof REQUIREMENTS;

export interface KitSuiteOptions {
  /** The module exporting the set (a path), and the export's name. */
  set: { module: string; export: string };
  kit: string;
  /** Combats per level in the level sweep; the other samples default to what
   *  their own bars need. */
  games: number;
  budget?: AnalyzeBudget;
  /** Requirements this kit is KNOWN to fail today → why, and where it is
   *  written down. See the ratchet above. */
  known?: Partial<Record<Requirement, string>>;
}

/** Declare one kit's requirement tests. Call at the top level of a test file. */
export function kitSuite(opts: KitSuiteOptions): void {
  describe(`kit ${opts.kit}`, () => {
    let r: KitReport;
    beforeAll(async () => {
      r = await analyzeIsolated({
        set: opts.set, subject: { mode: 'player', id: opts.kit }, games: opts.games, budget: opts.budget,
      });
      record(opts.kit, r);
    });

    it('was measured: a whole report, every card priced or accounted for', () => {
      expect(r.cards.length).toBeGreaterThan(0);
      expect(r.levels.length).toBe(r.cards.length);
    });

    for (const [req, label] of Object.entries(REQUIREMENTS) as [Requirement, string][]) {
      const known = opts.known?.[req];
      it.skipIf(SMOKE)(known ? `${label} — KNOWN to fail: ${known}` : label, () => {
        const v: Verdict = r[req];
        expect(v.inconclusive, `${label} was not measured: ${v.detail}`).toBeFalsy();
        if (known) {
          expect(v.ok, `${opts.kit} now PASSES ${label}. Delete its KNOWN entry — the finding is `
            + `fixed, and a known-failure list that outlives its failures is an excuse list. ${v.detail}`).toBe(false);
        } else {
          expect(v.ok, `${opts.kit} fails ${label}: ${v.detail}`).toBe(true);
        }
      });
    }
  });
}

/**
 * With `PLAYTEST_RECORD_DIR` set, every measured kit's verdicts are written
 * there as JSON — the raw material for the findings log, so what a sweep found
 * is copied from what it measured rather than retyped from a terminal.
 */
function record(kit: string, r: KitReport): void {
  const dir = process.env.PLAYTEST_RECORD_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const verdicts = Object.fromEntries(
    [...Object.keys(REQUIREMENTS), 'correlation'].map(k => [k, (r as unknown as Record<string, Verdict>)[k]]),
  );
  fs.writeFileSync(path.join(dir, `${kit}.json`), JSON.stringify({
    kit, measured: new Date().toISOString(), verdicts,
    cardValues: r.cardValues, delta: r.levels.map(l => ({ level: l.level, delta: l.run.delta, se: l.run.deltaStderr })),
  }, null, 2));
}
