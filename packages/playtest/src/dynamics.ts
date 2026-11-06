/**
 * THE DYNAMICS, READ — bench `dynamics.ts`'s counts turned into how a fight
 * plays, in numbers and in words (the user, 2026-11-04: the machinery explains
 * the structural dynamics of the game as it plays, and recommends fixes). Every
 * sentence is computed from the measurement; none is written by hand.
 */
import { theSet, type DamageSource, type Dynamics, type KitTally } from '@pimpampum/bench';
import { MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE } from './rules.js';

export interface DynamicsSummary {
  fights: number;
  median: number; p90: number; stallRate: number;
  /** PV everyone lost a round, on average. */
  pvPerRound: number;
  /** Share of all PV lost, by where it came from. */
  sources: Record<DamageSource, number>;
  /** Share of cards played, by type. */
  mix: { attack: number; defense: number; focus: number };
  /** Attacks that took nothing; Focus that never resolved. */
  emptyAttacks: number; lostFocus: number;
  /** Of the cards that hurt anyone: share taking half a body or more at once. */
  bigBlows: number;
  /** Per hero fielded: fell in round 1; felled from full by one card. */
  roundOneKOs: number; oneShots: number;
  /** The worst fast card's share of plays that felled a fresh hero (interactivity). */
  fastKOs: number;
  /** Fights end within the bars. */
  ends: boolean;
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : 0;
};

/** Plays below which a fast card's KO rate is not judged. */
export const MIN_FAST_PLAYS = 30;

/** The ids of the main kits' fast attacks. */
export function fastCards(): Set<string> {
  const out = new Set<string>();
  for (const kit of theSet().calibration.mainKits) for (const a of theSet().kit(kit)?.actions ?? []) if (a.fast && a.actionType === 'Atac') out.add(a.id);
  return out;
}

export function summarise(d: Dynamics): DynamicsSummary {
  const total = Object.values(d.lost).reduce((t, x) => t + x, 0) || 1;
  const played = d.plays.attack + d.plays.defense + d.plays.focus || 1;
  const hurt = d.blowShares.reduce((t, x) => t + x, 0) || 1;
  const median = quantile(d.rounds, 0.5), p90 = quantile(d.rounds, 0.9), stallRate = d.stalls / Math.max(1, d.fights);
  return {
    fights: d.fights, median, p90, stallRate,
    pvPerRound: total / Math.max(1, d.rounds.reduce((t, r) => t + r, 0)),
    sources: Object.fromEntries(Object.entries(d.lost).map(([k, v]) => [k, v / total])) as Record<DamageSource, number>,
    mix: { attack: d.plays.attack / played, defense: d.plays.defense / played, focus: d.plays.focus / played },
    emptyAttacks: d.emptyAttacks / Math.max(1, d.plays.attack), lostFocus: d.lostFocus / Math.max(1, d.plays.focus),
    bigBlows: d.blowShares.slice(5).reduce((t, x) => t + x, 0) / hurt,
    roundOneKOs: d.roundOneKOs / Math.max(1, d.fielded), oneShots: d.oneShots / Math.max(1, d.fielded),
    fastKOs: Math.max(0, ...Object.entries(d.cards).filter(([id, c]) => c.plays >= MIN_FAST_PLAYS && fastCards().has(id)).map(([, c]) => c.felledFromFull / c.plays)),
    ends: median <= MAX_MEDIAN_ROUNDS && p90 <= MAX_P90_ROUNDS && stallRate < MAX_STALL_RATE,
  };
}

const pc = (x: number) => `${Math.round(100 * x)}%`;

const SOURCE_NAMES: Record<DamageSource, string> = {
  open: 'blows on bodies with no guard up', guarded: 'blows on guarded bodies', area: 'area attacks',
  counter: 'counters and backfires', focus: 'Focus cards', defense: 'defense payoffs', roundEnd: 'statuses at the round\'s end',
};

/** How the fights at one level play, in a few computed sentences. */
export function explain(s: DynamicsSummary): string[] {
  const ranked = (Object.entries(s.sources) as [DamageSource, number][]).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.05);
  const out: string[] = [];
  out.push(`Fights last ${s.median} rounds (median), ${s.p90} for 9 in 10${s.stallRate ? `, and ${pc(s.stallRate)} never end` : ''}: ${s.ends ? 'within' : 'outside'} the bars (${MAX_MEDIAN_ROUNDS} / ${MAX_P90_ROUNDS} / stalls under ${pc(MAX_STALL_RATE)}).`);
  out.push(`Everyone together loses ${s.pvPerRound.toFixed(1)} PV a round. It comes from ${ranked.map(([k, v]) => `${SOURCE_NAMES[k]} (${pc(v)})`).join(', ')}.`);
  out.push(`The cards played: ${pc(s.mix.attack)} attacks, ${pc(s.mix.defense)} defenses, ${pc(s.mix.focus)} Focus. ${pc(s.emptyAttacks)} of the attacks take nothing at all${s.mix.focus > 0 ? `; ${pc(s.lostFocus)} of the Focus never resolve` : ''}.`);
  out.push(`Burst: ${pc(s.bigBlows)} of the cards that hurt take half a body or more at once; ${pc(s.oneShots)} of the heroes are felled from full by a single card, ${pc(s.roundOneKOs)} fall in round 1.`);
  if (s.sources.guarded + s.sources.open > 0 && s.sources.guarded < 0.1 && s.mix.defense > 0.3) {
    out.push(`Guards erase blows almost entirely: the ${pc(s.mix.defense)} of plays that are defenses let through ${pc(s.sources.guarded)} of the damage, so a round is decided by who catches a body with no guard up.`);
  }
  return out;
}

// --- does the vanilla set play like the real game? ---------------------------------

export interface MatchCheck { metric: string; real: number; vanilla: number; ok: boolean }

/** The tolerances "vanilla matches today" is judged on (the user, 2026-11-04). */
export const MATCH_TOLERANCE = { median: 2, p90: 3, p90Share: 0.25, stalls: 0.03, mix: 0.1, pvPerRound: 0.25, source: 0.1 };

/** Vanilla against the real game at one level, metric by metric. */
export function vanillaMatches(real: DynamicsSummary, vanilla: DynamicsSummary): { ok: boolean; checks: MatchCheck[] } {
  const T = MATCH_TOLERANCE;
  const near = (metric: string, r: number, v: number, tol: number): MatchCheck => ({ metric, real: r, vanilla: v, ok: Math.abs(r - v) <= tol });
  const checks: MatchCheck[] = [
    near('median rounds', real.median, vanilla.median, T.median),
    near('rounds, 9 in 10', real.p90, vanilla.p90, Math.max(T.p90, T.p90Share * real.p90)),
    near('stalls', real.stallRate, vanilla.stallRate, T.stalls),
    near('attacks played', real.mix.attack, vanilla.mix.attack, T.mix),
    near('defenses played', real.mix.defense, vanilla.mix.defense, T.mix),
    near('Focus played', real.mix.focus, vanilla.mix.focus, T.mix),
    near('PV lost a round', real.pvPerRound, vanilla.pvPerRound, T.pvPerRound * real.pvPerRound),
    ...(['open', 'area', 'focus', 'roundEnd', 'counter'] as const).map(k => near(`damage from ${k === 'roundEnd' ? 'statuses' : k === 'open' ? 'open bodies' : k}`, real.sources[k], vanilla.sources[k], T.source)),
  ];
  return { ok: checks.every(c => c.ok), checks };
}

// --- per kit: is each twin like its kit? -----------------------------------------------

export interface KitDivergence { kit: string; checks: MatchCheck[]; off: number; distance: number }

/** How loosely one kit's twin must follow it: a kit fills a quarter of the
 *  seats, so its numbers are noisier than the whole game's. */
export const KIT_TOLERANCE = { share: 0.15, perRound: 0.3 };

function kitMetrics(t: KitTally): Record<string, number> {
  const dealt = Object.values(t.dealt).reduce((a, b) => a + b, 0) || 1;
  const played = t.plays.attack + t.plays.defense + t.plays.focus || 1;
  const rounds = Math.max(1, t.rounds);
  return {
    'PV dealt a round': dealt / rounds, 'PV lost a round': t.lost / rounds,
    'attacks played': t.plays.attack / played, 'defenses played': t.plays.defense / played, 'Focus played': t.plays.focus / played,
    'dealt on open bodies': t.dealt.open / dealt, 'dealt through guards': t.dealt.guarded / dealt, 'dealt by area': t.dealt.area / dealt,
    'dealt by Focus': t.dealt.focus / dealt, 'dealt by counters': t.dealt.counter / dealt,
  };
}

/** Every kit's twin against the kit, worst first. */
export function kitDivergences(real: Dynamics, vanilla: Dynamics): KitDivergence[] {
  const out: KitDivergence[] = [];
  for (const [kit, r] of Object.entries(real.kits)) {
    const v = vanilla.kits[kit];
    if (!v || !r.seats || !v.seats) continue;
    const rm = kitMetrics(r), vm = kitMetrics(v);
    const checks = Object.keys(rm).map(metric => {
      const tol = metric.endsWith('a round') ? KIT_TOLERANCE.perRound * Math.max(0.5, rm[metric]) : KIT_TOLERANCE.share;
      return { metric, real: rm[metric], vanilla: vm[metric], ok: Math.abs(rm[metric] - vm[metric]) <= tol, tol };
    });
    out.push({
      kit, checks: checks.map(({ tol: _t, ...c }) => c), off: checks.filter(c => !c.ok).length,
      distance: checks.reduce((d, c) => d + Math.abs(c.real - c.vanilla) / c.tol, 0),
    });
  }
  return out.sort((a, b) => b.off - a.off || b.distance - a.distance);
}
