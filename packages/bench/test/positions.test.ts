/**
 * WHERE A SUBJECT IS MEASURED — the calibration a set declares, turned into
 * parties, solved shapes and cells.
 *
 * The solver is stubbed here (a fixed composition per shape), because what is
 * under test is what bench does WITH a solve, not the solve; the real solver
 * has its own tests, and the real pipeline its own slow A/A test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  baselineFor, calibrationParty, companyCount, isSaturated, referenceParty, saturatedCells,
  shapeEnemies, solvedShape, standInFor, subjectParty, usableCells, useSet, type GameSet,
} from '../src/index.js';
import { SYNTHETIC } from '../src/testing.js';

const FIXED: Record<string, { enemyId: string; count: number; level: number; pv: number }[]> = {
  pack: [{ enemyId: 'grunt', count: 4, level: 2, pv: 15 }],
  // A fight nobody can lose, and one nobody can win: both must be thrown out.
  boss: [{ enemyId: 'brute', count: 1, level: 2, pv: 1 }],
  mixed: [{ enemyId: 'brute', count: 3, level: 2, pv: 400 }],
};

const STUBBED: GameSet = {
  ...SYNTHETIC,
  id: 'synthetic-stubbed-solve',
  solveEncounter(pool) {
    const shape = SYNTHETIC.calibration.shapes.find(s => s.pool === pool)!;
    return { groups: FIXED[shape.label], clamped: false, durationCapped: false };
  },
};

beforeAll(() => {
  process.env.CALIBRATION_GAMES = '40';
  useSet(STUBBED);
});

describe('parties built from the calibration', () => {
  it('the reference party is the declared kits, fully learnt', () => {
    const party = referenceParty();
    expect(party.characters!.map(c => Object.keys(c.skills)[0])).toEqual(STUBBED.calibration.referenceKits);
    for (const c of party.characters!) {
      const [kit, level] = Object.entries(c.skills)[0];
      expect(level).toBe(STUBBED.kit(kit)!.fullLevel);
    }
  });

  it('a calibration party is the stand-in in seat 1 and the company row behind it', () => {
    for (let row = 0; row < companyCount(); row++) {
      const kits = calibrationParty(row).characters!.map(c => Object.keys(c.skills)[0]);
      expect(kits[0]).toBe(standInFor(row));
      expect(kits.slice(1)).toEqual(STUBBED.calibration.company[row]);
    }
  });

  it('a subject party is the calibration party with the subject in the stand-in\'s seat', () => {
    const p = subjectParty('duelist', 2, 1);
    expect(p.characters![0].skills).toEqual({ duelist: 2 });
    expect(p.characters!.slice(1)).toEqual(calibrationParty(1).characters!.slice(1));
  });
});

describe('solved shapes and their cells', () => {
  it('fields exactly what the solve returned', () => {
    STUBBED.calibration.shapes.forEach((s, i) => expect(shapeEnemies(i)).toEqual(FIXED[s.label]));
  });

  it('measures a baseline in every row, and memoises the shape', () => {
    const s = solvedShape(0);
    expect(s.byCompany).toHaveLength(companyCount());
    for (const b of s.byCompany) { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(1); }
    expect(solvedShape(0)).toBe(s);
    expect(s.byCompany[0]).toBe(baselineFor(0, 0));
  });

  it('keeps the unsaturated cells and names the rest — a partition of the matrix', () => {
    const usable = usableCells(), dropped = saturatedCells();
    expect(usable.length + dropped.length).toBe(STUBBED.calibration.shapes.length * companyCount());
    for (const c of usable) expect(isSaturated(c.baseline)).toBe(false);
    for (const c of dropped) expect(isSaturated(c.baseline)).toBe(true);
    // The unlosable and the unwinnable shapes are exactly the ones thrown out.
    expect(dropped.map(c => c.label.split('/')[0]).sort()).toEqual(['boss', 'boss', 'mixed', 'mixed']);
    expect(usable.every(c => c.label.startsWith('pack/'))).toBe(true);
  });
});
