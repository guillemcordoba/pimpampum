/**
 * The measuring half of `ai-strength.slow.test.ts`, run in its own process
 * (`isolated`): every head-to-head the assertions read, on the fantasy set.
 */
import {
  depth1, depth1x, feeble, firstLegal, games, gamesFor, headToHead, type HeadToHead, heuristic,
  spam, uniform, useSet,
} from '@pimpampum/bench';
import { FANTASY } from '../src/bench/index.js';

/** Sized by the finest claim on the page: `gamesFor(5)`. */
export const GAMES = games(gamesFor(5));

export interface Ladder {
  vs: Record<'firstLegal' | 'feeble' | 'uniform' | 'spam', HeadToHead>;
  vsHeuristic: HeadToHead;
  vsProduction: HeadToHead;
}

export function measure(): Ladder {
  useSet(FANTASY);
  return {
    vs: {
      firstLegal: headToHead(depth1, firstLegal, GAMES),
      feeble: headToHead(depth1, feeble, GAMES),
      uniform: headToHead(depth1, uniform, GAMES),
      spam: headToHead(depth1, spam, GAMES),
    },
    vsHeuristic: headToHead(depth1, heuristic, GAMES),
    vsProduction: headToHead(depth1x, depth1, GAMES),
  };
}
