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
 * Each window also names what sets it: the cards past the knockout bar one PV
 * under the floor, and the cards without which fights end one PV over the
 * ceiling — each with its error bar, so a reading inside the noise says so.
 */
import { kitMirrors, kitsDynamics, type Dynamics, type PVModel, type Unanswerable } from '@pimpampum/bench';
import { MAX_UNANSWERABLE_KOS } from './derive-pv.js';
import { MIN_KO_PLAYS, summarise, type DynamicsSummary } from './dynamics.js';
import { installSet, type RunContext } from './prepare.js';
import { endsInTime, MAX_MEDIAN_ROUNDS, MAX_STALL_RATE } from './rules.js';

const PV_MIN = 1;
const PV_MAX = 60;
/** The levels a hero plays at: from its first fight (level 3) to the top. */
export const PV_LEVELS = [3, 4, 5, 6, 7, 8, 9, 10];
/** A reading within two standard errors of a bar is measured again on this many times the fights. */
const RECHECK = 4;
/** Fights past `MAX_MEDIAN_ROUNDS` that still leave the median within it. */
const LONG_BAR = 0.5;

const stdErr = (p: number, n: number) => Math.sqrt(Math.max(0, p * (1 - p)) / Math.max(1, n));

/** A card that fells fresh heroes without an answer past the bar. */
export interface KnockoutCard {
  card: string;
  rate: number; se: number; plays: number;
  /** Past the bar beyond its noise (rate − 2·se above it). */
  clearly: boolean;
  how: Record<Unanswerable, number>;
  /** Of its unanswerable knockouts, those that needed another card's buff, by that card. */
  rode: Record<string, number>;
}

/** A card without which fights end in time one PV over the ceiling. */
export interface PacingCard {
  card: string;
  /** The fights without it: rounds (median, 9 in 10), the stalls, and how far the share over the bar that failed (`OverCeiling.fails`) falls from the fights with it. */
  median: number; p90: number; stallRate: number; fights: number; drop: number; se: number;
}

/** One PV over the ceiling, where fights no longer end in time: how they run, which bar fails (the median before the stalls), and the cards without which they end. */
export interface OverCeiling { pv: number; median: number; p90: number; stallRate: number; fights: number; longShare: number; fails: 'median' | 'stalls'; cards: PacingCard[] }

export interface LevelWindow {
  level: number;
  /** The smallest PV with no card felling fresh heroes without an answer past the bar. */
  floor: number;
  /** The largest PV with fights still ending in time; null: not even at the smallest. */
  ceiling: number | null;
  /** What sets the floor: the cards past the bar one PV under it (at the floor's PV when it never clears). */
  floorCards: KnockoutCard[];
  /** Knockouts there a slow Focus set up (answered: the read cancels the Focus), by that Focus. */
  focusSetUps: Record<string, number>;
  /** What holds the ceiling down (null: fights end even at the largest PV searched). */
  overCeiling: OverCeiling | null;
  /** Every PV the searches measured: fights end, the worst card's unanswerable rate, and the fights it took. */
  measured: { pv: number; ends: boolean; unanswerable: number; median: number; p90: number; fights: number }[];
}

const longShareOf = (d: Dynamics) => d.rounds.filter(r => r > MAX_MEDIAN_ROUNDS).length / Math.max(1, d.fights);
const stallShareOf = (d: Dynamics) => d.stalls / Math.max(1, d.fights);

/** The cards past the knockout bar in `d`, worst first. */
function knockoutCards(d: Dynamics): KnockoutCard[] {
  return Object.entries(d.cards).filter(([, c]) => c.plays >= MIN_KO_PLAYS).map(([card, c]) => {
    const rate = c.unanswerable / c.plays, se = stdErr(rate, c.plays);
    return { card, rate, se, plays: c.plays, clearly: rate - 2 * se > MAX_UNANSWERABLE_KOS, how: c.unanswerableHow, rode: c.unansweredRode };
  }).filter(k => k.rate > MAX_UNANSWERABLE_KOS).sort((a, b) => b.rate - a.rate);
}

/** Whether a reading sits within its noise of a bar: a card's knockouts, the fights past the round limit, or the stalls. */
function nearABar(d: Dynamics): boolean {
  const long = longShareOf(d), stalls = stallShareOf(d);
  if (Math.abs(long - LONG_BAR) < 2 * stdErr(long, d.fights)) return true;
  if (Math.abs(stalls - MAX_STALL_RATE) < 2 * stdErr(stalls, d.fights)) return true;
  return Object.values(d.cards).some(c => {
    if (c.plays < MIN_KO_PLAYS) return false;
    const rate = c.unanswerable / c.plays;
    return Math.abs(rate - MAX_UNANSWERABLE_KOS) < 2 * stdErr(rate, c.plays);
  });
}

/** One level's window on the real kits (random 2v2, every hero on one PV). */
export function realWindow(level: number, fights: number): LevelWindow {
  const seen = new Map<number, { d: Dynamics; s: DynamicsSummary }>();
  const measure = (pv: number) => {
    let m = seen.get(pv);
    if (!m) {
      let d = kitsDynamics(level, fights, { pv });
      if (nearABar(d)) d = kitsDynamics(level, RECHECK * fights, { pv });
      m = { d, s: summarise(d) };
      seen.set(pv, m);
    }
    return m;
  };
  const at = (pv: number) => measure(pv).s;
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
  const under = measure(floor > PV_MIN ? floor - 1 : floor).d;
  const focusSetUps: Record<string, number> = {};
  for (const c of Object.values(under.cards)) for (const [id, n] of Object.entries(c.focusSetUps)) focusSetUps[id] = (focusSetUps[id] ?? 0) + n;
  return {
    level, floor, ceiling,
    floorCards: floor > PV_MIN || !answered(at(floor)) ? knockoutCards(under) : [],
    focusSetUps,
    overCeiling: ceiling === PV_MAX ? null : overCeiling(level, fights, ceiling === null ? PV_MIN : ceiling + 1, measure(ceiling === null ? PV_MIN : ceiling + 1)),
    measured: [...seen].sort((a, b) => a[0] - b[0]).map(([pv, { d, s }]) => ({ pv, ends: s.ends, unanswerable: s.unanswerableKOs, median: s.median, p90: s.p90, fights: d.fights })),
  };
}

/** At `pv`, where fights no longer end in time: every card played, taken out
 *  of every hand in turn; the ones without which fights end, the share over
 *  the failed bar falling clearly past the noise. Every
 *  card is screened on `fights` and the ones that pass are measured again on
 *  `RECHECK` times as many, against a baseline as large: the screen compares
 *  them all with one baseline, and a baseline that came out high makes every
 *  card look like it holds the ceiling. */
function overCeiling(level: number, fights: number, pv: number, reading: { d: Dynamics; s: DynamicsSummary }): OverCeiling {
  const fails = reading.s.median > MAX_MEDIAN_ROUNDS ? 'median' : 'stalls';
  const overBar = fails === 'median' ? longShareOf : stallShareOf;
  const holds = (n: number, card: string, base: Dynamics): PacingCard | null => {
    const without = kitsDynamics(level, n, { pv, without: card });
    const ws = summarise(without);
    const with_ = overBar(base), share = overBar(without), drop = with_ - share;
    const se = Math.sqrt(stdErr(with_, base.fights) ** 2 + stdErr(share, without.fights) ** 2);
    return ws.ends && drop > 2 * se ? { card, median: ws.median, p90: ws.p90, stallRate: ws.stallRate, fights: without.fights, drop, se } : null;
  };
  const screen = kitsDynamics(level, fights, { pv });
  const passed = Object.entries(screen.cards).filter(([card, c]) => c.plays > 0 && holds(fights, card, screen)).map(([card]) => card);
  const all = passed.length ? kitsDynamics(level, RECHECK * fights, { pv }) : screen;
  const cards = passed.map(card => holds(RECHECK * fights, card, all)).filter((c): c is PacingCard => !!c);
  const { median, p90, stallRate } = reading.s;
  return { pv, median, p90, stallRate, fights: reading.d.fights, longShare: longShareOf(reading.d), fails, cards: cards.sort((x, y) => y.drop - x.drop) };
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

/** Is the line inside every level's window: never under a floor, never over a ceiling? */
export function fitsEveryWindow(windows: readonly Pick<LevelWindow, 'level' | 'floor' | 'ceiling'>[], base: number, slope: number): boolean {
  return windows.every(w => {
    const pv = base + slope * w.level;
    return pv >= w.floor && w.ceiling !== null && pv <= w.ceiling;
  });
}

export interface TierCandidate { fragile: number; middle: number; bulky: number }
export interface TierMeasure {
  candidate: TierCandidate;
  /** Per class and checkpoint: the field score, its fights' rounds (median, 9 in 10) and whether they end in time. */
  cells: { kit: string; level: number; winrate: number; median: number; p90: number; ends: boolean }[];
  /** Σ (field score − ½)² over every class and checkpoint: lower is fairer.
   *  `se`: its standard error from the cells' sample (the delta method). */
  imbalance: number; se: number;
}

/** Is `held` no clearly less fair than `rival`? Clearly: past 2σ of the two samples. */
export function asFairAs(held: Pick<TierMeasure, 'imbalance' | 'se'>, rival: Pick<TierMeasure, 'imbalance' | 'se'>): boolean {
  return held.imbalance - rival.imbalance <= 2 * Math.hypot(held.se, rival.se);
}

/** Every class's field score and fight length under one tier candidate. */
export function measureTiers(
  base: number, candidate: TierCandidate, tiers: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>>, levels: readonly number[], fights: number,
): TierMeasure {
  const perLevel: Record<string, number> = {};
  for (const [tier, kits] of Object.entries(tiers) as [keyof TierCandidate, readonly string[]][]) for (const k of kits) perLevel[k] = candidate[tier];
  const pvModel: PVModel = { base, perLevel };
  const cells = Object.values(tiers).flat().flatMap(kit => levels.map(level => {
    const run = kitMirrors(kit, level, fights, MAX_MEDIAN_ROUNDS, undefined, { pvModel });
    const rounds = run.fights.map(f => f.rounds).sort((a, b) => a - b);
    const at = (q: number) => rounds[Math.min(rounds.length - 1, Math.ceil(q * rounds.length) - 1)] ?? 0;
    const stallRate = run.fights.filter(f => f.capped).length / Math.max(1, run.fights.length);
    return { kit, level, winrate: run.fights.reduce((t, f) => t + f.won, 0) / Math.max(1, run.fights.length), median: at(0.5), p90: at(0.9), ends: endsInTime(at(0.5), stallRate) };
  }));
  const se = Math.sqrt(cells.reduce((t, c) => t + 4 * (c.winrate - 0.5) ** 2 * stdErr(c.winrate, fights) ** 2, 0));
  return { candidate, cells, imbalance: cells.reduce((t, c) => t + (c.winrate - 0.5) ** 2, 0), se };
}

export async function measureTiersJob(
  set: RunContext['set'], base: number, candidate: TierCandidate, tiers: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>>, levels: readonly number[], fights: number,
): Promise<TierMeasure> {
  await installSet(set);
  return measureTiers(base, candidate, tiers, levels, fights);
}
