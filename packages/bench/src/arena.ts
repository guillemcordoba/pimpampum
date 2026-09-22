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
 * reproducible party. Wrap a sweep in `withSeed` (or use `mirrorSweep()` below)
 * and every arm meets the same teams and the same dice.
 *
 * WHAT LEFT: this file used to carry its own `randomPlayer` — a second draw,
 * with its own equipment distribution, living alongside the one the balancer
 * prices with. Two generators that disagree about what a typical party looks
 * like is two answers to every question asked of "a typical party". The draw
 * is the SET's now (`GameSet.randomParty`), and there is one of it.
 */
import {
  Character, CombatEngine, CombatStats, EffectRegistry,
  mergeCombatStats, newCombatStats, random, setAIControlled, withSeed,
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

export interface MatchupResult {
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  totalRounds: number;
}

/** Repeatedly fight two freshly-built teams (factories) and tally results. */
export function runMatchup(
  makeA: () => Character[], makeB: () => Character[], games: number,
  stats?: CombatStats, aiDepth = MIRROR_DEPTH,
): MatchupResult {
  const res: MatchupResult = { games, aWins: 0, bWins: 0, draws: 0, totalRounds: 0 };
  for (let i = 0; i < games; i++) {
    // Always collect locally: `totalRounds` used to read 0 whenever the caller
    // passed no `stats`, because the counter it summed was never handed to the
    // engine. A silent zero in a rounds column is exactly the kind of number
    // this package exists to not print.
    const local = newCombatStats();
    const winner = runMatch(makeA(), makeB(), local, 40, aiDepth);
    if (stats) mergeCombatStats(stats, local);
    res.totalRounds += local.rounds;
    if (winner === 0) res.aWins++;
    else if (winner === 1) res.bWins++;
    else res.draws++;
  }
  return res;
}

/**
 * THE MIRROR SWEEP — several arms of a content experiment, compared honestly.
 *
 * Five harnesses had copy-pasted this loop (`experiment-berserk`, `-heal`,
 * `-objects`, `-tuning`, `-balance-pass`): mutate a card's params, run N mirror
 * matches, tally, restore. Three things it gets right that a hand-rolled copy
 * kept getting wrong:
 *
 *  - COMMON RANDOM NUMBERS. Every arm runs on the same seed, so each meets the
 *    same teams and the same dice and differs only by the mutation. Without it
 *    the arms are independent samples, and at a 1-in-7 chance the subject kit
 *    even appears, that is a couple of points of noise on a difference these
 *    harnesses routinely read at one point. (Partial, not perfect: the arms
 *    share a dice STREAM but desynchronise once a mutated card changes a
 *    decision. It tightens the comparison; it does not make it exact, which is
 *    why the error bars stay the conservative independent ones.)
 *  - RESTORE EVEN ON A THROW. The arms mutate shared content — `ALL_EQUIPMENT`,
 *    a card's `params` — in place. Every copy restored by hand at the end, so
 *    an exception mid-sweep left the game mutated for every later arm in the
 *    process, and the numbers after it were about content nobody chose.
 *  - The tally is the caller's, so this owns the loop and not the question.
 */
export interface SweepArm<T> {
  label: string;
  /** Mutate shared content for this arm. Undone automatically afterwards. */
  apply?: () => void;
  /** Called once per match with the two teams and the winner. */
  tally: (a: Character[], b: Character[], winner: number | null) => void;
  /** Read the arm's answer once its matches are done. */
  read: () => T;
}

export interface SweepOptions {
  games: number;
  seed: number;
  size?: number;
  budget?: number;
  /** PV per generated player — the PV/armour tuning sweep varies it per arm.
   *  Defaults to the set's own `playerPV`. */
  pv?: number;
  stats?: CombatStats;
  aiDepth?: number;
}

export function mirrorSweep<T>(arms: SweepArm<T>[], opts: SweepOptions): { label: string; result: T }[] {
  const { games, seed, size = 2, budget = 6, pv = theSet().playerPV, aiDepth = MIRROR_DEPTH } = opts;
  const out: { label: string; result: T }[] = [];
  for (const arm of arms) {
    // `finally`, not "at the end": a throw in one arm must not leave the
    // content mutated for the next one.
    try {
      arm.apply?.();
      withSeed(seed, () => {
        for (let i = 0; i < games; i++) {
          const a = randomTeam('A', size, budget, true, pv);
          const b = randomTeam('B', size, budget, true, pv);
          arm.tally(a, b, runMatch(a, b, opts.stats, 40, aiDepth));
        }
      });
      out.push({ label: arm.label, result: arm.read() });
    } finally {
      restoreAll();
    }
  }
  return out;
}

/**
 * Snapshot-and-restore for in-place content mutation.
 *
 * `mutate(obj, patch)` records the fields it overwrites the FIRST time an
 * object is touched, so `restoreAll()` puts everything back however many arms
 * scribbled on it.
 */
const snapshots = new Map<object, Record<string, unknown>>();

export function mutate<T extends object>(target: T, patch: Partial<T>): void {
  let snap = snapshots.get(target);
  if (!snap) { snap = {}; snapshots.set(target, snap); }
  for (const k of Object.keys(patch) as (keyof T & string)[]) {
    if (!(k in snap)) snap[k] = target[k];
    (target as Record<string, unknown>)[k] = patch[k] as unknown;
  }
}

/** Put every mutated object back. Called for you by `mirrorSweep`. */
export function restoreAll(): void {
  for (const [target, snap] of snapshots) {
    for (const [k, v] of Object.entries(snap)) (target as Record<string, unknown>)[k] = v;
  }
  snapshots.clear();
}
