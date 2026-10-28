/**
 * The audit's seeded draws — shared by the archetypes (`catalogue.ts`) and
 * the composed cards (`compose.ts`), so neither has to import the other.
 */
export type Params = Record<string, number>;
export const AUDIT_SKILL = 'audit';

/** A seeded uniform draw in [0, 1), and helpers over it. */
export interface Draw {
  (): number;
}
export const pick = <T>(r: Draw, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const int = (r: Draw, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
/** A draw from a frequency table `[value, weight][]`. */
export function weighted<T>(r: Draw, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of table) { x -= w; if (x <= 0) return v; }
  return table[table.length - 1][0];
}

/** Dice from a profile ladder, as `{n, s}`. */
export function dice(r: Draw, ladder: readonly (readonly [string, number])[]): Params {
  const [n, s] = weighted(r, ladder).split('d').map(Number);
  return { n, s };
}
