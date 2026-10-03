/**
 * RUNNING A CELL — the shared machinery for measuring one side of a fight.
 *
 * A CELL is one measurable position: a solved fight shape, a company row, and
 * the neutral baseline that was measured there (`positions.ts`). Everything
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
  Character, CombatEngine, CombatStats, availableActionIndices, mergeCombatStats, newCombatStats, setAIControlled, withSeed,
} from '@pimpampum/engine';
import { aiPolicy, lookaheadChooser } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { theSet, type Cell, type FieldedGroup, type PartySpec } from './gameset.js';
import { countedCached, key } from './cache.js';
import { SMOKE } from './games.js';
import { deltaStderr, stderr } from './report.js';

/** Base seed for every cell. Fixed so two runs of anything here are comparable. */
export const CELL_SEED = 515_000;

/**
 * How hard both sides think in a cell.
 *
 * Depth 1 is what the balancer prices encounters at, so a report card and a
 * difficulty number mean the same thing.
 */
export const CELL_AI = { depth: 1, samples: 4, passes: 1, topK: 0 } as const;

/**
 * WHO GETS HIT — the production AI's target chooser.
 *
 * Cells used to pass an `actionChooser` only, so the subject fell through to
 * the engine's deliberately-not-a-policy default (the first eligible
 * targets), while the neutral baseline it was subtracted from was measured
 * with the real AI's targeting — and every kit's headline delta carried the
 * difference as a constant bias.
 */
const CELL_TARGETS = aiPolicy(CELL_AI).targetChooser;

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
  /**
   * Fights still unresolved at the round cap — the ones that never end. NOT
   * the draw rate: a mutual wipe (both sides fall in one simultaneous tier) is
   * a draw that ENDED, and counting those as stalls failed four kits on a
   * requirement about stalemates with no stalemate in sight (NEXT-STEPS §26).
   */
  stallRate: number;
  rounds: number[];
}

/**
 * Play one cell `games` times.
 *
 * COMMON RANDOM NUMBERS: the seed depends on the CELL, never on the subject,
 * so a kit and the neutral baseline meet the same dice and differ by their
 * cards. The correlation is partial, since the streams desynchronise the
 * moment a different card is chosen; error bars are still quoted the
 * conservative, independent way.
 *
 * `seedOffset` buys FRESH numbers: the baselines are measured on their own
 * offset so a cell is never subtracted from its own sample.
 */
/** Everything one cell's result depends on, besides the content the caller
 *  names. */
export function cellKey(subjectPrint: string, cell: Cell, games: number, seedOffset: number): string {
  // 'policy' is a fossil of the removed impoverished arms, kept so the keys —
  // and every cell already cached under them — stay valid.
  return key('cell', subjectPrint, `${cell.label}@${cell.baseline.toFixed(4)}`, cell.context,
    String(games), 'policy', String(seedOffset));
}

/** What a cached cell holds: its outcome plus the instrumentation the report
 *  cards read, since re-running to recover those would defeat the cache. */
export interface CachedCell {
  winrate: number;
  drawRate: number;
  stallRate: number;
  rounds: number[];
  stats: CombatStats;
  counters: CardCounters;
}

/** Play one cell and cache it, or read it back. */
export function cellResult(
  setup: () => CellSetup,
  cell: Cell,
  games: number,
  seedOffset: number,
  cacheKey?: string,
): CachedCell {
  const compute = (): CachedCell => {
    const stats = newCombatStats();
    const counters = newCardCounters();
    const r = runOneCell(setup(), cell, games, stats, counters, seedOffset);
    return { winrate: r.winrate, drawRate: r.drawRate, stallRate: r.stallRate, rounds: r.rounds, stats, counters };
  };
  return cacheKey ? countedCached<CachedCell>('cell', cacheKey, compute) : compute();
}

/** The round cap every cell fight is played to; a fight still going at it is a stall. */
export const CELL_MAX_ROUNDS = 40;

function runOneCell(
  setup: CellSetup,
  cell: Cell,
  games: number,
  stats: CombatStats,
  counters: CardCounters,
  seedOffset = 0,
): CellRun {
  const actionChooser = instrument(lookaheadChooser(CELL_AI), setup.subjectTeam, counters);
  let wins = 0, draws = 0, stalls = 0;
  const rounds: number[] = [];
  withSeed(CELL_SEED + seedOffset + cell.shapeIdx * 101 + cell.companyIdx * 17, () => {
    for (let i = 0; i < games; i++) {
      const players = theSet().buildParty(setup.party);
      setAIControlled(players);
      const res = new CombatEngine(players, theSet().buildEncounter(setup.enemies), {
        registry: theRegistry(), maxRounds: CELL_MAX_ROUNDS, actionChooser, targetChooser: CELL_TARGETS,
      }).runCombat(stats);
      rounds.push(res.rounds);
      if (res.winner === setup.subjectTeam) wins++;
      else if (res.winner === null) {
        draws++; wins += 0.5;
        if (res.rounds >= CELL_MAX_ROUNDS) stalls++;
      }
    }
  });
  return { winrate: wins / games, drawRate: draws / games, stallRate: stalls / games, rounds };
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
  /** Fights that hit the round cap unresolved — see `CellRun.stallRate`. */
  stallRate: number;
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
/** Ten per cell is the floor for a MEASUREMENT — below it a cell says nothing.
 *  The smoke run is not a measurement, so it is allowed one. */
function perCellGames(games: number, cells: number): number {
  return Math.max(SMOKE ? 1 : 10, Math.round(games / cells));
}

/**
 * ONE CELL of `runMatrix` — its own entry point so a warm worker can fill the
 * very cache entry the matrix will read (bench/parallel.ts). Same arguments as
 * `runMatrix` plus the cell's index: the per-cell sample is derived from the
 * whole cell list, and deriving it anywhere else would key an entry nothing reads.
 */
export function matrixCell(
  cells: Cell[],
  cellIdx: number,
  setupFor: (cell: Cell) => CellSetup,
  games: number,
  subjectPrint?: string,
): CachedCell {
  const cell = cells[cellIdx];
  const perCell = perCellGames(games, cells.length);
  return cellResult(
    () => setupFor(cell), cell, perCell, 0,
    subjectPrint ? cellKey(subjectPrint, cell, perCell, 0) : undefined,
  );
}

/** The MATRIX is not cached — its CELLS are (`matrixCell`). A matrix is just
 *  their sum, and caching at the cell is what lets a run fan out across the
 *  width of the matrix. */
export function runMatrix(
  cells: Cell[],
  setupFor: (cell: Cell) => CellSetup,
  games: number,
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
  const perCell = perCellGames(games, cells.length);

  const byCell: { label: string; delta: number }[] = [];
  const allRounds: number[] = [];
  let winSum = 0, drawSum = 0, stallSum = 0, deltaSum = 0, baselineVar = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const r = matrixCell(cells, i, setupFor, games, subjectPrint);
    mergeCombatStats(stats, r.stats);
    for (const k of Object.keys(r.counters.legal)) counters.legal[k] = (counters.legal[k] ?? 0) + r.counters.legal[k];
    for (const k of Object.keys(r.counters.played)) counters.played[k] = (counters.played[k] ?? 0) + r.counters.played[k];
    for (const k of Object.keys(r.counters.legalByType)) counters.legalByType[k] = (counters.legalByType[k] ?? 0) + r.counters.legalByType[k];
    for (const k of Object.keys(r.counters.playedByType)) counters.playedByType[k] = (counters.playedByType[k] ?? 0) + r.counters.playedByType[k];
    counters.decisions += r.counters.decisions;
    winSum += r.winrate;
    drawSum += r.drawRate;
    stallSum += r.stallRate;
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
    stallRate: stallSum / cells.length,
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
 * feed requirement 1 (fights end) directly, which is otherwise judged on numbers no test
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


