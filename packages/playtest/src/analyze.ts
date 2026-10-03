/**
 * THE KIT ANALYZER — the regression harness you run after every kit edit. Fix
 * the kit, throw a seeded sample at it, get back a pass/fail report card.
 *
 * One code path, two modes; they differ only in which side is the SUBJECT and
 * how its opposition is built (`setupFor` below):
 *
 *  - `player`: the subject skill sits in seat 1 of a party, against a solved
 *    fight shape. Subject winrate = the party's.
 *  - `enemy`: the subject creature, at a PV solved once at full kit, faces
 *    the calibration party. Subject winrate = the creature's.
 *
 * EVERYTHING IS REPORTED AS A DELTA FROM THE NEUTRAL BASELINE measured in the
 * same cell (`@pimpampum/bench`, `positions.ts`). Two problems disappear when you subtract it:
 * a shape drifting as content is added no longer moves any kit's score, and the
 * SEATING — worth up to 66pp between company rows — cancels instead of burying
 * the kit under the seat it happened to sit in.
 *
 * TWO MEASUREMENTS, THREE KIT REQUIREMENTS (`rules.ts` has the four; the
 * triangle is set-level, `triangle.ts`):
 *
 *  - The FULL-KIT RUN — the thinking policy at full level over every usable
 *    cell. Requirement 1 (fights end) and 2 (the power band) read it.
 *  - The CARD VALUE — per decision, the fight played out once per legal card
 *    from a position every branch shares (`bench/regret.ts`, §18), under
 *    several opponent models. Requirement 3 reads it: what a RANDOM pick
 *    costs against the best one, and whether any card is NEVER the right play
 *    (`isNeverRight`: even where it looks best, the runner-up is better).
 *
 * The cells only have to be UNSATURATED: every verdict is a delta, so a cell's
 * own difficulty cancels (NEXT-STEPS §12.4).
 *
 * The CLI that prints a report card from this is `tools/src/kit-analyzer.ts`.
 */
import type { ActionDefinition } from '@pimpampum/engine';
import {
  calibrationGames, calibrationParty, type CardScore, type Cell, cellResult,
  type CellSetup, companyCount, companyPrint, DEFAULT_REGRET, enemyPrint, type FieldedGroup, groupsPrint,
  isSaturated, type KitInfo, kitChoiceCost, type KitValues, type MatrixResult, matrixCell, measureKit, measureKitCell,
  type PartySpec, pct, runMatrix, scoreCards, shapeEnemies, skillPrint, SMOKE,
  subjectParty, theSet, usableCells,
} from '@pimpampum/bench';
import {
  choiceMattersVerdict, durationVerdict, isNeverRight, KIT_BAND,
  MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, MIN_CHOICE_COST, strengthVerdict,
} from './rules.js';

export interface Subject {
  mode: 'player' | 'enemy';
  id: string;
  /** enemy mode only: how many bodies stand on the table. */
  count?: number;
  /** enemy mode only: override the solved PV. */
  pv?: number;
}

/** The subject at `level` in seat 1, with the given company at full kit. */
function partyWith(skillId: string, level: number, companyIdx: number, allSeats = false): PartySpec {
  if (allSeats) {
    // EVERY SEAT the subject kit. Fight length is a property of the whole
    // SIDE, not of one seat, so a control kit occupying one of four cannot
    // move it (NEXT-STEPS §19.6). This is the seam those controls need, and
    // nothing else uses it — a real sweep always fields the calibration
    // company, which is what makes kits comparable to each other.
    return { characters: [0, 1, 2, 3].map(i => theSet().hero(`Subjecte ${i + 1}`, skillId, level)) };
  }
  return subjectParty(skillId, level, companyIdx);
}

/** The subject's kit, or a loud failure naming it. */
function kitOf(subject: Subject): KitInfo {
  const kit = theSet().kit(subject.id);
  if (!kit) throw new Error(`playtest: the set '${theSet().id}' has no kit '${subject.id}'.`);
  return kit;
}

// --- Enemy mode gets calibrated too -----------------------------------------
// Player cells are solved to `FAIR` and then measured; enemy cells used to be
// whatever `--count`/`--pv` happened to say, which made the two modes' numbers
// incomparable and let a run sit at 5% or 95% without anyone noticing.
//
// So the creature's PV is SOLVED once, at full kit, against the calibration
// party. Its baseline in a cell is the complement of the party's measured
// winrate there, i.e. what this creature scores when it knows all its cards.
const ENEMY_CALIBRATION_GAMES = 500;
const ENEMY_CALIBRATION_SEED = 717_000;
/** A creature's PV is solved with the same search budget a shape gets. */
const ENEMY_SEARCH_GAMES = 120;

interface EnemyShape { groups: FieldedGroup[]; cells: Cell[]; capped: boolean; pv: number }
const enemyShapeCache = new Map<string, EnemyShape>();

function enemyShape(subject: Subject): EnemyShape {
  const set = theSet();
  const key = `${set.id}:${subject.id}:${subject.count}:${subject.pv ?? 'solved'}`;
  const hit = enemyShapeCache.get(key);
  if (hit) return hit;

  const count = subject.count!;
  const full = kitOf(subject).fullLevel;
  const solved = subject.pv === undefined
    ? set.solveEncounter([{ enemyId: subject.id, count, level: full }], calibrationParty(0),
      set.calibration.fair, { searchGames: ENEMY_SEARCH_GAMES })
    : null;
  const pv = subject.pv ?? solved?.groups[0].pv ?? 20;
  const groups: FieldedGroup[] = [{ enemyId: subject.id, count, level: full, pv }];

  const games = calibrationGames(ENEMY_CALIBRATION_GAMES);
  const cells: Cell[] = [];
  for (let companyIdx = 0; companyIdx < companyCount(); companyIdx++) {
    // The creature's score at full kit, measured by the same cell machinery
    // the analysis will be — see `positions.baselineFor` for why that matters.
    const probe: Cell = { shapeIdx: 0, companyIdx, label: 'baseline', baseline: 0, baselineGames: 0, context: '' };
    const baseline = cellResult(
      () => ({ party: calibrationParty(companyIdx), enemies: groups, subjectTeam: 1 }),
      probe, games, ENEMY_CALIBRATION_SEED,
    ).winrate;
    if (isSaturated(baseline)) continue;
    cells.push({
      shapeIdx: 0, companyIdx, baseline,
      baselineGames: games,
      label: `directe/c${companyIdx + 1}`,
      context: `${companyPrint(companyIdx)}|${groupsPrint(groups)}`,
    });
  }
  const entry: EnemyShape = {
    groups, cells, pv,
    capped: !!solved && (solved.clamped || solved.durationCapped),
  };
  enemyShapeCache.set(key, entry);
  return entry;
}

/** How a subject is fielded at a level: the party and opposition for one
 *  cell — the ONLY thing the two modes differ by. */
export function setupFor(subject: Subject, level: number, allSeats = false): (cell: Cell) => CellSetup {
  if (subject.mode === 'player') {
    return cell => ({
      party: partyWith(subject.id, level, cell.companyIdx, allSeats),
      enemies: shapeEnemies(cell.shapeIdx),
      subjectTeam: 0,
    });
  }
  const shape = enemyShape(subject);
  return cell => ({
    party: calibrationParty(cell.companyIdx),
    enemies: shape.groups.map(g => ({ ...g, level })),
    subjectTeam: 1,
  });
}

/** The cards a subject holds at full kit. Shared, so `card-value.ts` and the
 *  report card cannot disagree about what a kit even contains. */
export function cardsOf(subject: Subject): ActionDefinition[] {
  return kitOf(subject).actions;
}

/** The cells a subject is measured in. */
export function cellsFor(subject: Subject): Cell[] {
  return subject.mode === 'player' ? usableCells() : enemyShape(subject).cells;
}

export interface Verdict {
  ok: boolean;
  /** The verdict in words, for a person. Never parse it: read the fields below. */
  detail: string;
  /** The requirement could not be TESTED, as opposed to passed. A ✅ meaning
   *  "we could not check" is a lie the summary table tells at a glance. */
  inconclusive?: boolean;
  // --- THE SAME VERDICT AS DATA -------------------------------------------
  // Controls and assertions used to regex the Catalan `detail`, and one of
  // those slices cut inside a card's own text and passed for the wrong reason.
  // A verdict a machine reads must be data.
  /** Requirement 1: which bars failed. */
  reasons?: string[];
  /** Requirement 2: the full-kit delta against the neutral stand-in, and its 1σ. */
  band?: { delta: number; stderr: number };
  /** Requirement 3: what a random pick costs against the best one. */
  cost?: ChoiceCost;
  /** Requirement 3: ids never the right play under EVERY opponent model. */
  neverRight?: string[];
}

/** How a random pick fares against the best one, over a kit's decisions. */
export interface ChoiceCost { mean: number; stderr: number; decisions: number }

export interface KitReport {
  subject: Subject;
  cards: ActionDefinition[];
  /** The thinking policy at full kit — what requirements 1 and 2 read. */
  fullKit: MatrixResult;
  /** Per-card value, strongest first (`bench/regret.ts`). Empty when skipped. */
  cardValues: CardScore[];
  /** Requirement 3's other half; null when card value was skipped. */
  choiceCost: ChoiceCost | null;
  /** Requirement 1: fights end. */
  duration: Verdict;
  /** Requirement 2: inside the power band around the neutral stand-in. */
  strength: Verdict;
  /** Requirement 3: choosing matters, and no card is never the right play. */
  choices: Verdict;
}

export interface AnalyzeBudget {
  /** Field the subject kit in ALL FOUR seats. Control kits only — see
   *  `partyWith`. A real sweep must field the calibration company, or kits
   *  stop being comparable with each other. */
  allSeats?: boolean;
  /** Fights behind requirement 3 (split across the opponent models). */
  cardValueGames?: number;
  /**
   * Skip MEASURING the card value, rather than merely measuring it cheaply:
   * it plays out a fight per candidate card per DECISION and is most of the
   * bill, so a control asserting requirement 1 or 2 must not pay for it.
   * Requirement 3 then comes back INCONCLUSIVE, never ok.
   */
  skip?: 'cardValue'[];
  /**
   * Opponent models the card value is measured under — the continuation's
   * `aiSharpness` — and pooled across. The budget is split across the models,
   * not multiplied. See `DEFAULT_CARD_VALUE_MODELS`.
   */
  cardValueModels?: number[];
}

/**
 * Soft, default, and hard. Spread either side of the engine's `aiSharpness: 2`
 * because there is no defensible single value and the spread is the point:
 * 0.5 treats the enemy's face-down card as a broad distribution, 4 as nearly a
 * single line, and a set-up card's value moves 4–9× across that range
 * (NEXT-STEPS §20.11). Pooling them keeps the verdict off any one choice.
 * Three, not more, because each one costs a third of the sample.
 */
export const DEFAULT_CARD_VALUE_MODELS = [0.5, 2, 4];

/**
 * Card-value fights, from the analyzer's own budget so one `--games` scales
 * everything. Three quarters: every DECISION is an observation here, so it
 * needs fewer fights than the full-kit run.
 */
function cardValueGames(games: number): number {
  return Math.max(SMOKE ? 2 : 12, Math.round(games * 3 / 4));
}

/** The fights each opponent model gets — the card-value budget split, not multiplied. */
function cardValuePerModel(games: number, budget: AnalyzeBudget, models: number[]): number {
  return Math.max(1, Math.round((budget.cardValueGames ?? cardValueGames(games)) / models.length));
}

/** A requirement deliberately not measured (see `AnalyzeBudget.skip`). */
function notMeasured(what: string): Verdict {
  return { ok: false, inconclusive: true, detail: `no mesurat (skip: ${what})` };
}

/** Every model's decisions in one sample, fight ids kept distinct. */
function pooledChoiceCost(kvs: KitValues[]): ChoiceCost {
  let offset = 0;
  const costs = kvs.flatMap(kv => {
    const out = kv.costs.map(c => ({ cost: c.cost, fight: c.fight + offset }));
    offset += kv.fights;
    return out;
  });
  return kitChoiceCost({ byCard: new Map(), costs, positions: 0, fights: offset });
}

export function analyze(subject: Subject, games: number, budget: AnalyzeBudget = {}): KitReport {
  const kit = kitOf(subject);
  const cards = kit.actions;
  const level = kit.fullLevel;
  const cells = cellsFor(subject);
  const setup = setupFor(subject, level, budget.allSeats);
  const print = subjectPrintFor(subject, level, budget.allSeats);

  const top = runMatrix(cells, setup, games, print);

  // 1. Fights end — read at full kit, the shape players actually field.
  const dur = durationVerdict(top.medianRounds, top.p90Rounds, top.stallRate, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE);
  const duration: Verdict = {
    ok: dur.ok,
    detail: `mediana ${top.medianRounds} · p90 ${top.p90Rounds} · encallats ${pct(top.stallRate, top.games)} · taules ${pct(top.drawRate, top.games)}`
      + (dur.reasons.length ? ` → falla per: ${dur.reasons.join(', ')}` : ''),
    reasons: dur.reasons,
  };

  // 2. The power band: the full kit against the neutral stand-in, same cells.
  const band = strengthVerdict(top.delta, top.deltaStderr, KIT_BAND);
  const strength: Verdict = {
    ok: band.ok,
    detail: `${top.delta >= 0 ? '+' : ''}${(top.delta * 100).toFixed(1)}pp±${(top.deltaStderr * 100).toFixed(1)} vs neutre`
      + ` [banda ±${KIT_BAND * 100}pp]`
      + (band.side === 'above' ? ' → clarament PER SOBRE' : band.side === 'below' ? ' → clarament PER SOTA' : ''),
    band: { delta: top.delta, stderr: top.deltaStderr },
  };

  // 3. Choosing matters.
  if (budget.skip?.includes('cardValue')) {
    return { subject, cards, fullKit: top, cardValues: [], choiceCost: null, duration, strength, choices: notMeasured('cardValue') };
  }
  // MEASURED UNDER SEVERAL OPPONENT MODELS, AND POOLED. The continuation's
  // greediness is a free parameter with no defensible value (§20.11), so no
  // one model gets to decide.
  const models = budget.cardValueModels ?? DEFAULT_CARD_VALUE_MODELS;
  const perModel = cardValuePerModel(games, budget, models);
  const runs = models.map(sharpness =>
    measureKit(cells, setup, perModel, { ...DEFAULT_REGRET, continuationSharpness: sharpness }, print));

  // Each card's numbers, the mean across models; the never-right verdict is
  // per model and holds only when every model agrees (§20.11).
  const scored = runs.map(kv => new Map(scoreCards(kv).map(v => [v.id, v])));
  const values: CardScore[] = [];
  const blind: string[] = [];
  const neverRight: string[] = [], neverRightIds: string[] = [];
  for (const c of cards) {
    if (c.unlockLevel > level) continue;
    if (theSet().calibration.aiBlindCards[c.id]) { blind.push(c.name); continue; }
    const seen = scored.map(m => m.get(c.id)).filter((v): v is CardScore => v !== undefined);
    if (!seen.length) continue;
    const mean = (f: (v: CardScore) => number) => seen.reduce((s, v) => s + f(v), 0) / seen.length;
    const gains = seen.map(v => v.gainWhenBest).filter((g): g is number => g !== null);
    values.push({
      ...seen[0], value: mean(v => v.value), bestShare: mean(v => v.bestShare), bestStderr: mean(v => v.bestStderr),
      gainWhenBest: gains.length ? gains.reduce((x, g) => x + g, 0) / gains.length : null,
    });
    // A model that never saw the card counts as unable to judge it.
    if (seen.length === runs.length && seen.every(v => isNeverRight(v.gainWhenBest, v.gainWhenBestStderr, v.observations))) {
      neverRight.push(c.name); neverRightIds.push(c.id);
    }
  }
  values.sort((a, b) => b.value - a.value);

  const cost = pooledChoiceCost(runs);
  const matters = choiceMattersVerdict(cost.mean, cost.stderr, MIN_CHOICE_COST);
  const choices: Verdict = {
    ok: matters && neverRight.length === 0,
    detail: `triar a l'atzar costa ${cost.mean.toFixed(2)}±${cost.stderr.toFixed(2)} PV per decisió`
      + (matters ? '' : ` → triar NO importa prou`) + ` [cal ≥${MIN_CHOICE_COST}]`
      + (neverRight.length ? ` · MAI la jugada correcta (tots els models): ${neverRight.join(', ')}` : '')
      + (blind.length ? ` · no mesurables per la IA: ${blind.join(', ')}` : '')
      + ` · ${cost.decisions} decisions en ${runs.reduce((s, kv) => s + kv.fights, 0)} combats · models aiSharpness ${models.join('/')}`,
    cost,
    neverRight: neverRightIds,
  };

  return { subject, cards, fullKit: top, cardValues: values, choiceCost: cost, duration, strength, choices };
}

/** The subject half of a cell key. Shared so the warmer and the real run
 *  cannot address the same measurement differently — a warmer that keyed
 *  differently would fill the cache with entries nothing ever reads. */
export function subjectPrintFor(subject: Subject, level: number, allSeats = false): string {
  const base = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  // allSeats is part of the KEY: a four-seat run and a one-seat run of the
  // same kit are different experiments, and sharing a cache entry would serve
  // one as the other.
  return `${base}@L${level}${allSeats ? ':all4' : ''}`;
}

/** One unit a warm worker can compute — one CELL of one measurement. */
export type AnalysisJob =
  | { kind: 'matrix'; games: number; cellIdx: number }
  | { kind: 'cardValue'; sharpness: number; games: number; cellIdx: number };

/**
 * Every cell `analyze` will measure, as warm jobs. Derived from the same
 * budget `analyze` reads, and keyed by the same functions, so a warmed entry
 * is always one `analyze` then reads.
 */
export function analysisJobs(subject: Subject, games: number, budget: AnalyzeBudget): AnalysisJob[] {
  const cellIdxs = cellsFor(subject).map((_, i) => i);
  // MOST EXPENSIVE FIRST — the warm pool takes jobs in order (bench/parallel.ts):
  // card value (a rollout per legal card per decision), then the full-kit run.
  const jobs: AnalysisJob[] = [];
  if (!(budget.skip?.includes('cardValue') ?? false)) {
    const models = budget.cardValueModels ?? DEFAULT_CARD_VALUE_MODELS;
    const perModel = cardValuePerModel(games, budget, models);
    for (const sharpness of models) for (const cellIdx of cellIdxs) jobs.push({ kind: 'cardValue', sharpness, games: perModel, cellIdx });
  }
  for (const cellIdx of cellIdxs) jobs.push({ kind: 'matrix', games, cellIdx });
  return jobs;
}

/** Compute and cache ONE job's cell — what a warm worker does with each job. */
export function runAnalysisJob(subject: Subject, budget: AnalyzeBudget, job: AnalysisJob): void {
  const cells = cellsFor(subject);
  if (!cells[job.cellIdx]) return;
  const level = kitOf(subject).fullLevel;
  const setup = setupFor(subject, level, budget.allSeats);
  const print = subjectPrintFor(subject, level, budget.allSeats);
  if (job.kind === 'cardValue') {
    measureKitCell(cells, job.cellIdx, setup, job.games, { ...DEFAULT_REGRET, continuationSharpness: job.sharpness }, print);
    return;
  }
  matrixCell(cells, job.cellIdx, setup, job.games, print);
}
