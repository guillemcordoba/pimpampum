/**
 * Encounter balancer v2 — rebuilt 2026-07 on the dice-contest system, from
 * measured data (simulator/src/measure-threat.ts, adaptive PV-multiplier
 * sweeps vs standard random parties):
 *
 *  - Each template carries a measured `threat` per body at printed basePV,
 *    normalized so a 4-player party's strength is 1.
 *  - Party strength scales as S(n) = (n/4)^PARTY_ALPHA.
 *  - Player winrate follows w = 1 / (1 + e^{k·(r − 1)}) with
 *    r = totalThreat / S(n) and k = WINRATE_K.
 *
 * DIFFICULTY IS AN INPUT (a target winrate), never a property of an
 * encounter. The solver has two levers per group: level (coarse, flavourful —
 * a reduced kit knows fewer actions) and a PV multiplier (fine, continuous).
 */
import { EnemyTemplate } from './types.js';
import { getEnemyTemplate } from './catalog.js';

/** Winrate steepness (median of per-template logit fits, 2026-07 re-measure). */
export const WINRATE_K = 2.8;
/** Party-strength scaling exponent: S(n) = (n/4)^α. Recomputed β-consistently
 *  from the goblin party probes (S3 .69, S5 1.23, S6 2.05 → α ≈ 1.5). */
export const PARTY_ALPHA = 1.5;
/** PV-multiplier clamp for solved groups (linearity was measured within this). */
export const PV_MULT_MIN = 0.4;
export const PV_MULT_MAX = 3;
/**
 * Threat is SUPER-linear in body count (action economy, swarm synergies):
 * a group's threat scales as (count/probeCount)^β. Measured per-template
 * β ≈ 2.0 (best calibration across 60 random setups incl. mixed comps —
 * see simulator measure-model-accuracy.ts); because it varies by kit, solved counts
 * are kept within ×COUNT_DRIFT_MAX of the measured probe count and PV does
 * the fine adjustment.
 */
export const COUNT_BETA = 2.0;
export const COUNT_DRIFT_MAX = 1.34;

/** Body count each role was MEASURED at (threat anchor). */
export const PROBE_COUNT: Record<EnemyTemplate['role'], number> = {
  horda: 6,
  elit: 3,
  solitari: 1,
};

/** Bodies a role supports in a generated encounter. */
export const ROLE_COUNT: Record<EnemyTemplate['role'], [number, number]> = {
  horda: [4, 12],
  elit: [2, 8],
  solitari: [1, 2],
};

/** Handy target-winrate presets for UIs. The solver takes any winrate. */
export const TARGET_WINRATES = { easy: 0.85, medium: 0.65, hard: 0.5, boss: 0.3 } as const;
export type EncounterDifficulty = keyof typeof TARGET_WINRATES;

/** Party strength for a player count (4 players ≡ 1). */
export function partyStrength(playerCount: number): number {
  return Math.pow(Math.max(1, playerCount) / 4, PARTY_ALPHA);
}

/**
 * Threat multiplier of a reduced kit (level < kit size). Enemy kits RAMP
 * (weakest attack at level 1, signature power late — intentions.md), and the
 * measured factors track the level fraction almost exactly (2026-07 ramped
 * kits: goblin ×0.49 at 2/4, golem ×0.53 at 3/5): half the kit ≈ half the
 * threat. Kits whose attacks all sit early (basilisc ×1.11 at 3/5) overshoot
 * — known per-kit variance.
 */
export function levelFactor(level: number, kitSize: number): number {
  if (level >= kitSize) return 1;
  return Math.max(0.3, level / kitSize);
}

/** Threat of one body of `t` at `level` with its PV scaled by `pvMult`. */
export function unitThreat(t: EnemyTemplate, level = t.suggestedLevel, pvMult = 1): number {
  return t.threat * levelFactor(level, t.suggestedLevel) * pvMult;
}

/** Per-body base threat on the "effective bodies" scale: u = T·probe^(1−β).
 *  One body of the species contributes (u·λ)^(1/β) effective-body units. */
function unitBase(t: EnemyTemplate, level = t.suggestedLevel): number {
  const probe = PROBE_COUNT[t.role];
  return t.threat * levelFactor(level, t.suggestedLevel) * Math.pow(probe, 1 - COUNT_BETA);
}

/** Threat of a GROUP: per-body threat anchored at the probe count, scaled
 *  super-linearly in bodies ((count/probe)^β). */
export function groupThreat(t: EnemyTemplate, count: number, level = t.suggestedLevel, pvMult = 1): number {
  const probe = PROBE_COUNT[t.role];
  return unitThreat(t, level, pvMult) * probe * Math.pow(count / probe, COUNT_BETA);
}

/** A concrete fielded group (what actually stands on the table). */
export interface FieldedGroup {
  templateId: string;
  count: number;
  /** Kit ordinal; template's full kit when omitted. */
  level?: number;
  /** PV per body; template basePV when omitted. */
  pv?: number;
}

/**
 * Total threat of an arbitrary (possibly mixed) composition: a β-power-mean
 * over ALL bodies — each body contributes (u·λ)^(1/β) "effective bodies" and
 * the total is raised back to β, so cross-species action economy is shared.
 * Reduces exactly to groupThreat for single-species compositions.
 */
export function compositionThreat(groups: FieldedGroup[]): number {
  let eff = 0;
  for (const g of groups) {
    const t = getEnemyTemplate(g.templateId);
    if (!t) continue;
    const lambda = (g.pv ?? t.basePV) / t.basePV;
    eff += g.count * Math.pow(unitBase(t, g.level ?? t.suggestedLevel) * lambda, 1 / COUNT_BETA);
  }
  return Math.pow(eff, COUNT_BETA);
}

/** Predicted player winrate against an arbitrary fielded composition. */
export function predictEncounter(groups: FieldedGroup[], playerCount: number): number {
  return winrateForRatio(compositionThreat(groups) / partyStrength(playerCount));
}

/** Predicted player winrate for a threat/strength ratio. */
export function winrateForRatio(ratio: number): number {
  return 1 / (1 + Math.exp(WINRATE_K * (ratio - 1)));
}

/** Threat/strength ratio that yields a target player winrate. */
export function ratioForWinrate(winrate: number): number {
  const p = Math.min(0.95, Math.max(0.05, winrate));
  return Math.max(0.15, 1 + Math.log((1 - p) / p) / WINRATE_K);
}

/** One group requested from the solver. Omitted fields are solved. */
export interface PoolSpec {
  templateId: string;
  /** Fixed body count; solved within role bounds when omitted. */
  count?: number;
  /** Fielded skill level (kit ordinal); template's full kit when omitted. */
  level?: number;
}

export interface SolvedGroup {
  templateId: string;
  count: number;
  level: number;
  /** PV each fielded body should have (basePV × solved multiplier). */
  pv: number;
}

export interface SolvedEncounter {
  groups: SolvedGroup[];
  targetWinrate: number;
  /** Model-predicted winrate after clamping (equals target when unclamped). */
  predictedWinrate: number;
  pvMult: number;
  ratio: number;
}

/**
 * Solve an encounter: pick body counts (where free) and a common PV
 * multiplier so the pool's total threat hits the budget implied by the
 * target winrate. Returns null for an empty/unknown pool.
 */
export function solveEncounter(pool: PoolSpec[], playerCount: number, targetWinrate: number): SolvedEncounter | null {
  const entries = pool
    .map(spec => ({ spec, template: getEnemyTemplate(spec.templateId) }))
    .filter((e): e is { spec: PoolSpec; template: EnemyTemplate } => !!e.template);
  if (entries.length === 0) return null;

  const budget = partyStrength(playerCount) * ratioForWinrate(targetWinrate);

  // Counts: fixed ones are honoured. Free ones SNAP to the measured probe
  // count whenever the PV multiplier alone can reach the budget share — the
  // model is most reliable at its measurement anchor. Only when λ would
  // clamp does the count drift (inverting the count^β scaling), within
  // ×COUNT_DRIFT_MAX of the probe and the role's body range.
  const freeShare = budget / entries.length;
  const counts = entries.map(({ spec, template }) => {
    if (spec.count !== undefined) return Math.max(1, spec.count);
    const [lo, hi] = ROLE_COUNT[template.role];
    const probe = PROBE_COUNT[template.role];
    const base = unitThreat(template, spec.level ?? template.suggestedLevel) * probe;
    const lambdaAtProbe = freeShare / Math.max(0.001, base);
    if (lambdaAtProbe >= PV_MULT_MIN && lambdaAtProbe <= PV_MULT_MAX) {
      return Math.min(hi, Math.max(lo, probe));
    }
    const ideal = probe * Math.pow(lambdaAtProbe, 1 / COUNT_BETA);
    const drifted = Math.min(probe * COUNT_DRIFT_MAX, Math.max(probe / COUNT_DRIFT_MAX, ideal));
    return Math.min(hi, Math.max(lo, Math.round(drifted)));
  });

  // Shared-economy aggregation (compositionThreat) — a common PV multiplier
  // scales the total linearly, so the budget solve stays closed-form.
  const baseThreat = compositionThreat(entries.map(({ spec, template }, i) => ({
    templateId: template.id, count: counts[i], level: spec.level ?? template.suggestedLevel,
  })));
  const pvMult = Math.min(PV_MULT_MAX, Math.max(PV_MULT_MIN, budget / Math.max(0.001, baseThreat)));

  const ratio = (baseThreat * pvMult) / partyStrength(playerCount);
  return {
    groups: entries.map(({ spec, template }, i) => ({
      templateId: template.id,
      count: counts[i],
      level: spec.level ?? template.suggestedLevel,
      pv: Math.max(2, Math.round(template.basePV * pvMult)),
    })),
    targetWinrate,
    predictedWinrate: winrateForRatio(ratio),
    pvMult,
    ratio,
  };
}

/** Single-species convenience: solve `template` alone against the party. */
export function generateEncounter(template: EnemyTemplate, playerCount: number, targetWinrate: number): SolvedEncounter | null {
  return solveEncounter([{ templateId: template.id }], playerCount, targetWinrate);
}
