/**
 * THE KIT GATE — every requirement of the livable zone for every main kit
 * (playtest `gate.ts`; the user, 2026-11-03), as a RATCHET: each cell failing
 * today is KNOWN, with why; a KNOWN cell that passes turns this red until it
 * leaves the list, and a new failing cell turns it red until it is fixed or
 * written down. The AI's own cells — its model of the opponents, its blind
 * spots — are how a drifting AI gets caught the day it drifts.
 *
 * Read the printed grid with `tools/src/kit-gate.ts --set elements`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { isolated, SMOKE } from '@pimpampum/bench';
import type { GateReport } from '@pimpampum/playtest';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gate.work.ts');

/** The cells failing today, by key (`GateFailure.key`). Filled from the
 *  measurement, never by guessing. */
const KNOWN: Record<string, string> = {
  "waterbender L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "waterbender L10 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "earthbender L10 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "firebender L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "airbender L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-armes L10 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "acrobacia L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "artifex L10 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L3 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L4 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L5 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L6 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L7 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L8 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L9 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "mestre-del-xi L10 length": "fights run past 6 rounds (GOALS.md B25: below level ~5 the limit is out of reach with 26 PV and the ladder)",
  "L3 triangle Protect > Aggro": "an AI that breaks guards beats Protect (GOALS.md B25)",
  "L6 triangle Protect > Aggro": "an AI that breaks guards beats Protect (GOALS.md B25)",
  "L10 triangle Power > Protect": "at level 10 the area finishers outrun Power (GOALS.md B25)",
  "L10 triangle Protect > Aggro": "an AI that breaks guards beats Protect (GOALS.md B25)",
  "firebender L4 dominates": "its side scores 82% against the field at level 4 (measured 2026-11-05; the requirement is new that day, the old requirement 8)",
  "firebender L5 dominates": "its side scores 76% against the field at level 5 (measured 2026-11-05)",
  "firebender L6 dominates": "its side scores 73% against the field at level 6 (measured 2026-11-05)",
  "waterbender L3 choice": "a random card costs 0.3 PV a decision at level 3: its level-3 hand plays alike (measured 2026-11-05; the requirement joins the gate that day)",
  "acrobacia L3 choice": "a random card costs 0.2 PV a decision at level 3 (measured 2026-11-05; the requirement joins the gate that day)",
  "earthbender esquerda blind": "the AI under-plays it though it is often the best play (GOALS.md B24)",
};

describe('the kit gate', () => {
  let r: GateReport;
  beforeAll(async () => { r = await isolated<GateReport>(WORK, 'gate'); });

  it('was measured', () => { expect(r.kits.length).toBeGreaterThan(0); });

  it.skipIf(SMOKE)('fails no cell but the KNOWN ones', () => {
    const fresh = r.failures.filter(f => !(f.key in KNOWN)).map(f => f.text);
    expect(fresh, 'new failing cells: fix them, or add them to KNOWN with why').toEqual([]);
  });

  it.skipIf(SMOKE)('every KNOWN cell still fails', () => {
    const failing = new Set(r.failures.map(f => f.key));
    const fixed = Object.keys(KNOWN).filter(k => !failing.has(k));
    expect(fixed, 'these cells pass now: delete them from KNOWN').toEqual([]);
  });
});
