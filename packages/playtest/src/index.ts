/**
 * `@pimpampum/playtest` — the requirements a set's content must meet, the
 * rules that judge them, and the control kits that prove the judging works.
 *
 * Takes its content from whichever `GameSet` is installed (`useSet`), exactly
 * like the bench it measures with.
 */
export * from './rules.js';
export {
  analyze, setupFor, cardsOf, cellsFor, subjectPrintFor, screenArms, analysisJobs, runAnalysisJob,
  DEFAULT_CARD_VALUE_MODELS,
} from './analyze.js';
export type { Subject, Verdict, KitReport, AnalyzeBudget, AnalysisJob } from './analyze.js';
export { prepare, installSet, withSubject } from './prepare.js';
export type { RunContext } from './prepare.js';
export type { SubjectKit } from '@pimpampum/bench';
export {
  withControlKit, flatKit, deadCardKit, ladderKit, trapKit, comboKit,
  defenceOnlyKit, blitzKit, losingOnlyKit, dominantKit, strongKit, weakKit, standInCopyKit,
} from './control-kits.js';
export { analyzeIsolated } from './isolated.js';
export type { IsolatedRun, ControlName } from './isolated.js';
