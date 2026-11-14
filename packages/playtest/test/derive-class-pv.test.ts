/**
 * The PV derivation's decision rules, on inputs whose answer is known: the
 * line it fits, and when a pinned table is kept instead of a fresh fit.
 */
import { describe, it, expect } from 'vitest';
import { asFairAs, fitLine, fitsEveryWindow, tierStaysInside, type LevelWindow } from '../src/index.js';

/** A level whose aim is its ceiling unless the test says otherwise. */
const window = (level: number, floor: number, aim: number | null, ceiling: number | null = aim): LevelWindow =>
  ({ level, floor, aim, ceiling, floorCards: [], focusSetUps: {}, overCeiling: null, measured: [] });

describe('the line through the windows', () => {
  it('runs under every aim it can reach and never under a floor', () => {
    const windows = [window(3, 4, 9), window(6, 11, 18), window(9, 11, 27)];
    const line = fitLine(windows);
    expect(line).toMatchObject({ base: 0, slope: 3, over: [] });
    expect(fitsEveryWindow(windows, line.base, line.slope)).toBe(true);
  });

  it('aims under the ceiling, not at it', () => {
    expect(fitLine([window(3, 4, 9, 14), window(6, 11, 18, 25)])).toMatchObject({ base: 0, slope: 3 });
  });

  it('is read at the whole PV a hero has: a half point over an aim is a point over', () => {
    // 0.5 + 2.5 × level would give 13 and 15.5: sixteen at level 6, over its aim.
    const line = fitLine([window(5, 4, 13), window(6, 11, 15)]);
    expect(line.over).toEqual([]);
    expect(fitsEveryWindow([window(6, 11, 15)], 0.5, 2.5)).toBe(false);
    expect(fitsEveryWindow([window(6, 11, 15)], 0, 2.5)).toBe(true);
  });

  it('names the levels it could only clear over their aim', () => {
    expect(fitLine([window(3, 10, 6), window(6, 10, 30)]).over).toEqual([3]);
  });
});

describe('a pinned line is kept while it fits', () => {
  const windows = [window(3, 4, 14), window(9, 11, 25)];

  it('fits anywhere between the floors and the aims, the bounds included', () => {
    expect(fitsEveryWindow(windows, 2.5, 2.5)).toBe(true);
    expect(fitsEveryWindow(windows, 4, 0)).toBe(false);
  });

  it('does not fit over one aim or under one floor', () => {
    expect(fitsEveryWindow(windows, 0, 3)).toBe(false);
    expect(fitsEveryWindow(windows, 0, 1)).toBe(false);
  });

  it('does not fit between an aim and its ceiling', () => {
    expect(fitsEveryWindow([window(6, 11, 15, 18)], 0, 3)).toBe(false);
  });

  it('THE NULL: nothing fits a level where fights never end in time', () => {
    expect(fitsEveryWindow([window(3, 4, null)], 2.5, 2.5)).toBe(false);
  });
});

describe('a tier stays between the floors and the ceilings', () => {
  const windows = [window(3, 8, 10, 14), window(6, 11, 15, 18)];

  it('may pass the aim up to the ceiling, the PV a hero has being whole', () => {
    expect(tierStaysInside(windows, 0, 3)).toBe(true);
    expect(tierStaysInside(windows, 0, 3.05)).toBe(true);
  });

  it('may not pass a ceiling or drop under a floor', () => {
    expect(tierStaysInside(windows, 0, 3.25)).toBe(false);
    expect(tierStaysInside(windows, 0, 2)).toBe(false);
  });

  it('THE NULL: a level without a ceiling caps nothing', () => {
    expect(tierStaysInside([window(3, 4, null)], 0, 6)).toBe(true);
  });
});

describe('pinned tiers are kept while no clearly less fair', () => {
  it('keeps them inside the two samples\' noise, and when they are the fairer', () => {
    expect(asFairAs({ imbalance: 0.176, se: 0.02 }, { imbalance: 0.160, se: 0.02 })).toBe(true);
    expect(asFairAs({ imbalance: 0.10, se: 0.02 }, { imbalance: 0.30, se: 0.02 })).toBe(true);
  });

  it('drops them when a rival is clearly fairer', () => {
    expect(asFairAs({ imbalance: 0.272, se: 0.02 }, { imbalance: 0.185, se: 0.02 })).toBe(false);
  });
});
