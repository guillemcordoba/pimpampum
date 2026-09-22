/**
 * `@pimpampum/bench` — the measurement layer, and nothing about any particular
 * game's content.
 *
 * Everything this package produces is a NUMBER SOMEONE WILL MAKE A CONTENT
 * DECISION ON, which sets the standard: a harness here is not allowed to print
 * something it cannot defend. The rules that follow from that are documented
 * on the modules themselves — one reference party, seeded randomness, an error
 * bar on every rate, a sample size that can be turned down to nothing.
 *
 * It takes the content as a parameter (`GameSet`), so a second set of cards
 * gets the same instrument rather than a copy of it.
 */
// --- The contract a content set implements, and the set in play -------------
export type {
  GameSet, PartySpec, DrawnPartySpec, ExplicitPartySpec, CharacterBuildSpec,
  FieldedGroup, Shape, Cell, SubjectKit,
} from './gameset.js';
export { useSet, theSet, isExplicitParty, partyKits } from './gameset.js';

// --- Playing fights ---------------------------------------------------------
export {
  theRegistry, randomTeam, runMatch, runMatchup, mirrorSweep, mutate, restoreAll, MIRROR_DEPTH,
} from './arena.js';
export type { MatchupResult, SweepArm, SweepOptions } from './arena.js';

// --- Measuring in cells -----------------------------------------------------
export {
  chooserFor, uniformChooser, oneCardChooser, instrument, newCardCounters,
  cellResult, cellKey, runOneCell, runMatrix, matrixKey, matrixDeltaStderr, roundPercentiles,
  CELL_SEED,
  CELL_AI, THOUGHTLESS_POLICIES, RESTRICTED_POLICIES, SIDE_POLICIES,
} from './cells.js';
export type { CellPolicy, CellSetup, CellRun, CachedCell, CardCounters, MatrixResult } from './cells.js';

// --- Alternative policies, and honest duels between them --------------------
export {
  heuristic, depth1, depth1x, spam, uniform, feeble, firstLegal, split, headToHead,
  mirrorParty, MIRROR_SEED, POLICIES, BASELINES, LADDER,
} from './policies.js';
export type { Chooser, HeadToHead } from './policies.js';

// --- Per-decision card value ------------------------------------------------
export * from './regret.js';

// --- Control subjects: kits whose verdict is known before measuring ---------
export {
  withControlKit, flatKit, deadCardKit, ladderKit, trapKit, situationalKit,
  defenceOnlyKit, blitzKit, losingOnlyKit,
} from './control-kits.js';

// --- Caching the fixed cost of a run ----------------------------------------
export { cached, countedCached, key, enginePrint, actionPrint, skillPrint, enemyPrint, cacheStatus } from './cache.js';
export {
  stderr, pct, pctCoarse, deltaPP, pp, deltaStderr, significant, gamesFor, maxOfKBias, exact, share,
} from './report.js';
export { games, searchGames, calibrationGames, SMOKE } from './games.js';
export { lanes, warm } from './parallel.js';
export type { WarmJob } from './parallel.js';
export { assertParsed, parseAttacks } from './combatlog.js';
