/**
 * THE SAMPLE-SIZE SEAM. Every harness reads its sample through here so that
 * `GAMES=2` turns all of them down to nothing — the property that lets a smoke
 * run check they still execute.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { calibrationGames, games, searchGames, SMOKE } from '../src/index.js';

const saved = { env: { ...process.env }, argv: [...process.argv] };
afterEach(() => {
  process.env = { ...saved.env };
  process.argv.splice(0, process.argv.length, ...saved.argv);
});

describe('games()', () => {
  it('falls back to what the harness asked for', () => {
    delete process.env.GAMES;
    expect(games(300)).toBe(300);
  });

  it('GAMES overrides it, and --games overrides GAMES', () => {
    process.env.GAMES = '7';
    expect(games(300)).toBe(7);
    process.argv.push('--games', '3');
    expect(games(300)).toBe(3);
  });

  it('ignores nonsense rather than running zero or NaN combats', () => {
    for (const bad of ['0', '-5', 'many', '']) {
      process.env.GAMES = bad;
      expect(games(300)).toBe(300);
    }
    process.env.GAMES = '2.9';
    expect(games(300)).toBe(2);
  });
});

describe('the other two budgets', () => {
  it('searchGames reads SEARCH_GAMES', () => {
    process.env.SEARCH_GAMES = '4';
    expect(searchGames(120)).toBe(4);
    delete process.env.SEARCH_GAMES;
    expect(searchGames(120)).toBe(120);
  });

  it('a calibration sample does NOT follow --games — a baseline must not move with the harness', () => {
    process.env.GAMES = '2';
    delete process.env.CALIBRATION_GAMES;
    // A smoke run (BENCH_SMOKE, read once at import) is the one thing allowed to
    // shrink a baseline: it measures nothing, it only has to execute.
    expect(calibrationGames(500)).toBe(SMOKE ? 20 : 500);
    process.env.CALIBRATION_GAMES = '9';
    expect(calibrationGames(500)).toBe(9);
  });
});
