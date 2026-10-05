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
  FieldedGroup, Shape, Cell, SubjectKit, KitInfo, Calibration, SolveOutcome, EncounterOptions,
} from './gameset.js';
export { useSet, theSet, isExplicitParty, partyKits } from './gameset.js';

// --- Where a subject is measured: the set's calibration, computed ---------
export {
  referenceParty, calibrationParty, subjectParty, companyCount, companyPrint, groupsPrint, standInFor,
  shapeEnemies, baselineFor, solvedShape, isSaturated, usableCells, saturatedCells,
} from './positions.js';
export type { SolvedShape } from './positions.js';

// --- Playing fights ---------------------------------------------------------
export {
  theRegistry, randomTeam, runMatch, MIRROR_DEPTH,
} from './arena.js';

// --- Measuring in cells -----------------------------------------------------
export {
  instrument, newCardCounters,
  cellResult, cellKey, matrixCell, runMatrix, roundPercentiles, dropCard,
  CELL_AI,
} from './cells.js';
export type { CellSetup, CachedCell, CardCounters, MatrixResult } from './cells.js';

// --- Alternative policies, and honest duels between them --------------------
export {
  heuristic, depth1, depth1x, spam, uniform, feeble, firstLegal, split, headToHead,
  mirrorParty, MIRROR_SEED, leaning, STYLE_SHARE, triangleStyles, cycleDuels,
} from './policies.js';
export type { Chooser, HeadToHead, CycleEdge } from './policies.js';

// --- Per-decision card value ------------------------------------------------
export * from './regret.js';

// --- Caching the fixed cost of a run ----------------------------------------
export { cached, countedCached, key, enginePrint, fingerprintedSources, actionPrint, skillPrint, enemyPrint, cacheStatus } from './cache.js';
export {
  stderr, pct, pctCoarse, deltaPP, pp, deltaStderr, significant, gamesFor, exact, share,
} from './report.js';
export { flag, games, searchGames, calibrationGames, SMOKE } from './games.js';
export { lanes, warm } from './parallel.js';
export type { WarmJob, WarmWorker } from './parallel.js';
export { assertParsed, parseAttacks } from './combatlog.js';
export { isolated } from './isolate.js';
