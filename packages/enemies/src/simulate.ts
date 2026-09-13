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
import { CombatEngine, EffectRegistry, Character, withSeed, setAIControlled } from '@pimpampum/engine';
import { createRegistry, buildReferenceParty, isExplicitParty, PartySpec } from '@pimpampum/skills';
import { EnemyDefinition, fullKitLevel } from './types.js';
import { getEnemy, registerEnemySkills } from './catalog.js';
import { createEnemyFrom } from './factory.js';
/**
 * How hard the balancer's AI thinks. The strength of this play IS the meaning
 * of every difficulty number: price an encounter against a party that blunders
 * and it will feel trivial at a table that does not. Depth 1 (2026-08-08) beats
 * depth 0 head-to-head 70/30 for ~6x the compute — see ai-benchmark.ts.
 */
const BALANCER_DEPTH: number = 1;

/**
 * SEARCH CHEAP, VERIFY HONESTLY.
 *
 * Pricing every evaluation at depth 1 costs 29× a whole solve (measured
 * 2026-08-08: 6.9 s → 199 s for one 4-goblin request), which is a browser
 * worker running for three minutes. But the bisection does not need strong
 * play — it needs the winrate to FALL as PV rises, which depth 0 gets right.
 * Only the answer needs to be true.
 *
 * So the scale is searched at depth 0, then a short local refinement and the
 * reported measurement run at depth 1. The refinement matters because the two
 * settings do not agree: the same request solves to pv24 at depth 0 and pv20
 * at depth 1 — both sides play better, and a goblin swarm gains more from
 * coordinating than a four-hero party does.
 */
const SEARCH_DEPTH: number = 0;
/** Local bisection steps at the real depth, around the depth-0 answer. */
const VERIFY_STEPS = 4;
/** How far off the depth-0 answer can be; the measured gap was ~17%. */
const VERIFY_BRACKET = 1.6;
/** Games behind the depth-1 numbers. Fewer than the depth-0 report used —
 *  ±2.9pp instead of ±1.7pp — because each game costs ~7× more. */
const VERIFY_GAMES = 300;

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
  /** Lookahead budget when aiDepth ≥ 1 (samples/passes/topK). */
  aiLookahead?: { samples?: number; passes?: number; topK?: number };
  /** How hard the AI thinks while pricing (engine `aiDepth`). Defaults to
   *  BALANCER_DEPTH. Lower it to trade accuracy for speed — every number a
   *  solve produces is the winrate of play AT THIS SETTING, so a solve and its
   *  replay must use the same one. */
  aiDepth?: number;
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
      setAIControlled(players);
      const enemies = buildComposition(groups);
      const result = new CombatEngine(players, enemies, {
        registry, maxRounds, aiDepth: opts.aiDepth ?? BALANCER_DEPTH, aiLookahead: opts.aiLookahead,
      }).runCombat();
      if (result.winner === 0) wins += 1;
      else if (result.winner === null) wins += 0.5;
      rounds += result.rounds;
    }
    return { wins, rounds };
  });

  const winrate = wins / games;
  // A DRAWN party makes games not quite iid Bernoulli: the party is redrawn
  // each time and party composition matters a lot against some kits, so the
  // observed spread runs ~25% wider than the binomial figure (measured on the
  // basilisk: 4.4pp vs a predicted 3.5pp). Inflate rather than quote an error
  // bar we beat. An EXPLICIT party is the same characters every game, so that
  // source of spread is gone and the binomial figure is the honest one.
  const HETEROGENEITY = isExplicitParty(party) ? 1 : 1.25;
  return {
    winrate,
    games,
    avgRounds: rounds / games,
    stderr: HETEROGENEITY * Math.sqrt(Math.max(0.0001, winrate * (1 - winrate)) / games),
  };
}

// --------------------------------------------------------------- the solver

/**
 * Bounds on the PV a solved BODY may be given. These are body PV, not the
 * scale the solver searches: a body ends up with `scale × its bulk`, so the
 * bracket is these bounds divided through by the heaviest bulk in the
 * encounter (see `solveEncounter`). Getting that conversion wrong silently
 * raises the floor for big creatures — a bulk-3.57 basilisk could not be given
 * less than 7 PV, which made easy fights containing one unreachable.
 */
export const PV_MIN = 1;
export const PV_MAX = 600;

/** Below this body PV, one point of PV is worth more than the sampling error,
 *  so the solver checks the neighbouring integers (see `solveEncounter`). */
const REFINE_BELOW_PV = 12;

/** A creature's relative flesh; 1 when it doesn't say. */
function bulkOf(def: EnemyDefinition): number {
  return def.bulk && def.bulk > 0 ? def.bulk : 1;
}

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
  /** The PV scale the solver settled on. A group's PV is `scale × bulk`, so
   *  this equals the PV of a bulk-1 body; read the per-group `pv` for what
   *  actually stands on the table. */
  solvedScale: number;
  /** True when the target was unreachable inside the PV bounds. */
  clamped: boolean;
  avgRounds: number;
  /**
   * True when the DURATION budget bound the answer rather than the winrate
   * target: the requested difficulty was only reachable by making the fight
   * longer than `maxAvgRounds`, so the solver returned the hardest encounter
   * that still fits the budget. `predictedWinrate` is then EASIER than
   * `targetWinrate`, and honestly so — the fix is a different composition
   * (more bodies, or a higher level), not more hit points.
   */
  durationCapped: boolean;
  /** The round budget this solve was held to. */
  maxAvgRounds: number;
  /** Combats the reported winrate was measured over. */
  games: number;
}

/**
 * Average rounds a solved encounter may run.
 *
 * The game is tuned for fights of about five rounds (intentions.md). Left
 * unconstrained the solver blows straight through that: measured over 100
 * GM-shaped requests it produced a median 12-round fight, and one-creature
 * encounters averaged 19 rounds and 235 PV per body.
 *
 * 6 rather than 5, to match the threshold the encounter creator already warns
 * at and to leave a round of slack for sampling noise.
 */
export const DEFAULT_MAX_AVG_ROUNDS = 6;

export interface SolveOptions extends SimOptions {
  /** Games used during the search (cheap); the final answer is re-measured
   *  with `games`. Default 120. */
  searchGames?: number;
  /** Bisection steps on PV. Default 11. */
  steps?: number;
  /** Cap on the average fight length, in rounds. Default
   *  `DEFAULT_MAX_AVG_ROUNDS`; pass `Infinity` to solve on winrate alone. */
  maxAvgRounds?: number;
}

/**
 * Solve an encounter: keep the requested composition and set the enemies' PV
 * so the SIMULATED player winrate hits the target, WITHOUT the fight running
 * longer than `maxAvgRounds`.
 *
 * Winrate falls monotonically as enemy PV rises, so a bisection converges —
 * and because every evaluation shares one seed, the function it bisects is
 * deterministic rather than noisy.
 *
 * Duration is a CONSTRAINT, not a report. PV is the solver's only lever, and
 * it buys durability rather than danger: when a composition cannot threaten
 * the party per round, the only way to reach a hard winrate is to turn the
 * enemies into sponges. Under the old daily fatigue budget the "difficulty"
 * that resulted was the party exhausting itself and dying on Cop desesperat
 * (lifting the ceiling turned a solved 50% 432-PV wolf into a 100% party win);
 * the budget is gone, but a 29-round fight is still not the fight the number
 * promises, so it is refused: the solver
 * returns the hardest encounter inside the budget and flags `durationCapped`,
 * leaving the GM to change the composition instead.
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
  const maxAvgRounds = opts.maxAvgRounds ?? DEFAULT_MAX_AVG_ROUNDS;

  // Groups that fix their own PV are left alone; the rest take the scale being
  // searched, SHARED OUT by each creature's bulk — a goblin beside a basilisk
  // should not be equally durable just because one lever set both.
  //
  // The scale is the only thing solved, so a single-species encounter lands on
  // the same PV whatever its bulk (the scale absorbs it): bulk redistributes,
  // it never makes a creature secretly tougher.
  const groupsAt = (scale: number): FieldedGroup[] => entries.map(({ spec, def }) => ({
    enemyId: def.id,
    count: spec.count,
    level: spec.level ?? fullKitLevel(def),
    pv: spec.pv ?? Math.max(PV_MIN, Math.round(scale * bulkOf(def))),
  }));

  // Every evaluation the search makes is kept: bisection throws all but the
  // last bracket away, and that discarded information is worth more than the
  // final decision (see the fit below).
  const samples: { scale: number; winrate: number; games: number }[] = [];
  const winrateAt = (scale: number, games: number, aiDepth = SEARCH_DEPTH): number => {
    const winrate = simulateEncounter(groupsAt(scale), party, { ...opts, games, seed, aiDepth }).winrate;
    // Only depth-0 samples feed the fit below: mixing two AI strengths into one
    // regression would fit a curve neither of them follows.
    if (aiDepth === SEARCH_DEPTH) samples.push({ scale, winrate, games });
    return winrate;
  };

  const logit = (p: number): number => Math.log(p / (1 - p));

  /**
   * Where does the winrate curve cross the target?
   *
   * Bisection answers that from its LAST comparison only, and each comparison
   * is a ±4pp sample, so near the crossing it decides on noise and its answer
   * random-walks a few PV either side — measured at up to ±4.6pp of placement
   * error on a lone basilisk. Every sample taken on the way down is evidence
   * about the same curve, though, so fit them all instead of discarding them.
   *
   * `logit(winrate)` is close to linear in scale over the region that matters
   * (measured on the basilisk: 55→130 PV holds a slope near −0.045/PV), so a
   * games-weighted least-squares line through the nearby samples, inverted at
   * the target, places the answer using the whole search rather than its last
   * step. Returns null when the samples can't support a fit.
   */
  const fitCrossing = (): number | null => {
    const usable = samples.filter(s =>
      s.winrate > 0.02 && s.winrate < 0.98
      && Math.abs(logit(s.winrate) - logit(target)) < 2.2);   // near the target only
    if (usable.length < 3) return null;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const s of usable) {
      const w = s.games, x = s.scale, y = logit(s.winrate);
      sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
    }
    const denom = sw * sxx - sx * sx;
    if (denom === 0) return null;
    const slope = (sw * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / sw;
    if (!(slope < 0)) return null;                 // winrate must fall with PV
    const crossing = (logit(target) - intercept) / slope;
    return Number.isFinite(crossing) ? crossing : null;
  };

  // The bracket is in SCALE, but the bounds that matter are per body — so
  // convert through the heaviest bulk present. At `lo` the biggest creature
  // sits at PV_MIN (everything lighter floors there too), at `hi` it sits at
  // PV_MAX. Bracketing in raw PV instead would deny a heavy creature the
  // bottom of its range and make easy encounters containing one unsolvable.
  const heaviest = Math.max(...entries.map(e => bulkOf(e.def)));

  // Bisect: more enemy PV → lower player winrate. Early steps only need to
  // find the region, so they run cheap; later steps sharpen as the bracket
  // narrows and the decision gets finer than the sampling error.
  const loBound = PV_MIN / heaviest, hiBound = PV_MAX / heaviest;
  let lo = loBound, hi = hiBound;
  let clamped = false;
  let solvedScale: number;
  if (winrateAt(lo, searchGames) <= target) {
    solvedScale = lo; clamped = true;        // even flimsy bodies beat the target
  } else if (winrateAt(hi, searchGames) >= target) {
    solvedScale = hi; clamped = true;        // even the toughest aren't enough
  } else {
    for (let i = 0; i < steps; i++) {
      const mid = Math.sqrt(lo * hi);     // geometric: PV scales multiplicatively
      const games = Math.round(searchGames * (1 + (2 * i) / Math.max(1, steps - 1)));
      if (winrateAt(mid, games) > target) lo = mid; else hi = mid;
    }
    // Prefer the fit. It must NOT be clamped to the final bracket — that
    // bracket's position is the very thing that is noisy, so the corrections
    // worth making are the ones that land outside it. Bound it instead by the
    // search's own bracket and by a sanity factor around the bisection answer,
    // so a bad fit can be wrong but never absurd.
    const bisected = Math.sqrt(lo * hi);
    const fitted = fitCrossing();
    solvedScale = fitted !== null
      ? Math.min(hiBound, Math.max(loBound, Math.min(bisected * 1.6, Math.max(bisected / 1.6, fitted))))
      : bisected;

    // The bisection converges in CONTINUOUS scale, but what gets fielded is
    // integer PV per body, and down at small bodies that rounding is worth
    // several winrate points — one PV on a 3 PV basilisk moves the fight ~5pp,
    // so the continuous crossing point can round to a config well off target.
    // There, try the neighbouring integers and keep the one that lands closest.
    //
    // ONLY there. Above ~a dozen PV the neighbours differ by far less than the
    // sampling error, so an argmin over them picks whichever config got a lucky
    // sample rather than the better one — winner's curse in the selection,
    // measured at ~10pp of added error on a 44 PV golem. Those solves keep the
    // bisection's answer, which is already finer than we can measure.
    //
    // The selection is noisy by nature, so it only CHOOSES; the winrate
    // reported below is still measured independently, on another seed.
    const anchor = solvedScale * heaviest;
    if (anchor <= REFINE_BELOW_PV) {
      const candidates = [...new Set(
        [Math.floor(anchor) - 1, Math.floor(anchor), Math.ceil(anchor), Math.ceil(anchor) + 1]
          .filter(pv => pv >= PV_MIN && pv <= PV_MAX)
          .map(pv => pv / heaviest),
      )];
      let best = solvedScale, bestGap = Infinity;
      for (const candidate of candidates) {
        // Fights this small are cheap to play, so buy precision here.
        const gap = Math.abs(winrateAt(candidate, searchGames * 4) - target);
        if (gap < bestGap) { bestGap = gap; best = candidate; }
      }
      solvedScale = best;
    }
  }

  // --- the duration constraint ----------------------------------------------
  // A fight gets longer the more PV the bodies have, monotonically, so the
  // budget defines a CEILING on scale. Find the largest scale that still fits
  // and take the lower of the two answers.
  //
  // Evaluated on the search seed, like every other search decision, so the
  // common-random-numbers property holds here too: the length curve being
  // bisected is deterministic rather than noisy.
  let durationCapped = false;
  if (Number.isFinite(maxAvgRounds)) {
    const roundsAt = (scale: number, games: number): number =>
      simulateEncounter(groupsAt(scale), party, { ...opts, games, seed, aiDepth: SEARCH_DEPTH }).avgRounds;

    if (roundsAt(solvedScale, searchGames) > maxAvgRounds) {
      durationCapped = true;
      if (roundsAt(loBound, searchGames) > maxAvgRounds) {
        // Even the flimsiest bodies outlast the budget — nothing to search.
        solvedScale = loBound;
      } else {
        let short = loBound, long = solvedScale;
        for (let i = 0; i < steps; i++) {
          const mid = Math.sqrt(short * long);
          if (roundsAt(mid, searchGames) <= maxAvgRounds) short = mid; else long = mid;
        }
        solvedScale = short;                 // the hardest fight inside the budget
      }
    }
  }

  // --- verify at the real depth --------------------------------------------
  // Everything above ran at SEARCH_DEPTH. The winrate curve at BALANCER_DEPTH
  // sits elsewhere, so re-cross it with a short local bisection rather than a
  // fresh search: a handful of expensive evaluations instead of thirty. The
  // duration cap is a hard ceiling and is never refined upward through.
  if (BALANCER_DEPTH !== SEARCH_DEPTH && !clamped) {
    const ceiling = durationCapped ? solvedScale : hiBound;
    let lo2 = Math.max(loBound, solvedScale / VERIFY_BRACKET);
    let hi2 = Math.min(ceiling, solvedScale * VERIFY_BRACKET);
    if (hi2 > lo2) {
      for (let i = 0; i < VERIFY_STEPS; i++) {
        const mid = Math.sqrt(lo2 * hi2);
        if (winrateAt(mid, searchGames, BALANCER_DEPTH) > target) lo2 = mid; else hi2 = mid;
      }
      solvedScale = Math.min(ceiling, Math.sqrt(lo2 * hi2));
    }
  }

  // The duration budget was bisected at SEARCH_DEPTH, but fights run to a
  // different length at BALANCER_DEPTH — so an answer can pass the ≤6 check and
  // then REPORT 6.9 rounds. Re-check the final answer at the real depth and
  // walk it down if it overran; cheap, because it starts from an answer that is
  // already nearly right.
  if (BALANCER_DEPTH !== SEARCH_DEPTH && Number.isFinite(maxAvgRounds)) {
    const realRounds = (scale: number): number =>
      simulateEncounter(groupsAt(scale), party, {
        ...opts, games: searchGames, seed, aiDepth: BALANCER_DEPTH,
      }).avgRounds;
    if (realRounds(solvedScale) > maxAvgRounds) {
      durationCapped = true;
      let short = loBound, long = solvedScale;
      for (let i = 0; i < VERIFY_STEPS; i++) {
        const mid = Math.sqrt(short * long);
        if (realRounds(mid) <= maxAvgRounds) short = mid; else long = mid;
      }
      solvedScale = short;
    }
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
  // Measured harder than a plain evaluation: this one number is what the GM
  // reads and trusts, and at 320 games its ±3pp was large enough to make a
  // correctly-placed encounter look mis-solved. It costs ~25% of a solve.
  const groups = groupsAt(solvedScale);
  const final = simulateEncounter(groups, party, {
    ...opts, games: opts.games ?? VERIFY_GAMES, seed: seed + 977, aiDepth: BALANCER_DEPTH,
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
    solvedScale: Math.round(solvedScale * 100) / 100,
    clamped,
    durationCapped,
    maxAvgRounds,
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
