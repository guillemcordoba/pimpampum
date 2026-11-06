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
  DEFAULT_CARD_VALUE_MODELS, blindCards,
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
export {
  measureGate, prepareGate, gateJobs, blameJobs, runGateJob, gateKitCell, gateStyleCell, gateCardCells, gateChoiceCell, autopsyLines,
  GATE_LEVELS, STYLE_LEVELS, CARD_LEVELS, GATE_BUDGET, GATE_QUICK,
} from './gate.js';
export type { GateReport, GateFailure, GateKitCell, GateStyleCell, GateChoiceCell, KitCardBlame, LengthAutopsy, FightShape, GateCardCell, GateBudget, GateJob, GateScope, GateContext } from './gate.js';
export { tuneKit, evaluatePatch, applyPatch, knobsFor, kitScore, diceStep, describePatch } from './tune.js';
export type { NumbersPatch, CardPatch, Knob, KitScore, Evaluated, TuneResult, TuneStep } from './tune.js';
export { feasibility } from './feasibility.js';
export type { FeasibilityInput, FeasibilityRow, LadderRung } from './feasibility.js';
export { vanillaKit, vanillaPrint } from './vanilla.js';
export { derivePV, deriveLevel, MAX_ROUND_ONE_KOS, MAX_FAST_KOS } from './derive-pv.js';
export type { PVDerivation, PVOptions } from './derive-pv.js';
export { summarise, explain, fastCards, MIN_FAST_PLAYS, vanillaMatches, MATCH_TOLERANCE, kitDivergences, KIT_TOLERANCE } from './dynamics.js';
export type { DynamicsSummary, MatchCheck, KitDivergence } from './dynamics.js';
export { CANDIDATE_FIXES, TODAY, FIX_BUDGET, evaluateFix, scoreFix, rankFixes, burstHolds, checksMet } from './fixes.js';
export type { Fix, FixBudget, FixLevel, FixResult, FixScore } from './fixes.js';
export { census } from './census.js';
export type { CensusCard, Role } from './census.js';
export { vanillaTwin, withVanillaSet, twinDynamics, TWIN_DEFAULTS } from './vanilla.js';
export type { TwinParams } from './vanilla.js';
export { deriveOnTwins, deriveTwinLevel } from './derive-twins.js';
export type { TwinDeriveOptions } from './derive-twins.js';
export { REQUIREMENTS } from './requirements.js';
export type { Requirement, RequirementGroup } from './requirements.js';
