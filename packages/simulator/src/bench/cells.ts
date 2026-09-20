/**
 * RUNNING A CELL — the shared machinery for measuring one side of a fight.
 *
 * A CELL is one measurable position: a solved fight shape, a company row, and
 * the neutral baseline that was measured there (`bench/shapes.ts`). Everything
 * this package reports about a kit is a delta from that baseline, so this is
 * where the subtraction happens.
 *
 * It lives here rather than inside `kit-analyzer.ts` for one specific reason:
 * "how often was this card played out of the turns it was LEGAL" had three
 * independent implementations — the analyzer's, the AI benchmark's and the
 * action-mix harness's — which is three numbers that can disagree about one
 * measurement. `instrument()` below is now the only one.
 */
import {
  ActionType, Character, CombatEngine, CombatStats,
  availableActionIndices, lookaheadChooser, mergeCombatStats, newCombatStats, random,
  setAIControlled, withSeed,
} from '@pimpampum/engine';
import { buildReferenceParty, type PartySpec } from '@pimpampum/skills';
import { buildComposition, type FieldedGroup } from '@pimpampum/enemies';
import { REGISTRY } from './arena.js';
import { deltaStderr, stderr } from './report.js';
import { type Cell } from './shapes.js';
import { SMOKE } from './games.js';
import { countedCached, key } from './cache.js';

/** Base seed for every cell. Fixed so two runs of anything here are comparable. */
export const CELL_SEED = 515_000;

/**
 * How hard both sides think in a cell.
 *
 * Depth 1 is what the balancer prices encounters at, so a report card and a
 * difficulty number mean the same thing. The mindless policies below fall back
 * to it whenever their own rule has nothing legal to offer — they are a smaller
 * STRATEGY SPACE, not a weaker brain, which is the only fair form of the
 * question "does thinking matter".
 */
export const CELL_AI = { depth: 1, samples: 2, passes: 1, topK: 3 } as const;

// --- Instrumentation --------------------------------------------------------

/**
 * Per-card counters for the subject side: how often each card was LEGAL, and
 * how often it was then chosen — plus the same split by action type, because
 * "what share of decisions went to defending" is the other question that used
 * to have its own private counter in a second file.
 */
export interface CardCounters {
  legal: Record<string, number>;
  played: Record<string, number>;
  legalByType: Record<string, number>;
  playedByType: Record<string, number>;
  /** Decisions the subject side actually made (a turn where it picked a card). */
  decisions: number;
}

export function newCardCounters(): CardCounters {
  return { legal: {}, played: {}, legalByType: {}, playedByType: {}, decisions: 0 };
}

/**
 * Wrap a chooser so every decision the subject side makes records which cards
 * were on offer.
 *
 * Play rate conditioned on legality is otherwise unmeasurable:
 * `CombatStats.actionPlays` counts turns, and a card that is legal one turn in
 * ten looks dead when it is merely rare.
 */
export function instrument(
  base: (e: CombatEngine, a: Character) => number | null,
  team: number,
  counters: CardCounters,
) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return base(engine, actor);
    for (const i of availableActionIndices(actor, engine.registry)) {
      const def = actor.actions[i].def;
      counters.legal[def.id] = (counters.legal[def.id] ?? 0) + 1;
      const t = String(def.actionType);
      counters.legalByType[t] = (counters.legalByType[t] ?? 0) + 1;
    }
    const pick = base(engine, actor);
    if (pick !== null && actor.actions[pick]) {
      const def = actor.actions[pick].def;
      counters.played[def.id] = (counters.played[def.id] ?? 0) + 1;
      const t = String(def.actionType);
      counters.playedByType[t] = (counters.playedByType[t] ?? 0) + 1;
      counters.decisions++;
    }
    return pick;
  };
}

// --- The impoverished policies ----------------------------------------------

/** Uniformly random over legal cards — the "no decisions at all" floor. A kit
 *  whose thought-out play barely beats this is not asking the player anything.
 *
 *  Draws from the engine's SEEDED `random()`. Using `Math.random()` here — as
 *  this once did — makes the arm that DEFINES the bar irreproducible and leaves
 *  it sharing no random numbers with the arm it is subtracted from, inside a
 *  `withSeed` block that makes it look deterministic. */
export function uniformChooser(team: number, fallback: (e: CombatEngine, a: Character) => number | null) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return fallback(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    return legal.length ? legal[Math.floor(random() * legal.length)] : null;
  };
}

/**
 * "Always this one card, whenever it is legal" — the one-trick strategy.
 *
 * SCOPE: effectively ONE SEAT, not the whole side. It is written against the
 * team, but a companion does not own the subject's card, so `legal.find` misses
 * and the companion falls back to playing properly. That asymmetry is the
 * point — it asks whether this KIT is better used as a one-trick role — but it
 * makes the result incomparable with `uniform` and the `onlyX` restrictions,
 * which impoverish all four seats. Three quarters of the party still playing
 * well means the winrate barely moves, so this family can never lose much, and
 * scoring it against the whole-side bar caps the margin near zero by
 * construction. `kit-analyzer.ts` therefore keeps the two families apart.
 */
export function oneCardChooser(team: number, cardId: string, fallback: (e: CombatEngine, a: Character) => number | null) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return fallback(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    const pick = legal.find(i => actor.actions[i].def.id === cardId);
    return pick ?? (legal.length ? fallback(engine, actor) : null);
  };
}

/**
 * "Always the biggest attack", with NO lookahead at all — the thinking-free
 * floor, and the one §7.1 actually asks for.
 *
 * It is a different question from `onlyAttacks`, and conflating them cost this
 * requirement its meaning. `onlyAttacks` still THINKS, a round ahead, inside a
 * smaller strategy space; this does not think at all. One asks "does the
 * strategy triangle matter", the other asks "does thinking matter", and only
 * the second is what "thinking must beat not thinking" means.
 */
function spamChooser(team: number, fallback: (e: CombatEngine, a: Character) => number | null) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return fallback(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    const attacks = legal.filter(i => actor.actions[i].def.actionType === ActionType.Atac
      && !actor.actions[i].def.lastResort);
    if (!attacks.length) return legal.length ? legal[0] : null;
    let best = attacks[0], bestAvg = -1;
    for (const i of attacks) {
      const def = actor.actions[i].def;
      const avg = (def.dice?.average() ?? 0) + (def.rollBonus ?? 0);
      if (avg > bestAvg) { bestAvg = avg; best = i; }
    }
    return best;
  };
}

/**
 * How the SUBJECT SIDE plays a cell.
 *
 *  - `policy`   — the real thing: the one AI, thinking a round ahead.
 *  - `uniform`  — nobody thinks at all: random legal cards, whole side.
 *  - `onlyX`    — the whole side restricted to one action type, still thinking
 *                 as hard as ever inside it (the lookahead's `restrictTo`).
 *                 `onlyDefenses` is the TURTLE, and it is the strategy
 *                 triangle's own test: Power is supposed to beat Protect, so a
 *                 side that never advances the win condition should lose.
 *  - `oneCard`  — ONE SEAT repeats a single card while the rest play on. A
 *                 weaker claim than the others, and NOT COMPARABLE with them:
 *                 it handicaps one seat of four rather than the whole side, so
 *                 it asks whether the kit is better used as a one-trick role,
 *                 not whether thinking matters. See `oneCardChooser`.
 */
export type CellPolicy =
  | 'policy' | 'uniform' | 'spam'
  | 'onlyAttacks' | 'onlyDefenses' | 'onlyFocus'
  | { oneCard: string };

/**
 * THREE FAMILIES, THREE QUESTIONS. They are not comparable and must never be
 * maxed together — doing so is what cost requirement 3 its meaning.
 *
 *  - THOUGHTLESS: no lookahead at all. "Does thinking matter?" Measured
 *    2026-09-20: the full policy beats these by +30-40pp (uniform) and
 *    +2.6-12.6pp (spam). Thinking matters enormously; attack-spam is a strong
 *    strategy.
 *  - RESTRICTED: still thinking a round ahead, inside a smaller strategy space.
 *    "Does the Atac/Defensa/Focus triangle matter?" The answer is currently
 *    NO: `onlyAttacks` ties free play within ~2.7pp on every kit.
 *  - one-card: one SEAT repeats a card while the rest play on (see
 *    kit-analyzer's 3c). A quarter of a side, so a quarter of the effect.
 */
export const THOUGHTLESS_POLICIES: CellPolicy[] = ['uniform', 'spam'];
export const RESTRICTED_POLICIES: CellPolicy[] = ['onlyAttacks', 'onlyDefenses', 'onlyFocus'];
/** @deprecated kept for callers that predate the split. */
export const SIDE_POLICIES: CellPolicy[] = [...THOUGHTLESS_POLICIES, ...RESTRICTED_POLICIES];

/** Build the subject side's chooser for a policy. */
export function chooserFor(policy: CellPolicy, subjectTeam: number) {
  const real = lookaheadChooser(CELL_AI);
  const restricted = (types: ActionType[]) => {
    const mine = lookaheadChooser({ ...CELL_AI, restrictTo: types }, [subjectTeam]);
    return (e: CombatEngine, a: Character) =>
      (a.team === subjectTeam ? mine(e, a) ?? real(e, a) : real(e, a));
  };
  return policy === 'policy' ? real
    : policy === 'uniform' ? uniformChooser(subjectTeam, real)
    : policy === 'spam' ? spamChooser(subjectTeam, real)
    : policy === 'onlyAttacks' ? restricted([ActionType.Atac])
    : policy === 'onlyDefenses' ? restricted([ActionType.Defensa])
    : policy === 'onlyFocus' ? restricted([ActionType.Focus])
    : oneCardChooser(subjectTeam, policy.oneCard, real);
}

// --- Running --------------------------------------------------------------

/** What a side is, for the purposes of running it: a party, an opposition, and
 *  which team index the subject sits on. */
export interface CellSetup {
  party: PartySpec;
  enemies: FieldedGroup[];
  subjectTeam: number;
}

export interface CellRun {
  /** Raw winrate of the subject side in this cell (draws count as half). */
  winrate: number;
  drawRate: number;
  rounds: number[];
}

/**
 * Play one cell `games` times.
 *
 * COMMON RANDOM NUMBERS: the seed depends on the CELL, never on the level or
 * the policy, so two levels — or a policy and its impoverished baseline — meet
 * the same dice and differ by their cards. The correlation is partial, since
 * the streams desynchronise the moment a different card is chosen, so it
 * tightens a comparison without making it exact; error bars are still quoted
 * the conservative, independent way.
 *
 * `seedOffset` buys FRESH numbers on purpose: re-measuring a candidate that was
 * SELECTED on a sample must not re-use that sample, or the selection's luck
 * gets reported as the candidate's merit.
 */
/** Everything one cell's result depends on, besides the content the caller
 *  names. */
export function cellKey(
  subjectPrint: string, cell: Cell, games: number, policy: CellPolicy, seedOffset: number,
): string {
  const policyPrint = typeof policy === 'string' ? policy : `one:${policy.oneCard}`;
  return key('cell', subjectPrint, `${cell.label}@${cell.baseline.toFixed(4)}`,
    String(games), policyPrint, String(seedOffset));
}

/** What a cached cell holds: its outcome plus the instrumentation the report
 *  cards read, since re-running to recover those would defeat the cache. */
export interface CachedCell {
  winrate: number;
  drawRate: number;
  rounds: number[];
  stats: CombatStats;
  counters: CardCounters;
}

/** Play one cell and cache it, or read it back. */
export function cellResult(
  setup: () => CellSetup,
  cell: Cell,
  games: number,
  policy: CellPolicy,
  seedOffset: number,
  cacheKey?: string,
): CachedCell {
  const compute = (): CachedCell => {
    const stats = newCombatStats();
    const counters = newCardCounters();
    const r = runOneCell(setup(), cell, games, policy, stats, counters, seedOffset);
    return { winrate: r.winrate, drawRate: r.drawRate, rounds: r.rounds, stats, counters };
  };
  return cacheKey ? countedCached<CachedCell>('cell', cacheKey, compute) : compute();
}

export function runOneCell(
  setup: CellSetup,
  cell: Cell,
  games: number,
  policy: CellPolicy,
  stats: CombatStats,
  counters: CardCounters,
  seedOffset = 0,
): CellRun {
  const actionChooser = instrument(chooserFor(policy, setup.subjectTeam), setup.subjectTeam, counters);
  let wins = 0, draws = 0;
  const rounds: number[] = [];
  withSeed(CELL_SEED + seedOffset + cell.shapeIdx * 101 + cell.companyIdx * 17, () => {
    for (let i = 0; i < games; i++) {
      const players = buildReferenceParty(setup.party);
      setAIControlled(players);
      const res = new CombatEngine(players, buildComposition(setup.enemies), {
        registry: REGISTRY, maxRounds: 40, actionChooser,
      }).runCombat(stats);
      rounds.push(res.rounds);
      if (res.winner === setup.subjectTeam) wins++;
      else if (res.winner === null) { draws++; wins += 0.5; }
    }
  });
  return { winrate: wins / games, drawRate: draws / games, rounds };
}

export interface MatrixResult {
  /** Mean DELTA from the neutral baseline, in winrate. This is the headline:
   *  "how much better than a neutral kit, in the same seats". */
  delta: number;
  /** 1σ on `delta`, including the baseline's own sampling error. */
  deltaStderr: number;
  /** Mean raw winrate, for readers who want the absolute number. */
  winrate: number;
  stderr: number;
  /** Combats behind `winrate` (the baselines carry their own, larger, n). */
  games: number;
  drawRate: number;
  medianRounds: number;
  p90Rounds: number;
  /** Delta per cell — the SPREAD is evidence in its own right: a kit should
   *  have matchups it loses. */
  byCell: { label: string; delta: number }[];
  stats: CombatStats;
  counters: CardCounters;
}

/**
 * Run a subject across the whole usable matrix and report its delta from the
 * neutral baseline.
 *
 * `setupFor` builds the party and opposition for one cell — the caller owns
 * that, because a player subject and an enemy subject differ only there.
 */
/**
 * Cache key for a whole matrix run.
 *
 * It has to name everything the numbers depend on: the cells (which carry the
 * baselines and the solved shapes behind them), the SUBJECT's own cards, the
 * cards of everyone sitting beside it, the policy, the sample and the seed.
 * The caller owns the subject/company half, since only it knows what it built.
 */
export function matrixKey(
  subjectPrint: string,
  cells: Cell[],
  games: number,
  policy: CellPolicy,
  seedOffset: number,
): string {
  const cellPrint = cells.map(c => `${c.label}@${c.baseline.toFixed(4)}`).join(',');
  const policyPrint = typeof policy === 'string' ? policy : `one:${policy.oneCard}`;
  return key('matrix', subjectPrint, cellPrint, String(games), policyPrint, String(seedOffset));
}

export function runMatrix(
  cells: Cell[],
  setupFor: (cell: Cell) => CellSetup,
  games: number,
  policy: CellPolicy = 'policy',
  seedOffset = 0,
  cacheKey?: string,
): MatrixResult {
  // The MATRIX is not cached — its CELLS are (`cellResult`). A matrix is just
  // their sum, and caching at the cell is what lets a run fan out across the
  // width of the matrix instead of one process per level.
  return runMatrixUncached(cells, setupFor, games, policy, seedOffset, cacheKey);
}

function runMatrixUncached(
  cells: Cell[],
  setupFor: (cell: Cell) => CellSetup,
  games: number,
  policy: CellPolicy = 'policy',
  seedOffset = 0,
  subjectPrint?: string,
): MatrixResult {
  if (cells.length === 0) {
    throw new Error(
      'cap cel·la utilitzable: totes les formes tenen la línia de base saturada.\n'
      + 'Sense cel·les no hi ha res a mesurar, i les mitjanes donarien 0% a tot arreu.\n'
      + 'Torna a triar els nombres de cossos amb probe-shapes.ts.',
    );
  }
  const stats = newCombatStats();
  const counters = newCardCounters();
  // Ten per cell is the floor for a MEASUREMENT — below it a cell says nothing.
  // The smoke run is not a measurement, so it is allowed one.
  const perCell = Math.max(SMOKE ? 1 : 10, Math.round(games / cells.length));

  const byCell: { label: string; delta: number }[] = [];
  const allRounds: number[] = [];
  let winSum = 0, drawSum = 0, deltaSum = 0, baselineVar = 0;
  for (const cell of cells) {
    const r = cellResult(
      () => setupFor(cell), cell, perCell, policy, seedOffset,
      subjectPrint ? cellKey(subjectPrint, cell, perCell, policy, seedOffset) : undefined,
    );
    mergeCombatStats(stats, r.stats);
    for (const k of Object.keys(r.counters.legal)) counters.legal[k] = (counters.legal[k] ?? 0) + r.counters.legal[k];
    for (const k of Object.keys(r.counters.played)) counters.played[k] = (counters.played[k] ?? 0) + r.counters.played[k];
    for (const k of Object.keys(r.counters.legalByType)) counters.legalByType[k] = (counters.legalByType[k] ?? 0) + r.counters.legalByType[k];
    for (const k of Object.keys(r.counters.playedByType)) counters.playedByType[k] = (counters.playedByType[k] ?? 0) + r.counters.playedByType[k];
    counters.decisions += r.counters.decisions;
    winSum += r.winrate;
    drawSum += r.drawRate;
    deltaSum += r.winrate - cell.baseline;
    baselineVar += stderr(cell.baseline, cell.baselineGames) ** 2;
    allRounds.push(...r.rounds);
    byCell.push({ label: cell.label, delta: r.winrate - cell.baseline });
  }
  const pct = roundPercentiles(allRounds);

  const winrate = winSum / cells.length;
  const n = perCell * cells.length;
  return {
    delta: deltaSum / cells.length,
    // The subject's own sampling error, plus the baselines'. The baselines are
    // measured once and reused, so this term is the same for every kit — it
    // shifts all of them together rather than adding noise between them, but it
    // is real error on the absolute claim and is quoted.
    deltaStderr: Math.sqrt(stderr(winrate, n) ** 2 + baselineVar / cells.length ** 2),
    winrate,
    stderr: stderr(winrate, n),
    games: n,
    drawRate: drawSum / cells.length,
    medianRounds: pct.median,
    p90Rounds: pct.p90,
    byCell,
    stats,
    counters,
  };
}

/**
 * Fight-length percentiles, extracted so they can be CONTROLLED.
 *
 * An off-by-one in a percentile is the quietest bug there is: it moves a
 * reported number by one fight's worth and nothing ever looks wrong. These
 * feed requirement 2 directly, which is otherwise judged on numbers no test
 * has ever checked against a hand-computed answer.
 *
 * NOTE `p90` uses the nearest-rank convention, so on ten sorted fights it is
 * the tenth — the longest — not an interpolated ninth-and-a-bit. That is the
 * conservative reading for a "fights do not drag" check and it is asserted
 * rather than left to be rediscovered.
 */
export function roundPercentiles(rounds: number[]): { median: number; p90: number } {
  if (rounds.length === 0) return { median: 0, p90: 0 };
  const sorted = [...rounds].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
  };
}

/** 1σ on the difference of two matrix results, treating them as INDEPENDENT.
 *  Conservative under common random numbers; see `pairedMatrixDelta`. */
export function matrixDeltaStderr(a: MatrixResult, b: MatrixResult): number {
  return deltaStderr(a.winrate, a.games, b.winrate, b.games);
}

