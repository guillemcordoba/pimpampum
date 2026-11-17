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
 * Read a pool member by member with `tools/src/strategy-pool.ts --set fantasy`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { games, pct, SMOKE } from '@pimpampum/bench';
import { describeStrategy, measurePool, STYLE_LEVELS, type PoolReading } from '@pimpampum/playtest';

const SET = { module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bench/index.js'), export: 'FANTASY' };
const FIGHTS = games(200);

/**
 * Levels whose pool is known to be red today, by `L<level>`, with why —
 * asserted to STILL be red, so the day one turns green it leaves this list.
 * Filled from the measurement, never by guessing.
 */
// Not measured yet: the first run (2026-11-17) was stopped after 90 minutes
// to give its lanes to the night's goal; its duels are in the night's cache.
const KNOWN_RED: Record<string, string> = {
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
