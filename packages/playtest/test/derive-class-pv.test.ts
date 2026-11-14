/**
 * The PV derivation's decision rules, on inputs whose answer is known: the
 * line it fits, and when a pinned table is kept instead of a fresh fit.
 */
import { describe, it, expect } from 'vitest';
import { asFairAs, fitLine, fitsEveryWindow, type LevelWindow } from '../src/index.js';

const window = (level: number, floor: number, ceiling: number | null): LevelWindow =>
  ({ level, floor, ceiling, floorCards: [], focusSetUps: {}, overCeiling: null, measured: [] });

describe('the line through the windows', () => {
  it('runs under every ceiling it can reach and never under a floor', () => {
    const windows = [window(3, 4, 9), window(6, 11, 18), window(9, 11, 27)];
    const line = fitLine(windows);
    expect(line).toMatchObject({ base: 0, slope: 3, over: [] });
    expect(fitsEveryWindow(windows, line.base, line.slope)).toBe(true);
  });

  it('names the levels it could only clear over their ceiling', () => {
    expect(fitLine([window(3, 10, 6), window(6, 10, 30)]).over).toEqual([3]);
  });
});

describe('a pinned line is kept while it fits', () => {
  const windows = [window(3, 4, 14), window(9, 11, 25)];

  it('fits anywhere between the floors and the ceilings, the bounds included', () => {
    expect(fitsEveryWindow(windows, 2.5, 2.5)).toBe(true);
    expect(fitsEveryWindow(windows, 4, 0)).toBe(false);
  });

  it('does not fit over one ceiling or under one floor', () => {
    expect(fitsEveryWindow(windows, 0, 3)).toBe(false);
    expect(fitsEveryWindow(windows, 0, 1)).toBe(false);
  });

  it('THE NULL: nothing fits a level where fights never end in time', () => {
    expect(fitsEveryWindow([window(3, 4, null)], 2.5, 2.5)).toBe(false);
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
