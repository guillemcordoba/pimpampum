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
let integer: ((n: number) => number) | null = null;

/** A random float in [0, 1) — the single entry point for engine randomness. */
export function random(): number {
  return current();
}

/**
 * A uniform integer in [0, n) — how the engine itself rolls and shuffles. The
 * same draw as `Math.floor(random() * n)`, but with `n` visible, so a caller
 * that must ENUMERATE chance rather than sample it can answer each draw
 * (`withChance`).
 */
export function randomInt(n: number): number {
  return integer ? integer(n) : Math.floor(current() * n);
}

/**
 * Run `fn` with every integer draw answered by `answer` (given the number of
 * outcomes, it returns one). A float draw inside it throws: it could not be
 * enumerated. `withSeed`, `withRng` and `setRng` inside it draw normally.
 */
export function withChance<T>(answer: (n: number) => number, fn: () => T): T {
  const previous = current;
  const previousInt = integer;
  integer = answer;
  current = () => { throw new Error('rng: a float draw where every draw must be enumerable (use randomInt)'); };
  try {
    return fn();
  } finally {
    current = previous;
    integer = previousInt;
  }
}

/** Install a generator (or restore Math.random with null). */
export function setRng(fn: (() => number) | null): void {
  current = fn ?? Math.random;
  integer = null;
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

/** `gen` mirrored: u → 1 − u, kept inside [0, 1). A draw and its mirror are antithetic. */
export function mirrored(gen: () => number): () => number {
  return () => {
    const u = gen();
    return u === 0 ? 0 : 1 - u;
  };
}

/** Run `fn` with a seeded generator, restoring the previous one afterwards. */
export function withSeed<T>(seed: number, fn: () => T): T {
  return withRng(seededRng(seed), fn);
}

/** Run `fn` drawing from `gen`, restoring the previous generator afterwards. */
export function withRng<T>(gen: () => number, fn: () => T): T {
  const previous = current;
  const previousInt = integer;
  current = gen;
  integer = null;
  try {
    return fn();
  } finally {
    current = previous;
    integer = previousInt;
  }
}

/**
 * `withSeed` for an async `fn`: the seeded generator stays in place across
 * its awaits. Nothing else on this thread may draw meanwhile — one seeded
 * fight at a time (an AI awaiting worker threads mid-fight).
 */
export async function withSeedAsync<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const previous = current;
  const previousInt = integer;
  current = seededRng(seed);
  integer = null;
  try {
    return await fn();
  } finally {
    current = previous;
    integer = previousInt;
  }
}
