/**
 * A HERO'S PV, DERIVED ON THE REAL KITS (the user, 2026-11-06): a base plus
 * what each level in each class adds, bulky classes more and fragile ones less
 * in the designer's order. Two stages:
 *  1. PACING AND INTERACTIVITY, every hero on one PV: at each level the floor
 *     (the smallest PV at which no card fells fresh heroes without an answer
 *     past `MAX_UNANSWERABLE_KOS`) and the ceiling (the largest at which fights
 *     still end in time); then the line base + slope × level that never drops
 *     under a floor and stays as close under the ceilings as it can — as low
 *     at levels 3-5 as interactivity allows, the user's choice.
 *  2. BALANCE: the fragile and bulky tiers' slopes moved off the middle one,
 *     the order kept, each candidate judged by every class's field score at
 *     the checkpoints (toward an even fight), no tier dropping under a floor.
 */
import { kitMirrors, kitsDynamics, type PVModel } from '@pimpampum/bench';
import { MAX_UNANSWERABLE_KOS } from './derive-pv.js';
import { summarise, type DynamicsSummary } from './dynamics.js';
import { installSet, type RunContext } from './prepare.js';
import { MAX_P90_ROUNDS } from './rules.js';

const PV_MIN = 1;
const PV_MAX = 60;

export interface LevelWindow {
  level: number;
  /** The smallest PV with no card felling fresh heroes without an answer past the bar. */
  floor: number;
  /** The largest PV with fights still ending in time; null: not even at the smallest. */
  ceiling: number | null;
  /** Every PV the searches measured: fights end, and the worst card's unanswerable rate. */
  measured: { pv: number; ends: boolean; unanswerable: number; median: number; p90: number }[];
}

/** One level's window on the real kits (random 2v2, every hero on one PV). */
export function realWindow(level: number, fights: number): LevelWindow {
  const seen = new Map<number, DynamicsSummary>();
  const at = (pv: number) => {
    let s = seen.get(pv);
    if (!s) { s = summarise(kitsDynamics(level, fights, { pv })); seen.set(pv, s); }
    return s;
  };
  const answered = (s: DynamicsSummary) => s.unanswerableKOs <= MAX_UNANSWERABLE_KOS;
  let floor = PV_MAX;
  if (answered(at(PV_MAX))) {
    let lo = PV_MIN, hi = PV_MAX;
    if (answered(at(lo))) hi = lo;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (answered(at(mid))) hi = mid; else lo = mid; }
    floor = hi;
  }
  let ceiling: number | null = null;
  if (at(PV_MIN).ends) {
    let lo = PV_MIN, hi = PV_MAX;
    if (at(hi).ends) lo = hi;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid).ends) lo = mid; else hi = mid; }
    ceiling = lo;
  }
  return {
    level, floor, ceiling,
    measured: [...seen].sort((a, b) => a[0] - b[0]).map(([pv, s]) => ({ pv, ends: s.ends, unanswerable: s.unanswerableKOs, median: s.median, p90: s.p90 })),
  };
}

export async function realWindowJob(set: RunContext['set'], level: number, fights: number): Promise<LevelWindow> {
  await installSet(set);
  return realWindow(level, fights);
}

/** The line base + slope × level: never under a floor; as close under each
 *  ceiling as it can (above one costs ten times as much as below); base ≥ 0. */
export function fitLine(windows: readonly LevelWindow[]): { base: number; slope: number; over: number[] } {
  let best: { base: number; slope: number; cost: number } | null = null;
  for (let base = 0; base <= 30; base += 0.5) {
    for (let slope = 0; slope <= 6; slope += 0.25) {
      const pv = (l: number) => base + slope * l;
      if (windows.some(w => pv(w.level) < w.floor)) continue;
      const cost = windows.reduce((t, w) => {
        const ceil = w.ceiling ?? w.floor;
        const d = pv(w.level) - ceil;
        return t + (d > 0 ? 10 * d * d : -d);
      }, 0);
      if (!best || cost < best.cost) best = { base, slope, cost };
    }
  }
  if (!best) throw new Error('fitLine: no line clears every floor (base 0-30, slope 0-6)');
  return { base: best.base, slope: best.slope, over: windows.filter(w => w.ceiling !== null && best!.base + best!.slope * w.level > w.ceiling).map(w => w.level) };
}

export interface TierCandidate { fragile: number; middle: number; bulky: number }
export interface TierMeasure {
  candidate: TierCandidate;
  /** Per class and checkpoint: the field score and whether its fights end in time. */
  cells: { kit: string; level: number; winrate: number; p90: number; ends: boolean }[];
  /** Σ (field score − ½)² over every class and checkpoint: lower is fairer. */
  imbalance: number;
}

/** Every class's field score and fight length under one tier candidate. */
export function measureTiers(
  base: number, candidate: TierCandidate, tiers: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>>, levels: readonly number[], fights: number,
): TierMeasure {
  const perLevel: Record<string, number> = {};
  for (const [tier, kits] of Object.entries(tiers) as [keyof TierCandidate, readonly string[]][]) for (const k of kits) perLevel[k] = candidate[tier];
  const pvModel: PVModel = { base, perLevel };
  const cells = Object.values(tiers).flat().flatMap(kit => levels.map(level => {
    const run = kitMirrors(kit, level, fights, MAX_P90_ROUNDS, undefined, { pvModel });
    const rounds = run.fights.map(f => f.rounds).sort((a, b) => a - b);
    const p90 = rounds[Math.min(rounds.length - 1, Math.ceil(0.9 * rounds.length) - 1)] ?? 0;
    return { kit, level, winrate: run.fights.reduce((t, f) => t + f.won, 0) / Math.max(1, run.fights.length), p90, ends: p90 <= MAX_P90_ROUNDS };
  }));
  return { candidate, cells, imbalance: cells.reduce((t, c) => t + (c.winrate - 0.5) ** 2, 0) };
}

export async function measureTiersJob(
  set: RunContext['set'], base: number, candidate: TierCandidate, tiers: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>>, levels: readonly number[], fights: number,
): Promise<TierMeasure> {
  await installSet(set);
  return measureTiers(base, candidate, tiers, levels, fights);
}
