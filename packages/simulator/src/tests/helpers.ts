/**
 * Test-side alias for the arena.
 *
 * The registry, the seeded team generator and the match runners live in
 * `bench/arena.ts` now — nine non-test scripts import them, so `tests/` was
 * the wrong home. This file stays as the import path the test files use.
 */
export {
  REGISTRY, PLAYER_PV, MIRROR_DEPTH,
  shuffle, randomPlayer, randomTeam,
  runMatch, runMatchup, mirrorSweep, mutate, restoreAll,
} from '../bench/arena.js';
export type { MatchupResult } from '../bench/arena.js';

export { getEnemy, createEnemyFrom, buildSolvedEncounter } from '@pimpampum/enemies';
