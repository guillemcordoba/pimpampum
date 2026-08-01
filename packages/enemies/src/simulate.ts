/**
 * Encounter balancer v3 — SIMULATED, not modelled.
 *
 * v2 priced a fight through a chain of fitted scalars: a measured `threat` per
 * body, a global count exponent β, a party-strength exponent α, an armour
 * factor and a logistic. Every one of those was a closed-form approximation of
 * something the engine can just PLAY: a full 4v6 combat runs in well under a
 * millisecond, so a few hundred of them price an encounter exactly, for the
 * real party, the real armour, the real counts and the real cards.
 *
 * What that buys:
 *  - Any composition, any body count. No probe counts, no count-drift clamp.
 *  - New or homebrew creatures need NO measurement pass — write the cards and
 *    they are priceable immediately.
 *  - Party armour, party size and per-player levels stop being fitted terms:
 *    the simulated party simply wears the armour and plays the fight.
 *
 * The honest caveat: the number is the winrate of AI play. It is only as good
 * as `ai.ts` — but so was every measured threat in v2, since those were fitted
 * against the same AI. The bias is now visible instead of laundered.
 *
 * COMMON RANDOM NUMBERS: every candidate in a solve is evaluated under the
 * same seed, so candidates differ by their own merits rather than by dice
 * noise. This is what makes a bisection on a stochastic function stable.
 */
import { CombatEngine, EffectRegistry, Character, withSeed, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { createRegistry, buildReferenceParty, PartySpec } from '@pimpampum/skills';
import { EnemyDefinition, fullKitLevel } from './types.js';
import { getEnemy, registerEnemySkills } from './catalog.js';
import { createEnemyFrom } from './factory.js';
import { leanChooser } from './ai-policy.js';

/** The balancer plays with the distilled lean AI (see ai-policy.ts) — the
 *  strength of this policy IS the meaning of every difficulty number. */
const BALANCER_CHOOSER = leanChooser();

/** A concrete fielded group (what actually stands on the table). */
export interface FieldedGroup {
  enemyId: string;
  count: number;
  /** Kit ordinal; the creature's full kit when omitted. */
  level?: number;
  /** PV per body. */
  pv: number;
}

export interface SimOptions {
  /** Combats per evaluation. 200 → ±3.5pp, 500 → ±2.2pp (1σ). */
  games?: number;
  /** Seed for common random numbers across candidates. */
  seed?: number;
  registry?: EffectRegistry;
  maxRounds?: number;
}

const DEFAULT_GAMES = 320;
const DEFAULT_SEED = 20260801;

let sharedRegistry: EffectRegistry | null = null;
/** Registry with player + enemy handlers, built once and reused. */
function defaultRegistry(): EffectRegistry {
  if (!sharedRegistry) {
    sharedRegistry = createRegistry();
    registerEnemySkills(sharedRegistry);
  }
  return sharedRegistry;
}

/** Instantiate one group's bodies. */
function buildGroup(g: FieldedGroup): Character[] {
  const def = getEnemy(g.enemyId);
  if (!def) return [];
  return Array.from({ length: Math.max(0, g.count) }, (_, i) => {
    const name = g.count > 1 ? `${def.displayName} ${i + 1}` : def.displayName;
    return createEnemyFrom(def, { pv: g.pv, level: g.level, name });
  });
}

/** Instantiate every enemy of a composition. */
export function buildComposition(groups: FieldedGroup[]): Character[] {
  return groups.flatMap(buildGroup);
}

export interface SimResult {
  /** Player winrate, draws counted as ½ (matches the v2 calibration). */
  winrate: number;
  games: number;
  avgRounds: number;
  /** 1σ sampling error in winrate points, for honest UI rounding. */
  stderr: number;
}

/**
 * Play the encounter `games` times and report how often the players win.
 * This IS the difficulty — there is no model in between.
 */
export function simulateEncounter(groups: FieldedGroup[], party: PartySpec, opts: SimOptions = {}): SimResult {
  const games = opts.games ?? DEFAULT_GAMES;
  const registry = opts.registry ?? defaultRegistry();
  const maxRounds = opts.maxRounds ?? 40;
  const enemyCount = groups.reduce((n, g) => n + Math.max(0, g.count), 0);
  if (enemyCount === 0) return { winrate: 1, games: 0, avgRounds: 0, stderr: 0 };

  const { wins, rounds } = withSeed(opts.seed ?? DEFAULT_SEED, () => {
    let wins = 0, rounds = 0;
    for (let i = 0; i < games; i++) {
      const players = buildReferenceParty(party);
      // Simulated players need a strategy; enemies carry their template's.
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const enemies = buildComposition(groups);
      const result = new CombatEngine(players, enemies, {
        registry, maxRounds, actionChooser: BALANCER_CHOOSER,
      }).runCombat();
      if (result.winner === 0) wins += 1;
      else if (result.winner === null) wins += 0.5;
      rounds += result.rounds;
    }
    return { wins, rounds };
  });

  const winrate = wins / games;
  // Games are not quite iid Bernoulli: the party is redrawn each time and
  // party composition matters a lot against some kits, so the observed spread
  // runs ~25% wider than the binomial figure (measured on the basilisk: 4.4pp
  // vs a predicted 3.5pp). Inflate rather than quote an error bar we beat.
  const HETEROGENEITY = 1.25;
  return {
    winrate,
    games,
    avgRounds: rounds / games,
    stderr: HETEROGENEITY * Math.sqrt(Math.max(0.0001, winrate * (1 - winrate)) / games),
  };
}

// --------------------------------------------------------------- the solver

/**
 * Absolute PV bounds a solved body may be given. Creatures carry no printed
 * PV any more, so the solver searches PV itself rather than a multiplier on a
 * stat-block number. The range only has to span "flimsier than a goblin" to
 * "a boss that soaks a whole fight".
 */
export const PV_MIN = 2;
export const PV_MAX = 600;

/** One group requested from the solver. */
export interface PoolSpec {
  enemyId: string;
  /** How many bodies stand on the table. The caller's choice — the balancer
   *  prices whatever count it is given, at any size. */
  count: number;
  /** Kit ordinal. Honoured when given; otherwise the creature's full kit. */
  level?: number;
  /** Fix this group's PV instead of letting the solver set it. Use it when a
   *  mixed encounter wants a tanky boss beside fragile mooks — otherwise every
   *  body in the encounter gets the same solved PV. */
  pv?: number;
}

export interface SolvedGroup {
  enemyId: string;
  count: number;
  level: number;
  /** PV each fielded body should have. */
  pv: number;
}

export interface SolvedEncounter {
  groups: SolvedGroup[];
  targetWinrate: number;
  /** SIMULATED winrate of the returned composition (not a model prediction). */
  predictedWinrate: number;
  /** 1σ error on `predictedWinrate`. */
  stderr: number;
  /** The PV the solver settled on for groups that didn't fix their own. */
  solvedPv: number;
  /** True when the target was unreachable inside the PV bounds. */
  clamped: boolean;
  avgRounds: number;
  /** Combats the reported winrate was measured over. */
  games: number;
}

export interface SolveOptions extends SimOptions {
  /** Games used during the search (cheap); the final answer is re-measured
   *  with `games`. Default 120. */
  searchGames?: number;
  /** Bisection steps on PV. Default 11. */
  steps?: number;
}

/**
 * Solve an encounter: keep the requested composition and set the enemies' PV
 * so the SIMULATED player winrate hits the target.
 *
 * Winrate falls monotonically as enemy PV rises, so a bisection converges —
 * and because every evaluation shares one seed, the function it bisects is
 * deterministic rather than noisy.
 */
export function solveEncounter(
  pool: PoolSpec[],
  party: PartySpec,
  targetWinrate: number,
  opts: SolveOptions = {},
): SolvedEncounter | null {
  const entries = pool
    .map(spec => ({ spec, def: getEnemy(spec.enemyId) }))
    .filter((e): e is { spec: PoolSpec; def: EnemyDefinition } => !!e.def)
    .filter(e => e.spec.count > 0);
  if (entries.length === 0) return null;

  const seed = opts.seed ?? DEFAULT_SEED;
  const searchGames = opts.searchGames ?? 120;
  const steps = opts.steps ?? 11;
  const target = Math.min(0.99, Math.max(0.01, targetWinrate));

  // Groups that fix their own PV are left alone; the rest all take the PV
  // being searched. Every body is equally durable unless the caller says
  // otherwise — creatures no longer carry a printed PV to scale from.
  const groupsAt = (pv: number): FieldedGroup[] => entries.map(({ spec, def }) => ({
    enemyId: def.id,
    count: spec.count,
    level: spec.level ?? fullKitLevel(def),
    pv: spec.pv ?? Math.max(PV_MIN, Math.round(pv)),
  }));

  const winrateAt = (pv: number, games: number): number =>
    simulateEncounter(groupsAt(pv), party, { ...opts, games, seed }).winrate;

  // Bisect: more enemy PV → lower player winrate. Early steps only need to
  // find the region, so they run cheap; later steps sharpen as the bracket
  // narrows and the decision gets finer than the sampling error.
  let lo = PV_MIN, hi = PV_MAX;
  let clamped = false;
  let solvedPv: number;
  if (winrateAt(lo, searchGames) <= target) {
    solvedPv = lo; clamped = true;        // even flimsy bodies beat the target
  } else if (winrateAt(hi, searchGames) >= target) {
    solvedPv = hi; clamped = true;        // even the toughest aren't enough
  } else {
    for (let i = 0; i < steps; i++) {
      const mid = Math.sqrt(lo * hi);     // geometric: PV scales multiplicatively
      const games = Math.round(searchGames * (1 + (2 * i) / Math.max(1, steps - 1)));
      if (winrateAt(mid, games) > target) lo = mid; else hi = mid;
    }
    solvedPv = Math.sqrt(lo * hi);
  }

  // Report an INDEPENDENT measurement of what we return: the number the GM
  // sees is a fresh estimate, never the sample the search steered on (picking
  // the best of several noisy candidates and then reporting that same sample
  // is winner's curse — it reads 3-4pp better than the encounter really is).
  //
  // The achieved winrate will not sit exactly on the target, and that is
  // honest rather than a defect: PV is an INTEGER lever, so at small bodies a
  // single point of PV is worth several winrate points and some targets are
  // simply not reachable. `stderr` says how much of the gap is sampling.
  const groups = groupsAt(solvedPv);
  const final = simulateEncounter(groups, party, {
    ...opts, games: opts.games ?? DEFAULT_GAMES, seed: seed + 977,
  });

  return {
    groups: groups.map(g => ({
      enemyId: g.enemyId,
      count: g.count,
      level: g.level!,
      pv: g.pv,
    })),
    targetWinrate: target,
    predictedWinrate: final.winrate,
    stderr: final.stderr,
    solvedPv: Math.max(PV_MIN, Math.round(solvedPv)),
    clamped,
    avgRounds: final.avgRounds,
    games: final.games,
  };
}

/** Single-species convenience: solve `count` of one creature against the party. */
export function generateEncounter(
  def: EnemyDefinition,
  count: number,
  party: PartySpec,
  targetWinrate: number,
  opts: SolveOptions = {},
): SolvedEncounter | null {
  return solveEncounter([{ enemyId: def.id, count }], party, targetWinrate, opts);
}

/** Handy target-winrate presets for UIs. The solver takes any winrate. */
export const TARGET_WINRATES = { easy: 0.90, medium: 0.80, hard: 0.65, boss: 0.50 } as const;
export type EncounterDifficulty = keyof typeof TARGET_WINRATES;
