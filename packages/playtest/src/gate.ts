/**
 * THE KIT GATE — every requirement of the livable zone, for every main kit at
 * every level, as one grid (the user, 2026-11-03: the zone that meets them all
 * is small, and the kits have to converge on it).
 *
 * Measured where the requirements bite, heroes against heroes (bench
 * `mirror.ts`):
 *  - FIGHTS END: per kit and level, 2v2 fights against random kits — the
 *    median, the 90th percentile (the user's hard limit, `MAX_P90_ROUNDS`) and
 *    the fights that never end;
 *  - THE TRIANGLE and THE TURTLE: per level where players live, the three
 *    leaning styles each against the next, and a side that only defends against
 *    the reading AI, which must lose (reads beat dumb strategies);
 *  - EVERY CARD HAS A USE: per kit, each card's value in mirrors — a card that
 *    is never the right play at any level it is held, or one the AI is blind to.
 *
 * The strength band joins when creatures are on the ladder (OPEN.md B20): it is
 * measured against creatures, and their cells saturate until then.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitMirrorCardValues, kitMirrors, scoreCards, styleDuel, theSet, warm, type DuelStyle } from '@pimpampum/bench';
import type { RunContext } from './prepare.js';
import {
  durationVerdict, edgeHolds, isBlindSpot, isNeverRight, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, triangleVerdict,
} from './rules.js';

export const GATE_LEVELS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10];
/** Where the triangle is claimed: the levels players live at (intentions.md). */
export const STYLE_LEVELS: readonly number[] = [3, 4, 5, 6];
/** Where cards are priced: every card is held at one of them at least. */
export const CARD_LEVELS: readonly number[] = [4, 6, 8, 10];

export interface GateBudget { kitFights: number; duelGames: number; cardFights: number }
export const GATE_BUDGET: GateBudget = { kitFights: 120, duelGames: 200, cardFights: 30 };

const EDGES: readonly [DuelStyle, DuelStyle][] = [['Power', 'Protect'], ['Protect', 'Aggro'], ['Aggro', 'Power']];

export interface GateKitCell {
  kit: string; level: number; fights: number;
  medianRounds: number; p90Rounds: number; stallRate: number;
  /** The kit's side's score in its fights (draws and stalls ½): context, not a verdict. */
  winrate: number;
  ok: boolean; reasons: string[];
}

export interface GateStyleCell {
  level: number;
  edges: { winner: string; loser: string; winrate: number; games: number }[];
  broken: string[];
  turtle: { score: number; stalls: number; games: number; ok: boolean };
}

export interface GateCardCell {
  kit: string; card: string; name: string; unlock: number;
  /** Per priced level the card is held at. */
  levels: { level: number; bestShare: number; playRate: number; decisions: number; neverRight: boolean; blind: boolean }[];
  neverRight: boolean; blind: boolean;
}

export interface GateReport {
  kits: GateKitCell[]; styles: GateStyleCell[]; cards: GateCardCell[];
  /** One line per failing cell, the grid's ❌s. */
  failures: string[];
}

/** One unit of the gate, as a worker computes it (`gate-worker.ts`). */
export type GateJob =
  | { kind: 'gate-fights'; kit: string; level: number }
  | { kind: 'gate-duel'; x: DuelStyle; y: DuelStyle; level: number }
  | { kind: 'gate-cards'; kit: string; level: number };

export interface GateScope { kits?: readonly string[]; levels?: readonly number[] }

function scopeKits(scope: GateScope): string[] { return [...(scope.kits ?? theSet().calibration.mainKits)]; }
const inScope = (levels: readonly number[], scope: GateScope): number[] => levels.filter(l => !scope.levels || scope.levels.includes(l));

/** Every unit `measureGate(scope)` reads, most expensive first (the card values). */
export function gateJobs(scope: GateScope = {}): GateJob[] {
  const kits = scopeKits(scope);
  return [
    ...kits.flatMap(kit => inScope(CARD_LEVELS, scope).map(level => ({ kind: 'gate-cards' as const, kit, level }))),
    ...(scope.kits ? [] : inScope(STYLE_LEVELS, scope).flatMap(level => [
      ...EDGES.map(([x, y]) => ({ kind: 'gate-duel' as const, x, y, level })),
      { kind: 'gate-duel' as const, x: 'turtle' as const, y: 'ai' as const, level },
    ])),
    ...kits.flatMap(kit => inScope(GATE_LEVELS, scope).map(level => ({ kind: 'gate-fights' as const, kit, level }))),
  ];
}

export function runGateJob(job: GateJob, budget: GateBudget = GATE_BUDGET): void {
  if (job.kind === 'gate-fights') kitMirrors(job.kit, job.level, budget.kitFights);
  else if (job.kind === 'gate-duel') styleDuel(job.x, job.y, job.level, budget.duelGames);
  else kitMirrorCardValues(job.kit, job.level, budget.cardFights);
}

function quantile(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : 0;
}

export function gateKitCell(kit: string, level: number, budget: GateBudget = GATE_BUDGET): GateKitCell {
  const fights = kitMirrors(kit, level, budget.kitFights);
  const ended = fights.filter(f => !f.capped).map(f => f.rounds).sort((a, b) => a - b);
  // A stall counts as the longest fight: it never ended.
  const rounds = [...ended, ...fights.filter(f => f.capped).map(f => f.rounds)];
  const stallRate = fights.filter(f => f.capped).length / Math.max(1, fights.length);
  const medianRounds = quantile(rounds, 0.5), p90Rounds = quantile(rounds, 0.9);
  const v = durationVerdict(medianRounds, p90Rounds, stallRate, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE);
  return {
    kit, level, fights: fights.length, medianRounds, p90Rounds, stallRate,
    winrate: fights.reduce((s, f) => s + f.won, 0) / Math.max(1, fights.length), ok: v.ok, reasons: v.reasons,
  };
}

export function gateStyleCell(level: number, budget: GateBudget = GATE_BUDGET): GateStyleCell {
  const edges = EDGES.map(([x, y]) => {
    const d = styleDuel(x, y, level, budget.duelGames);
    return { winner: x, loser: y, winrate: d.score, games: d.games };
  });
  const t = styleDuel('turtle', 'ai', level, budget.duelGames);
  return {
    level, edges, broken: triangleVerdict(edges).broken,
    turtle: { score: t.score, stalls: t.stalls, games: t.games, ok: edgeHolds(1 - t.score, t.games) },
  };
}

export function gateCardCells(kit: string, budget: GateBudget = GATE_BUDGET, levels: readonly number[] = CARD_LEVELS): GateCardCell[] {
  const cards = (theSet().kit(kit)?.actions ?? []).filter(a => a.skillId === kit);
  const priced = levels.map(level => {
    const m = kitMirrorCardValues(kit, level, budget.cardFights);
    return { level, scores: new Map(scoreCards(m.values).map(s => [s.id, s])), legal: m.legal, played: m.played };
  });
  return cards.map(card => {
    const rows = priced.filter(p => p.level >= card.unlockLevel).flatMap(p => {
      const s = p.scores.get(card.id);
      const decisions = p.legal[card.id] ?? 0;
      if (!s || !decisions) return [];
      const playRate = (p.played[card.id] ?? 0) / decisions;
      return [{
        level: p.level, bestShare: s.bestShare, playRate, decisions,
        neverRight: isNeverRight(s.gainWhenBest, s.gainWhenBestStderr, s.observations),
        blind: isBlindSpot(s.bestShare, s.bestStderr, playRate),
      }];
    });
    return {
      kit, card: card.id, name: card.name, unlock: card.unlockLevel, levels: rows,
      // Never right at EVERY level it was judged at: a low card may fade out
      // later, a card with no moment at all has no use.
      neverRight: rows.length > 0 && rows.every(r => r.neverRight),
      blind: rows.some(r => r.blind),
    };
  });
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** The whole gate (or a scope of it), from the cache when it is warm. */
export function measureGate(scope: GateScope = {}, budget: GateBudget = GATE_BUDGET): GateReport {
  const kits = scopeKits(scope).flatMap(kit => inScope(GATE_LEVELS, scope).map(level => gateKitCell(kit, level, budget)));
  const styles = scope.kits ? [] : inScope(STYLE_LEVELS, scope).map(level => gateStyleCell(level, budget));
  const cards = scopeKits(scope).flatMap(kit => gateCardCells(kit, budget, inScope(CARD_LEVELS, scope)));
  const failures = [
    ...kits.filter(c => !c.ok).map(c => `${c.kit} L${c.level}: ${c.reasons.join(', ')}`),
    ...styles.flatMap(s => s.broken.map(b => `L${s.level} triangle: ${b} doesn't hold`)),
    ...styles.filter(s => !s.turtle.ok).map(s => `L${s.level} turtle: scores ${pct(s.turtle.score)} against the AI`),
    ...cards.filter(c => c.neverRight).map(c => `${c.kit} ${c.name}: never the right play (L${c.levels.map(l => l.level).join(', L')})`),
    ...cards.filter(c => c.blind).map(c => `${c.kit} ${c.name}: the AI is blind to it (L${c.levels.filter(l => l.blind).map(l => l.level).join(', L')})`),
  ];
  return { kits, styles, cards, failures };
}

/** Everything a worker needs to rebuild the gate's run. */
export interface GateContext { set: RunContext['set']; budget: GateBudget }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'gate-worker.js');

/** Fill the cache `measureGate(scope, ctx.budget)` reads, across bench's lanes. */
export async function prepareGate(ctx: GateContext, scope: GateScope = {}, onProgress?: (done: number, total: number) => void): Promise<void> {
  await warm(gateJobs(scope), [process.execPath, '--import', 'tsx', WORKER, JSON.stringify(ctx)], onProgress);
}
