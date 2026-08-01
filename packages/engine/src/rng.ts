/**
 * The engine's source of randomness. Everything that rolls, shuffles or picks
 * goes through `random()` so a caller can make a whole batch of combats
 * reproducible — used by the encounter solver, which simulates the real fight
 * many times and needs COMMON RANDOM NUMBERS across candidate encounters (the
 * same dice for every candidate, so comparisons aren't drowned in noise).
 *
 * Default behaviour is plain Math.random; nothing changes unless a seed is set.
 */

let current: () => number = Math.random;

/** A random float in [0, 1) — the single entry point for engine randomness. */
export function random(): number {
  return current();
}

/** Install a generator (or restore Math.random with null). */
export function setRng(fn: (() => number) | null): void {
  current = fn ?? Math.random;
}

/** Small, fast, well-distributed seeded PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with a seeded generator, restoring the previous one afterwards. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const previous = current;
  current = seededRng(seed);
  try {
    return fn();
  } finally {
    current = previous;
  }
}
