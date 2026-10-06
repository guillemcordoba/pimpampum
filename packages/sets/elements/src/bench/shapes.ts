/**
 * THE ELEMENTS SET'S CALIBRATION DATA — fight shapes, company rows, stand-ins
 * and the bands. Data only; what is done with it is `@pimpampum/bench`'s.
 *
 * Empty: every card of the set was removed on 2026-10-06 to be redesigned from
 * scratch, kit by kit. Each kit and creature that lands fills its rows back in
 * (probed with `probe-shapes.ts --set elements`).
 */
import type { Shape } from '@pimpampum/bench';

/** The shapes a kit is measured across. PV is solved, never written down. */
export const SHAPES: Shape[] = [];

/** Ally rows, every kit in some row. */
export const COMPANY: string[][] = [];

/** The stand-in per company row — never a kit already in that row. */
export const CALIBRATION_KITS: string[] = [];

/** Creatures no SHAPE fields, and why. */
export const UNFIELDED_ENEMIES: Record<string, string> = {};

/** The winrate shapes are solved toward — an aim, not a requirement. */
export const FAIR = 0.6;

/** Average fight length the shapes are solved up to (intentions.md: ~5). */
export const MAX_AVG_ROUNDS = 5;

/** A cell outside this band is pinned against an edge and not measured in. */
export const SATURATION = { min: 0.20, max: 0.80 };

/** How many bodies a harness fields for "a natural fight" of one creature. */
export const FIELDED: Record<string, number> = {};

export const UNLISTED_BODIES = 3;

export function bodiesFor(enemyId: string): number {
  return FIELDED[enemyId] ?? UNLISTED_BODIES;
}
