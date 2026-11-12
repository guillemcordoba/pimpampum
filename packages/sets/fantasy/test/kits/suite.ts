/**
 * What every per-kit file shares: this set, as the isolated child loads it, and
 * the sample the kit analyzer uses by default.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games } from '@pimpampum/bench';

/** The built adapter the child installs (`@pimpampum/set-fantasy/bench`). */
export const SET = {
  module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/bench/index.js'),
  export: 'FANTASY',
};

/**
 * No kit of this set is measured until its creatures are on the dice ladder:
 * at full size none of the calibration's 28 cells is usable, after 43 minutes
 * of calibrating (2026-11-12, the owner's decision; GOALS.md B20). Delete this
 * and each file's `waitsFor` then.
 */
export const WAITS_FOR = 'creatures on the dice ladder: no calibration cell is usable (GOALS.md B20)';

/** Combats in the full-kit run, as `tools/src/kit-analyzer.ts` runs it by default. */
export const KIT_GAMES = games(800);
