import { EnemyTemplate, EnemyRole } from './types.js';

/**
 * Parametric encounter math — the balance model measured by simulation
 * (2026-07 research):
 *
 * - Enemy strength is NOT the sum of levels. The best predictor is TOTAL PV
 *   weighted by each species' `difficulty` (threat per PV point, goblin = 1.0,
 *   measured via 50%-crossing sweeps).
 * - Party strength is dominated by the NUMBER of players (~40 goblin-equivalent
 *   PV each for an even fight); party levels add only a mild correction.
 *
 * PV formula: pv = level²/42 (the old curated basePVs sat on level²/85, doubled
 * for the 20-PV player standard), ×1.5 for solitari bosses (action-economy mass).
 */
export const PV_DIVISOR = 42;
export const SOLITARI_PV_MULT = 1.5;
export const MAX_ENEMY_LEVEL = 60;
export const MIN_ENEMY_LEVEL = 5;

/** Even-fight score contributed per player (measured: goblin PV50 ≈ 40/player). */
export const SCORE_PER_PLAYER = 40;

/** Durability of an enemy fielded at `level`. Solitari gets the boss mass. */
export function pvForLevel(level: number, role?: EnemyRole): number {
  const base = Math.max(2, (level * level) / PV_DIVISOR);
  return Math.round(role === 'solitari' ? base * SOLITARI_PV_MULT : base);
}

/** Threat score of one body: durability × the species' measured difficulty. */
export function bodyScore(template: EnemyTemplate, level: number): number {
  return pvForLevel(level, template.role) * template.difficulty;
}

/** Typical highest-skill level of a benchmark player (the calibration parties
 *  ran 45-level budgets split over 1-2 skills → top skill ≈ 40). */
export const TOP_LEVEL_BASELINE = 40;

/** Even-fight score target for a party. Input: each player's HIGHEST skill
 *  level (research: sums/averages of levels don't predict strength; the top
 *  skill is what wins contests). Bodies dominate; tops above the baseline add
 *  a mild measured correction (doubling party levels moved the threshold only
 *  ~14%), tops below it change nothing. */
export function evenTarget(playerTopLevels: number[]): number {
  const n = playerTopLevels.length;
  if (n === 0) return 0;
  const avgTop = playerTopLevels.reduce((s, v) => s + v, 0) / n;
  const levelCorrection = Math.max(1, 1 + 0.4 * (avgTop / TOP_LEVEL_BASELINE - 1));
  return SCORE_PER_PLAYER * n * levelCorrection;
}

export type EncounterDifficulty = 'easy' | 'medium' | 'hard' | 'boss';

/** Legacy difficulty presets expressed as target player win rates. */
export const DIFFICULTY_WINRATE: Record<EncounterDifficulty, number> = {
  easy: 0.85,
  medium: 0.65,
  hard: 0.5,
  boss: 0.3,
};

/** Kept for display/back-compat: the score multipliers the winrate mapping
 *  reproduces for the legacy presets (0.85→~0.61, 0.65→~0.86, 0.5→1, 0.3→~1.19). */
export const DIFFICULTY_MULT: Record<EncounterDifficulty, number> = {
  easy: 0.6,
  medium: 0.8,
  hard: 1.0,
  boss: 1.25,
};

/** Measured response curve: player win rate vs score/target ratio fits a
 *  logistic p = σ(−K·(ratio − 1)) on the calibration sweeps (elit species:
 *  0.6→~84%, 0.8→~64%, 1.0→~48%, 1.25→~26%). */
export const WINRATE_K = 4.4;

/** Score multiplier that targets a given player win rate (0..1). The rate is
 *  clamped to [0.05, 0.95] — the extremes are asymptotes. */
export function multiplierForWinrate(winrate: number): number {
  const p = Math.min(0.95, Math.max(0.05, winrate));
  return 1 - Math.log(p / (1 - p)) / WINRATE_K;
}

/** Estimated player win rate for an achieved score/target ratio (0..1). */
export function winrateForRatio(ratio: number): number {
  return 1 / (1 + Math.exp(WINRATE_K * (ratio - 1)));
}

/** Classification bands for an assembled pool's score / even-target ratio. */
export interface ScoreBand { id: string; label: string; max: number; }
export const SCORE_BANDS: ScoreBand[] = [
  { id: 'trivial', label: 'Trivial', max: 0.5 },
  { id: 'easy', label: 'Fàcil', max: 0.7 },
  { id: 'medium', label: 'Mitjana', max: 0.9 },
  { id: 'hard', label: 'Difícil', max: 1.1 },
  { id: 'boss', label: 'Cap final', max: 1.35 },
  { id: 'deadly', label: 'Mortal', max: Infinity },
];

export function classifyScore(score: number, target: number): ScoreBand & { ratio: number } {
  const ratio = target > 0 ? score / target : 0;
  const band = SCORE_BANDS.find(b => ratio < b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
  return { ...band, ratio };
}

// --- The solver: composition in, levels & PV out -----------------------------

/** DM-chosen composition: which species and how many of each. */
export interface PoolSpec { template: EnemyTemplate; count: number; }

export interface SolvedGroup {
  templateId: string;
  displayName: string;
  count: number;
  level: number;
  pv: number;
  /** count × bodyScore at the solved level. */
  score: number;
}

export interface SolvedEncounter {
  groups: SolvedGroup[];
  /** Even-fight target for the party. */
  target: number;
  /** Score the solver aimed for (target × difficulty multiplier). */
  budget: number;
  /** Score actually achieved after level clamping. */
  score: number;
  /** score / target. */
  ratio: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Given a composition (species + counts), a party and a difficulty, solve each
 * group's LEVEL (and PV) so the pool's total score hits the budget.
 *
 * Levels keep the species' natural hierarchy: every suggestedLevel is scaled
 * by a common factor λ. Since pv is quadratic in level, the pool score scales
 * with λ², giving the closed form λ = √(budget / scoreAtSuggested).
 */
export function solveEncounter(
  pool: PoolSpec[],
  playerTopLevels: number[],
  /** Desired player win rate, 0..1 (0.5 = even fight). */
  targetWinrate: number,
): SolvedEncounter {
  const target = evenTarget(playerTopLevels);
  const budget = target * multiplierForWinrate(targetWinrate);
  const filled = pool.filter(p => p.count > 0);
  const atSuggested = filled.reduce((s, p) => s + p.count * bodyScore(p.template, p.template.suggestedLevel), 0);
  if (filled.length === 0 || atSuggested <= 0 || budget <= 0) {
    return { groups: [], target, budget: Math.round(budget), score: 0, ratio: 0 };
  }
  const lambda = Math.sqrt(budget / atSuggested);
  const groups: SolvedGroup[] = filled.map(p => {
    const level = clamp(Math.round(lambda * p.template.suggestedLevel), MIN_ENEMY_LEVEL, MAX_ENEMY_LEVEL);
    return {
      templateId: p.template.id,
      displayName: p.template.displayName,
      count: p.count,
      level,
      pv: pvForLevel(level, p.template.role),
      score: Math.round(p.count * bodyScore(p.template, level)),
    };
  });
  const score = groups.reduce((s, g) => s + g.score, 0);
  return { groups, target, budget: Math.round(budget), score, ratio: target > 0 ? score / target : 0 };
}

// --- Single-species suggestion (used by the simulator's calibration sweep) ---

/** Body-count bounds per fielding role. Solitari is hard-capped at 2: stacks
 *  of boss bodies are a cliff, not a step. */
export const ROLE_COUNT: Record<EnemyRole, [number, number]> = {
  horda: [4, 12],
  elit: [2, 8],
  solitari: [1, 2],
};

export interface GeneratedEncounter extends SolvedGroup {
  difficulty: EncounterDifficulty;
  budget: number;
}

/** Solve a single-species encounter: pick a role-bounded count near the
 *  species' natural level, then level via the pool solver. */
export function generateEncounter(
  template: EnemyTemplate,
  playerTopLevels: number[],
  difficulty: EncounterDifficulty,
): GeneratedEncounter {
  const winrate = DIFFICULTY_WINRATE[difficulty];
  const budget = evenTarget(playerTopLevels) * multiplierForWinrate(winrate);
  const perBody = bodyScore(template, template.suggestedLevel);
  let count: number;
  if (template.role === 'solitari') {
    count = budget >= 2.4 * perBody ? 2 : 1;
  } else {
    const [minC, maxC] = ROLE_COUNT[template.role];
    count = clamp(Math.round(budget / perBody), minC, maxC);
  }
  const solved = solveEncounter([{ template, count }], playerTopLevels, winrate);
  const g = solved.groups[0];
  return { ...g, difficulty, budget: solved.budget };
}
