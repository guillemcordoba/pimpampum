/**
 * THE SET'S BALANCE TEST, THE NIGHTLY TIER — is the best strategy a dumb one?
 * (playtest `pool.ts`; the user, 2026-11-15: "a test or requirement that goes
 * red when the best strat is a dumb one"). At each checkpoint the strategy
 * pool is grown by the double oracle from always-attack, always-defend and
 * always-Focus, and judged by `poolVerdict`: the final mix is mostly
 * strategies that follow the fight or the opponent, and each of the three
 * dumbest clearly loses to it. Its controls are mock games
 * (`playtest/test/pool.test.ts`). A pool costs 20 minutes to over two hours
 * at 24 lanes, so it runs with `pnpm test:nightly`, not in the slow tier
 * (`round-table.slow.test.ts`).
 *
 * Read a pool member by member with `tools/src/strategy-pool.ts --set elements`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { games, pct, SMOKE } from '@pimpampum/bench';
import { describeStrategy, measurePool, STYLE_LEVELS, type PoolReading } from '@pimpampum/playtest';

const SET = { module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bench/index.js'), export: 'ELEMENTS' };
const FIGHTS = games(200);

/**
 * Levels whose pool is known to be red today, by `L<level>`, with why —
 * asserted to STILL be red, so the day one turns green it leaves this list.
 * Filled from the measurement, never by guessing.
 */
const KNOWN_RED: Record<string, string> = {
  L3: 'always-attack scores 50.0% ±3.5 against the mix (200 fights a duel, 2026-11-17); under Envoltat it is green (41.9%), so it is attacks adding up (GOALS.md goal 1)',
  L6: 'always-attack scores 49.3% ±3.5 against a mix 95% one table (2026-11-17, as 2026-11-15); green under Envoltat and under whole + both (GOALS.md goal 1)',
  L10: 'the pool never leaves always-attack: it scores 50% against itself and nothing found beats it (2026-11-17); red under Envoltat too (GOALS.md goal 1)',
};

describe('the best strategy is not a dumb one', () => {
  let pools: PoolReading[];
  beforeAll(async () => {
    pools = await Promise.all(STYLE_LEVELS.map(level => measurePool({ set: SET, level, games: FIGHTS, ...(SMOKE ? { maxMembers: 4, families: ['table'] } : {}) })));
  });

  it('was measured: a pool a checkpoint', () => {
    expect(pools.map(p => p.level)).toEqual([...STYLE_LEVELS]);
  });

  for (const level of STYLE_LEVELS) {
    const key = `L${level}`;
    const known = key in KNOWN_RED;
    it.skipIf(SMOKE)(`${known ? 'KNOWN to fail: ' : ''}${key}`, () => {
      const p = pools.find(x => x.level === level)!;
      const mix = p.result.members.map((m, i) => ({ m, share: p.result.mix[i] })).filter(x => x.share >= 0.05)
        .map(x => `${describeStrategy(x.m)} ${Math.round(100 * x.share)}%`).join('; ');
      const dumbest = p.verdict.dumbest.map(f => `${describeStrategy(f.table)} ${pct(f.againstMix, FIGHTS)}`).join(', ');
      const detail = `${key}: ${p.result.members.length} members${p.result.converged ? '' : ' (still growing)'}; the mix: ${mix}; against it: ${dumbest}; the AI ${pct(p.aiScore, FIGHTS)}`;
      console.log(`${p.verdict.ok ? '✅' : '❌'} ${detail}`);
      if (known) expect(p.verdict.ok, `${key} is now GREEN — remove it from KNOWN_RED. ${detail}`).toBe(false);
      else expect(p.verdict.why, detail).toEqual([]);
    });
  }
});
