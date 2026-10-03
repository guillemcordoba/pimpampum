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

/** Combats in the full-kit run, as `tools/src/kit-analyzer.ts` runs it by default. */
export const KIT_GAMES = games(800);
