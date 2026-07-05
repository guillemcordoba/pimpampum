/**
 * Enemy-difficulty calibration core, shared by the `pnpm calibrate` script and
 * the `enemy-difficulty` guard test.
 *
 * The encounter model promises a player winrate (solveEncounter → the logistic
 * response curve). This measures, per species, whether reality matches the
 * promise: random parties, random single-species compositions solved by the
 * model, many battles. If a kit changes strength, the measured winrate drifts
 * from the claim and the suggested `difficulty` correction shows what to put
 * in the template.
 */
import { CombatEngine, assignStrategies, AIStrategy, Character } from '@pimpampum/engine';
import {
  EnemyTemplate, createEnemyFromTemplate, solveEncounter, winrateForRatio, WINRATE_K,
} from '@pimpampum/enemies';
import { REGISTRY, randomTeam, shuffle, randInt } from './tests/helpers.js';

const STRATS = [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect];

export interface CalibrationOptions {
  /** Target player winrates to probe. */
  targets?: number[];
  /** Random configurations per target. */
  configs?: number;
  /** Battles per configuration. */
  games?: number;
}

export interface CalibrationResult {
  templateId: string;
  difficulty: number;
  /** Average winrate the model promised across all battles (post-clamp). */
  claim: number;
  /** Winrate actually measured (draws count as half a win for each side). */
  real: number;
  /** Fraction of games that ended in a draw/timeout — high values mean the
   *  kit stalls and the scalar model is suspect regardless of the factor. */
  drawRate: number;
  /** Difficulty value that would reconcile claim and reality. */
  suggested: number;
  games: number;
}

const logit = (p: number) => Math.log(p / (1 - p));
const clampP = (p: number) => Math.min(0.95, Math.max(0.05, p));

function topLevel(c: Character): number {
  return Math.max(...c.skills.values());
}

function randomCount(role: string): number {
  if (role === 'solitari') return 1;
  if (role === 'horda') return randInt(3, 8);
  return randInt(2, 5);
}

/** Measure one species: model's promised winrate vs simulated reality. */
export function calibrateSpecies(template: EnemyTemplate, opts: CalibrationOptions = {}): CalibrationResult {
  const targets = opts.targets ?? [0.3, 0.5, 0.7, 0.85];
  const configs = opts.configs ?? 30;
  const games = opts.games ?? 14;

  let claimAcc = 0, winAcc = 0, drawAcc = 0, n = 0;
  for (const target of targets) {
    for (let cfg = 0; cfg < configs; cfg++) {
      const playerCount = randInt(3, 5);
      const budget = randInt(35, 55);
      const count = randomCount(template.role);
      const tops = randomTeam('R', playerCount, budget).map(topLevel);
      const solved = solveEncounter([{ template, count }], tops, target);
      if (solved.groups.length === 0) continue;
      const g = solved.groups[0];
      const claim = winrateForRatio(solved.ratio); // the model's own promise, post-clamp
      for (let i = 0; i < games; i++) {
        const players = randomTeam('P', playerCount, budget);
        const enemies = Array.from({ length: g.count }, (_, k) =>
          createEnemyFromTemplate(template, Object.fromEntries(template.skills.map(s => [s, g.level])), `${template.displayName} ${k}`, [], g.pv));
        assignStrategies(players, shuffle(STRATS));
        const w = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
        claimAcc += claim;
        // A draw is not a player loss — score it half for each side so
        // stall-prone kits aren't silently rated as strong.
        winAcc += w === 0 ? 1 : w === null ? 0.5 : 0;
        if (w === null) drawAcc++;
        n++;
      }
    }
  }

  const claim = claimAcc / n;
  const real = clampP(winAcc / n);
  // Players winning more than promised ⇒ the kit is weaker than scored ⇒ its
  // implied score ratio is lower. Correct difficulty by the ratio of ratios.
  const rIntended = 1 - logit(clampP(claim)) / WINRATE_K;
  const rImplied = 1 - logit(real) / WINRATE_K;
  const suggested = template.difficulty * (rImplied / rIntended);
  return { templateId: template.id, difficulty: template.difficulty, claim, real, drawRate: drawAcc / n, suggested, games: n };
}

/** Species whose kit currently breaks the scalar model (documented, skipped
 *  by the guard test). Empty since the wolf's Udol became once-per-wolf with
 *  howl-less summons (2026-07) — the pack is bounded and calibrates cleanly. */
export const CALIBRATION_EXCLUDED = new Set<string>([]);
