/**
 * EVERY HARNESS STILL RUNS.
 *
 * This checks nothing about the numbers — it runs each harness at two combats,
 * which measures nothing at all. What it checks is that each one still EXECUTES
 * against today's content, which is the failure that actually happened:
 * `experiment-berserk` and `experiment-balance-pass` both crashed on
 * `furia-implacable`, a berserk card renamed at some point nobody recorded, and
 * they had been dead ever since. Nothing noticed, because checking them cost
 * 2,500 and 4,000 combats.
 *
 * That is the whole mechanism. A harness nobody can run cheaply is a harness
 * nobody runs, and a harness nobody runs rots in silence: renamed card ids,
 * deleted skills, changed log formats, removed exports. Run them all, every
 * time, at a size that costs nothing, and the rot surfaces the day it starts.
 *
 * It is also what makes `bench/games.ts` non-optional: a harness that cannot be
 * turned down to two combats cannot be in here, and one that is not in here is
 * one we will find broken months later.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.resolve(SRC, '..');
const TSX = path.join(PKG, 'node_modules', '.bin', 'tsx');

/**
 * Harnesses are the top-level scripts: everything directly in `src/` that is
 * not a library. `bench/` and `tests/` are libraries; `node-shims.d.ts` is a
 * declaration file. Discovered rather than listed, so a NEW harness is covered
 * the moment it is added instead of when someone remembers to register it.
 */
function harnesses(): string[] {
  return fs.readdirSync(SRC)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .sort();
}

/**
 * `play.ts` is the hand-play harness: it exists to be edited and re-run by a
 * person, plays a fixed scripted round, and has no sample size to turn down.
 * Running it proves it still executes, which is all we want from it.
 */
const SIZES: Record<string, Record<string, string>> = {
  default: { GAMES: '2', SEARCH_GAMES: '10' },
};

describe('every harness still runs against today\'s content', () => {
  const found = harnesses();

  it('finds the harnesses', () => {
    // A guard on the guard: if the glob ever matches nothing, every test below
    // would vacuously pass and this file would be worth less than nothing.
    expect(found.length).toBeGreaterThan(5);
  });

  for (const file of found) {
    it(`${file}`, () => {
      const env = { ...process.env, ...(SIZES[file] ?? SIZES.default), BENCH_SMOKE: '1' };
      try {
        execFileSync(TSX, [path.join(SRC, file)], {
          env, cwd: PKG, stdio: 'pipe', timeout: 180_000,
        });
      } catch (err) {
        const e = err as { stderr?: Buffer; stdout?: Buffer; message: string };
        const detail = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim().slice(-1200);
        throw new Error(
          `${file} no s'executa amb GAMES=2.\n\n${detail}\n\n`
          + 'Això no és un problema de mostra: el guió ja no funciona amb el contingut actual '
          + '(una carta canviada de nom, una habilitat esborrada, un format de registre mogut). '
          + 'Arregla el guió o esborra\'l — un guió que no corre no mesura res.',
        );
      }
    });
  }
}, 200_000);
