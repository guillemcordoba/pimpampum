/**
 * `@pimpampum/ai/audit` — the AI judged against an objective referee, on small
 * fights dealt from imaginary cards. Imports no content set. See
 * ARCHITECTURE.md, "The AI audit".
 */
export { solveZeroSum, solveByRegretMatching, rowValues, colValues, exploitability } from './zero-sum.js';
export { CONTROLS } from './controls.js';
export type { Control } from './controls.js';
export type { MatrixSolution } from './zero-sum.js';
export { ARCHETYPES, DEALT, auditRegistry, STATUS_BEHAVIORS } from './catalogue.js';
export type { Archetype, Params } from './catalogue.js';
export { PROFILE } from './profile.js';
export type { Profile } from './profile.js';
export { buildEngine, generatePosition, MULTI_ROUND } from './position.js';
export type { Position, FighterSpec, CardSpec, StatusSpec, GeneratorConfig } from './position.js';
export { Referee, DEFAULT_REFEREE, BudgetExceeded, Unsupported, outcome, pvDiff, signature, jointKey } from './referee.js';
export type { RefereeOptions, RootSolution, Joint, SeatOption } from './referee.js';
export { checkPosition, aiPicks, DEFAULT_CHECK, ARCHETYPE_SUMMARY } from './check.js';
export type { CheckOptions, CheckResult, PickVerdict } from './check.js';
export { playoutCheck, playOne, playAI, balance, DEFAULT_PLAYOUT } from './playout.js';
export type { PlayoutOptions, PlayoutResult, Candidate } from './playout.js';
export { shrink } from './shrink.js';
export type { ShrinkResult } from './shrink.js';
