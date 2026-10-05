/**
 * `@pimpampum/playtest` — the requirements a set's content must meet, the
 * rules that judge them, and the control kits that prove the judging works.
 *
 * Takes its content from whichever `GameSet` is installed (`useSet`), exactly
 * like the bench it measures with.
 */
export * from './rules.js';
export {
  analyze, setupFor, cardsOf, cellsFor, subjectPrintFor, analysisJobs, runAnalysisJob,
  DEFAULT_CARD_VALUE_MODELS,
} from './analyze.js';
export type { Subject, Verdict, KitReport, AnalyzeBudget, AnalysisJob, ChoiceCost } from './analyze.js';
export { measureCycle, measureTriangle } from './triangle.js';
export type { TriangleEdge, TriangleReport } from './triangle.js';
export { prepare, installSet, withSubject } from './prepare.js';
export type { RunContext } from './prepare.js';
export type { SubjectKit } from '@pimpampum/bench';
export {
  withControlKit, flatKit, deadCardKit, noisyTwinKit, comboKit,
  defenceOnlyKit, blitzKit, strongKit, weakKit, plantedKit, standInCopyKit,
} from './control-kits.js';
export { analyzeIsolated, blameIsolated } from './isolated.js';
export type { IsolatedRun, ControlName } from './isolated.js';

export { blameEdge, blameKit, showCulprits } from './blame.js';
export type { Culprit, BlameRequirement } from './blame.js';
