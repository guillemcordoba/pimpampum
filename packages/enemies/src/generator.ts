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

/** Winrate steepness (median of per-template logit fits, 2026-07-18 re-measure
 *  after the player-kit re-ordering pass). */
export const WINRATE_K = 3.2;
/** Party-strength scaling exponent: S(n) = (n/4)^α. Measured with FIXED-count
 *  probes (6 goblins, PV ladder only). Re-measured 2026-07-19 after the
 *  armour rescale (parties squishier, less flat mitigation): S5 1.59, S6 2.36
 *  → least-squares α ≈ 2.1. */
export const PARTY_ALPHA = 2.1;
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
/** Max count drift from the probe. Tightened 1.34 → 1.1 (2026-07-18): after
 *  the party re-measure, drifted counts landed 20-30pp off promise in BOTH
 *  directions (wolf 6→8 too strong — pack synergy steeper than β; shaman
 *  3→4 too weak — no synergy at all). Counts now stay at the measured
 *  anchor (hordes may add one body); PV and the honest clamp-adjusted
 *  prediction do the rest. */
export const COUNT_DRIFT_MAX = 1.1;

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
export const TARGET_WINRATES = { easy: 0.90, medium: 0.80, hard: 0.65, boss: 0.50 } as const;
export type EncounterDifficulty = keyof typeof TARGET_WINRATES;

/** Per-player skill-level sum the whole calibration was measured at (mean
 *  actual levels of the reference random parties). playerLevelFactor(REF) ≡ 1. */
export const PLAYER_REF_LEVELS = 6;

/**
 * Strength factor of ONE player with `levels` total skill levels, relative
 * to the calibration-reference player (≡ 1 at PLAYER_REF_LEVELS).
 *
 * Measured 2026-07-19 AFTER the card-review pass (kits slimmed to 4-5 cards):
 * budget sweep, λ50 logit fits vs goblin×6 and bone-devil×3 probes. Levels
 * barely move party strength now — the first cards carry the player: implied
 * g ≈ 0.93 at 2 levels, 0.99 at 3, 1.00 at 5-6, plateau ~1.05 above. Affine
 * fit, log-RMSE 0.035.
 */
export function playerLevelFactor(levels: number): number {
  return 0.85 + 0.15 * (Math.max(1, levels) / PLAYER_REF_LEVELS);
}

/** Calibration-mean worn armour: the random reference parties the threats
 *  were measured against average this much passive armour. armorFactor(REF) ≡ 1. */
export const PARTY_REF_ARMOR = 0.75;

/**
 * Party-strength multiplier for the party's AVERAGE worn armour. Armour is a
 * small bounded lever now (max +2 worn), but not negligible — measured
 * 2026-07-19 vs the goblin probe and tuned against solved-encounter
 * validation (armour helps weaker random parties proportionally more than the
 * strong probe party, so the effective slope is steeper). Anchored so the
 * calibration mean (+0.75) ≡ 1. Slope ~0.28/point of armour.
 */
export function armorFactor(avgArmor: number): number {
  return 1 + 0.28 * (Math.max(0, avgArmor) - PARTY_REF_ARMOR);
}

/**
 * Party strength (4 reference players ≡ 1). With `playerLevels` (each
 * player's total skill-level sum) every player counts as g(levels)
 * effective reference players; without it all players are assumed at the
 * reference budget. `avgArmor` scales the whole party by armorFactor
 * (defaults to the calibration mean → factor 1).
 */
export function partyStrength(playerCount: number, playerLevels?: number[], avgArmor?: number): number {
  const eff = playerLevels?.length
    ? playerLevels.reduce((s, l) => s + playerLevelFactor(l), 0)
    : Math.max(1, playerCount);
  const armor = avgArmor === undefined ? 1 : armorFactor(avgArmor);
  return armor * Math.pow(Math.max(0.25, eff) / 4, PARTY_ALPHA);
}

/**
 * Threat multiplier of a reduced kit (level < kit size), FLAT-kit fallback:
 * the 2026-07-19 card pass slimmed kits to their essentials, and reduced flat
 * kits keep almost all their threat (measured ×0.91-1.09: golem L3/4,
 * basilisc L3/5) — the early cards carry them. RAMPING kits (real power in
 * the top cards, e.g. the goblin since the level-scaling redesign) instead
 * carry MEASURED per-level multipliers on the template (levelThreat) and
 * never use this formula.
 */
export function levelFactor(level: number, kitSize: number): number {
  if (level >= kitSize) return 1;
  return Math.min(1, 0.4 + level / kitSize);
}

/** Level multiplier for a template: measured per-level points when present
 *  (linear interpolation between known points and toward 1 at
 *  suggestedLevel; clamped to the lowest measured point below it), else the
 *  global flat-kit formula. */
export function templateLevelFactor(t: EnemyTemplate, level: number): number {
  if (level >= t.suggestedLevel) return 1;
  const table = t.levelThreat;
  if (!table) return levelFactor(level, t.suggestedLevel);
  if (table[level] !== undefined) return table[level];
  const known = Object.keys(table).map(Number).sort((a, b) => a - b);
  const below = known.filter(l => l < level).pop();
  const above = known.find(l => l > level);
  const lo = below !== undefined ? { l: below, f: table[below] } : undefined;
  const hi = above !== undefined ? { l: above, f: table[above] } : { l: t.suggestedLevel, f: 1 };
  if (!lo) return hi.f; // below the lowest measured point: clamp to it
  return lo.f + (hi.f - lo.f) * (level - lo.l) / (hi.l - lo.l);
}

/** Threat of one body of `t` at `level` with its PV scaled by `pvMult`. */
export function unitThreat(t: EnemyTemplate, level = t.suggestedLevel, pvMult = 1): number {
  return t.threat * templateLevelFactor(t, level) * pvMult;
}

/** Per-body base threat on the "effective bodies" scale: u = T·probe^(1−β).
 *  One body of the species contributes (u·λ)^(1/β) effective-body units. */
function unitBase(t: EnemyTemplate, level = t.suggestedLevel): number {
  const probe = PROBE_COUNT[t.role];
  return t.threat * templateLevelFactor(t, level) * Math.pow(probe, 1 - COUNT_BETA);
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
export function predictEncounter(groups: FieldedGroup[], playerCount: number, playerLevels?: number[], avgArmor?: number): number {
  return winrateForRatio(compositionThreat(groups) / partyStrength(playerCount, playerLevels, avgArmor));
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
  /** Fixed skill level (kit ordinal); SOLVED when omitted — the solver steps
   *  levels down from the full kit before gutting PV. */
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
  /** Average worn armour the solve assumed for the party — the combat should
   *  equip the players to roughly match, or the promised winrate won't hold. */
  partyArmor: number;
}

/**
 * Solve an encounter: pick body counts, per-group LEVELS (where free) and a
 * common PV multiplier so the pool's total threat hits the budget implied by
 * the target winrate. Returns null for an empty/unknown pool.
 */
export function solveEncounter(pool: PoolSpec[], playerCount: number, targetWinrate: number, playerLevels?: number[], avgArmor?: number): SolvedEncounter | null {
  const entries = pool
    .map(spec => ({ spec, template: getEnemyTemplate(spec.templateId) }))
    .filter((e): e is { spec: PoolSpec; template: EnemyTemplate } => !!e.template);
  if (entries.length === 0) return null;

  const strength = partyStrength(playerCount, playerLevels, avgArmor);
  const budget = strength * ratioForWinrate(targetWinrate);

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

  // Levels are an OUTPUT of the solver (enemies scale by levels, not PV):
  // fixed levels are honoured; free ones start at the full kit and step DOWN
  // one at a time ONLY while the needed PV multiplier sits below the anchor
  // band — an easy budget fields green, few-action enemies instead of full
  // kits with gutted PV — stopping as soon as PV is healthy again. The
  // hysteresis biases toward FULLER kits (adding a body trims at most a
  // level, it doesn't crash the kit).
  const LEVEL_STEP_BELOW = 0.8;
  const levels = entries.map(({ spec, template }) => spec.level ?? template.suggestedLevel);
  const threatAt = () => compositionThreat(entries.map(({ template }, i) => ({
    templateId: template.id, count: counts[i], level: levels[i],
  })));
  // Don't step a group below the lowest level we have a MEASURED threat for
  // (a ramped kit's curve is only known down to its lowest levelThreat key;
  // below that a card-starved body is far weaker than the model assumes).
  const minLevelOf = (t: EnemyTemplate) =>
    t.levelThreat ? Math.min(...Object.keys(t.levelThreat).map(Number)) : 1;
  let baseThreat = threatAt();
  for (;;) {
    if (budget / Math.max(0.001, baseThreat) >= LEVEL_STEP_BELOW) break;
    let best: { i: number; threat: number; err: number } | null = null;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].spec.level !== undefined || levels[i] <= minLevelOf(entries[i].template)) continue;
      levels[i]--;
      const t = threatAt();
      const e = Math.abs(Math.log(budget / Math.max(0.001, t)));
      levels[i]++;
      if (!best || e < best.err) best = { i, threat: t, err: e };
    }
    if (!best) break;
    levels[best.i]--;
    baseThreat = best.threat;
  }
  const pvMult = Math.min(PV_MULT_MAX, Math.max(PV_MULT_MIN, budget / Math.max(0.001, baseThreat)));

  const ratio = (baseThreat * pvMult) / strength;
  return {
    groups: entries.map(({ template }, i) => ({
      templateId: template.id,
      count: counts[i],
      level: levels[i],
      pv: Math.max(2, Math.round(template.basePV * pvMult)),
    })),
    targetWinrate,
    predictedWinrate: winrateForRatio(ratio),
    pvMult,
    ratio,
    partyArmor: avgArmor ?? PARTY_REF_ARMOR,
  };
}

/** Single-species convenience: solve `template` alone against the party. */
export function generateEncounter(template: EnemyTemplate, playerCount: number, targetWinrate: number): SolvedEncounter | null {
  return solveEncounter([{ templateId: template.id }], playerCount, targetWinrate);
}
