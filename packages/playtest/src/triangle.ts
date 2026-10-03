/**
 * REQUIREMENT 4 — THE STRATEGY TRIANGLE, measured: intentions.md's Power >
 * Protect > Aggro > Power, each corner a LEANING style (`bench` `leaning`)
 * fought against the next in mirror matches (`headToHead`).
 *
 * Set-level, not per kit: it is about how two sides' styles meet, so it needs
 * hero-against-hero fights, and a kit cell is heroes against creatures whose AI
 * has no style. Content-agnostic — `measureCycle` takes any styles, which is
 * what lets the controls hand it ones whose order is known by construction.
 */
import { type Chooser, cycleDuels, games as sized, triangleStyles } from '@pimpampum/bench';
import { TRIANGLE_GAMES, triangleVerdict } from './rules.js';

export interface TriangleEdge { winner: string; loser: string; winrate: number; games: number }
export interface TriangleReport { edges: TriangleEdge[]; ok: boolean; broken: string[] }

/** Each style against the next, wrapping round, judged edge by edge. */
export function measureCycle(styles: { name: string; chooser: Chooser }[], games = sized(TRIANGLE_GAMES)): TriangleReport {
  const edges = cycleDuels(styles, games).map(e => ({
    winner: e.winner, loser: e.loser, winrate: e.duel.winrate, games: e.duel.games,
  }));
  return { edges, ...triangleVerdict(edges) };
}

/** The installed set's triangle. */
export function measureTriangle(games?: number): TriangleReport {
  return measureCycle(triangleStyles(), games);
}
