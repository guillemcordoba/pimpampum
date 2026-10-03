/**
 * THE ARENA — the shared registry, seeded team generation, and match running.
 *
 * Moved here from `tests/helpers.ts`, where it had two problems. It was the
 * only party generator in the repo that drew from bare `Math.random()`, so
 * every mirror sweep in the package was irreproducible and, worse, shared NO
 * random numbers between the arms it was comparing — half a dozen harnesses
 * mutate a card, re-run, and read a 1-2pp difference off uncorrelated samples.
 * And it lived under `tests/` while nine non-test scripts imported it.
 *
 * Randomness flows through the engine's `random()`, so a seeded caller gets a
 * reproducible party. Wrap a sweep in `withSeed` and every arm meets the same
 * teams and the same dice.
 *
 * WHAT LEFT: this file used to carry its own `randomPlayer` — a second draw,
 * with its own equipment distribution, living alongside the one the balancer
 * prices with. Two generators that disagree about what a typical party looks
 * like is two answers to every question asked of "a typical party". The draw
 * is the SET's now (`GameSet.randomParty`), and there is one of it.
 */
import {
  Character, CombatEngine, CombatStats, EffectRegistry, setAIControlled,
} from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { theSet } from './gameset.js';

/**
 * THE REGISTRY EVERY SIMULATION PLAYS WITH — the set's own handlers, built once.
 *
 * A function rather than a `const` because a module-level constant would run at
 * IMPORT time, before `useSet()` has been called, and throw on any import of
 * this package. Memoised per set so the cost is still paid once.
 *
 * A registry missing the set's enemy handlers plays a different game in
 * silence — enemy cards resolve to nothing and the fight prices as trivial —
 * so assembling it is the set's job, not the caller's.
 */
const registries = new Map<string, EffectRegistry>();

export function theRegistry(): EffectRegistry {
  const set = theSet();
  let r = registries.get(set.id);
  if (!r) { r = set.registry(); registries.set(set.id, r); }
  return r;
}

/**
 * A team of `size` drawn players at the given per-player skill budget.
 *
 * Delegates to the set: what a representative party looks like — which kits
 * pair, what gear they carry, how many levels buy a second skill — is content
 * calibration, not measurement.
 */
export function randomTeam(
  prefix: string, size: number, perPlayerBudget: number, equip = true, pv?: number,
): Character[] {
  return theSet().randomParty(prefix, size, perPlayerBudget, equip, pv);
}

/**
 * How hard both sides think in a mirror match. Depth 1 is what the balancer
 * prices at, so a kit's mirror winrate and its encounter price mean the same
 * thing — at ~6× the compute. Tests that only check SYMMETRY (a mirror is
 * 50/50 at any depth) pass 0 to stay fast.
 */
export const MIRROR_DEPTH = 1;

/** Run one match; returns the winning team index (0/1) or null for a draw. */
export function runMatch(
  teamA: Character[], teamB: Character[], stats?: CombatStats,
  maxRounds = 40, aiDepth = MIRROR_DEPTH,
): number | null {
  setAIControlled(teamA);
  setAIControlled(teamB);
  return new CombatEngine(teamA, teamB, { registry: theRegistry(), maxRounds, ...aiPolicy({ depth: aiDepth }) }).runCombat(stats).winner;
}
