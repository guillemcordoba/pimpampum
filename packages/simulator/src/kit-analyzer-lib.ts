/**
 * THE KIT ANALYZER (NEXT-STEPS §7) — the regression harness you run after
 * every kit edit. Fix the kit, throw a large seeded sample at it, get back a
 * pass/fail report card.
 *
 * One code path, two modes; they differ only in which side is the SUBJECT and
 * how its opposition is built (`setupFor` below):
 *
 *  - `player`: the subject skill sits in seat 1 of a party, against a solved
 *    fight shape. Subject winrate = the party's.
 *  - `enemy`: the subject creature, at a PV solved once and then HELD FIXED
 *    across levels, faces the calibration party. Subject winrate = the
 *    creature's. Fixing the PV is the whole point — re-solving it per level
 *    would absorb the level's effect into the hit points and requirement 1
 *    would read flat for every creature.
 *
 * EVERYTHING IS REPORTED AS A DELTA FROM THE NEUTRAL BASELINE measured in the
 * same cell (`bench/shapes.ts`). Two problems disappear when you subtract it:
 * a shape drifting as content is added no longer moves any kit's score, and the
 * SEATING — worth up to 66pp between company rows — cancels instead of burying
 * the kit under the seat it happened to sit in.
 *
 * Requirements implemented (§7.1), in the order the design leans on them:
 *
 *  1. HIGHER LEVEL IS A BETTER KIT — level N+1 knows a superset of N's cards,
 *     so a rational chooser can never do worse. Swept under common random
 *     numbers so two levels differ by their cards, not by their dice. Flat
 *     steps are reported too: a level that buys nothing is a level the GM and
 *     the player both pay for.
 *  2. FIGHTS DO NOT DRAG — median and p90 rounds, and the draw rate.
 *  3. THINKING MUST BEAT NOT THINKING, BY A LOT — the identical matchup
 *     replayed with the whole subject side impoverished, one way at a time
 *     (`bench/cells.ts`): random cards, or restricted to attacks / defenses /
 *     focus while still thinking as hard as ever inside that space, plus "one
 *     seat repeats a single card" per card. The best of them is the bar.
 *  4/5. WHICH CARDS THE GAME WANTS PLAYED — per-decision counterfactual value
 *     (`bench/regret.ts`, §18). A card clearly less often the best play than
 *     chance alone would make it is dead — and since nothing here costs
 *     anything to play or gates a replay, never worth playing is never worth
 *     holding. Play the kit; play it
 *     again with one card physically removed from the hand; subtract. A card
 *     whose removal costs the kit nothing is dead; a card whose removal IMPROVES
 *     the kit is a trap. This replaced "how often did the AI pick it", which
 *     made a hand-written evaluator the judge of the content it is meant to
 *     serve — the same cards read dead, then alive, then dead again across
 *     three sessions in which not one die changed.
 *  7. NO CARD CORRELATES WITH LOSING — win-when-played per card. Confounded on
 *     its own (a defense gets played when already losing), so it is reported as
 *     a flag to investigate, never as a verdict.
 *
 * EVERY VERDICT HERE IS A DIFFERENCE OF TWO SAMPLES, so every threshold is
 * checked against that difference's own error bar as well as against its
 * nominal value — and a ❌ means "go look", so the checks fail only on what is
 * CLEARLY past the line rather than on anything that fails to clear it with
 * confidence. Three things this file used to get wrong, all of them in the
 * direction of failing a kit that was fine:
 *
 *  - requirement 1 compared level steps to a flat 3pp with no noise floor, so
 *    at the old default a genuinely flat level read as a regression ~1 time in
 *    4, and over four steps most kits printed a false ❌;
 *  - requirement 3 subtracted a one-company baseline from a three-company
 *    policy figure — two different populations — and took its bar as the MAX
 *    of a dozen-odd noisy samples, which is winner's curse worth ~1.7σ;
 *  - cells were required to land within ±8pp of 60%, which excluded three of
 *    four shapes and could not be fixed by re-probing (NEXT-STEPS §12.4). Since
 *    every verdict was already a delta, the requirement was never load-bearing:
 *    a cell only has to be UNSATURATED.
 *
 * Run:
 *   pnpm --filter @pimpampum/simulator exec tsx src/kit-analyzer.ts            # every player kit
 *   … src/kit-analyzer.ts --enemy goblin                                       # one creature
 *   … src/kit-analyzer.ts --player berserk --games 1000
 *   … src/kit-analyzer.ts --all                                                # players + enemies
 */
import { ActionDefinition } from '@pimpampum/engine';
import { ALL_SKILLS, type PartySpec } from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, fullKitLevel, getEnemy, simulateEncounter, solveEncounter,
  type FieldedGroup,
} from '@pimpampum/enemies';
import { MAIN_KITS, hero } from './bench/reference.js';
import {
  FAIR, SATURATION, SHAPES, calibrationParty, saturatedCells, solveShape, usableCells,
  type Cell,
} from './bench/shapes.js';
import {
  RESTRICTED_POLICIES, THOUGHTLESS_POLICIES, cellKey, cellResult, runMatrix,
  type CellPolicy, type CellSetup, type MatrixResult,
} from './bench/cells.js';
import { DEFAULT_REGRET, measureKit, scoreCards, type CardScore } from './bench/regret.js';
import { deltaPP, deltaStderr, exact, gamesFor, maxOfKBias, pct, share, stderr } from './bench/report.js';
import { games, SMOKE } from './bench/games.js';
import { cacheStatus, enemyPrint, skillPrint } from './bench/cache.js';

declare const process: { argv: string[]; env: Record<string, string | undefined> };

export interface Subject {
  mode: 'player' | 'enemy';
  id: string;
  /** enemy mode only: how many bodies stand on the table. */
  count?: number;
  /** enemy mode only: override the solved PV. */
  pv?: number;
}

/** The subject at `level` in seat 1, with the given company at full kit. */
function partyWith(skillId: string, level: number, companyIdx: number): PartySpec {
  const base = calibrationParty(companyIdx).characters!;
  return { characters: [hero('Subjecte', skillId, level), ...base.slice(1)] };
}

// --- Enemy mode gets calibrated too -----------------------------------------
// Player cells are solved to `FAIR` and then measured; enemy cells used to be
// whatever `--count`/`--pv` happened to say, which made the two modes' numbers
// incomparable and let a run sit at 5% or 95% without anyone noticing.
//
// So the creature's PV is SOLVED once, at full kit, against the calibration
// party — then held fixed while the level sweeps. Its baseline in a cell is the
// complement of the party's measured winrate there, i.e. what this creature
// scores when it knows all its cards. A level's delta then reads directly as
// "how much of the finished kit does this level have".
const ENEMY_CALIBRATION_GAMES = 500;
const ENEMY_CALIBRATION_SEED = 717_000;

interface EnemyShape { groups: FieldedGroup[]; cells: Cell[]; capped: boolean; pv: number }
const enemyShapeCache = new Map<string, EnemyShape>();

function enemyShape(subject: Subject): EnemyShape {
  const key = `${subject.id}:${subject.count}:${subject.pv ?? 'solved'}`;
  const hit = enemyShapeCache.get(key);
  if (hit) return hit;

  const def = getEnemy(subject.id)!;
  const count = subject.count!;
  const full = fullKitLevel(def);
  const solved = subject.pv === undefined
    ? solveEncounter([{ enemyId: subject.id, count, level: full }], calibrationParty(0), FAIR, { searchGames: 120 })
    : null;
  const pv = subject.pv ?? solved?.groups[0].pv ?? 20;
  const groups: FieldedGroup[] = [{ enemyId: subject.id, count, level: full, pv }];

  const cells: Cell[] = [];
  calibrationParty(0);                       // touch, so COMPANY length is stable
  for (let companyIdx = 0; companyIdx < SHAPES.length; companyIdx++) void companyIdx;
  const rows = calibrationRowCount();
  for (let companyIdx = 0; companyIdx < rows; companyIdx++) {
    const party = simulateEncounter(groups, calibrationParty(companyIdx), {
      games: ENEMY_CALIBRATION_GAMES, seed: ENEMY_CALIBRATION_SEED + companyIdx * 31,
    }).winrate;
    const baseline = 1 - party;              // the CREATURE's score at full kit
    if (baseline < SATURATION.min || baseline > SATURATION.max) continue;
    cells.push({
      shapeIdx: 0, companyIdx, baseline,
      baselineGames: ENEMY_CALIBRATION_GAMES,
      label: `directe/c${companyIdx + 1}`,
    });
  }
  const entry: EnemyShape = {
    groups, cells, pv,
    capped: !!solved && (solved.clamped || solved.durationCapped),
  };
  enemyShapeCache.set(key, entry);
  return entry;
}

/** How many company rows there are, without importing COMPANY for one number. */
function calibrationRowCount(): number {
  let n = 0;
  while (n < 16) {
    const a = calibrationParty(n).characters!.map(c => c.name).join();
    const b = calibrationParty(0).characters!.map(c => c.name).join();
    if (n > 0 && a === b) break;
    n++;
  }
  return n;
}

/** Build the party and opposition for one cell. The ONLY thing the two modes
 *  differ by. */
/** How a subject is fielded at a level. */
export function setupFor(subject: Subject, level: number): (cell: Cell) => CellSetup {
  if (subject.mode === 'player') {
    return cell => ({
      party: partyWith(subject.id, level, cell.companyIdx),
      enemies: solveShape(SHAPES[cell.shapeIdx]).groups,
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
  return subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions
    : getEnemy(subject.id)!.skills.flatMap(s => s.actions);
}

/** The cells a subject is measured in. */
export function cellsFor(subject: Subject): Cell[] {
  return subject.mode === 'player' ? usableCells() : enemyShape(subject).cells;
}

export interface Verdict {
  ok: boolean;
  detail: string;
  /** The requirement could not be TESTED, as opposed to passed. A ✅ meaning
   *  "we could not check" is a lie the summary table tells at a glance. */
  inconclusive?: boolean;
}

/**
 * How many fights the per-decision valuation gets, derived from the analyzer's
 * own budget so one `--games` scales everything. A quarter, because every
 * DECISION is an observation here and every FIGHT was one there.
 */
function cardValueGames(games: number): number {
  return Math.max(SMOKE ? 2 : 12, Math.round(games / 4));
}

export interface KitReport {
  subject: Subject;
  cards: ActionDefinition[];
  levels: { level: number; run: MatrixResult }[];
  monotonicity: Verdict;
  duration: Verdict;
  /** Per-card value, strongest first (`bench/regret.ts`). */
  cardValues: CardScore[];
  spam: Verdict;
  strategySpace: Verdict;
  oneTrick: Verdict;
  cardUse: Verdict;
  correlation: Verdict;
}

/** Rounds budget from intentions.md: combats should not run past ~5. */
const MAX_MEDIAN_ROUNDS = 5;
const MAX_P90_ROUNDS = 8;
/** Fights that never end. Separate from the two length bars because it is a
 *  different failure: a stalemate is not a slow fight, it is no fight. */
const MAX_DRAW_RATE = 0.02;
/** Win-when-played below this is flagged by requirement 7. */
const LOSING_FLOOR = 0.4;
/**
 * A level step this far below zero is a regression — OR the step's own 2σ,
 * whichever is larger.
 *
 * The fixed 3pp alone was not a threshold, it was a coin flip. At the old
 * default (~300 games spread over a 12-cell matrix) a level's winrate carried
 * σ ≈ 2.9pp, so a step carried σ ≈ 4.1pp and a TRULY FLAT level read as a
 * regression about a quarter of the time. Over four or five steps per kit that
 * is a false "❌ level regression" on most kits — which is roughly what the
 * first report card printed. Requiring the step to clear its own noise as well
 * makes the verdict a claim about the cards rather than about the sample size.
 */
export const REGRESSION_PP = 0.03;
/**
 * Requirement 3's bar. Playing the kit properly must beat every MINDLESS
 * strategy — random legal cards, attack-spam, and repeating any single card —
 * by a wide margin, not by a nose. A kit that only edges past them is a kit
 * whose decisions barely matter, whatever its cards say on paper.
 */
export const MINDLESS_MARGIN = 0.20;
/**
 * The one-trick bar, and why it is NOT `MINDLESS_MARGIN`.
 *
 * "Only ever card X" handicaps ONE SEAT of four — a companion does not own the
 * subject's card, so it falls back to playing properly — while `uniform` and
 * the `onlyX` restrictions handicap the whole side. Three quarters of the party
 * still playing well means the winrate barely moves, so the one-trick family
 * can never lose 20pp, ALWAYS wins a max taken across both families, and caps
 * the reported margin near zero by construction. Measured on two kits before
 * this was split out: berserk −0.5pp and earthbender −1.0pp, both of them the
 * one-trick arm rather than any real finding.
 *
 * So the families are scored apart. Roughly a quarter of the side is
 * impoverished, so roughly a quarter of the bar — and it is reported as a FLAG
 * rather than a pass/fail, because §7.1 itself calls it the weaker claim.
 */
export const ONE_TRICK_MARGIN = 0.05;
/**
 * Requirement 3b's bar: how much the STRATEGY SPACE is worth, over and above
 * thinking.
 *
 * Lower than `MINDLESS_MARGIN` on purpose. A side restricted to attacks still
 * searches a round ahead and still attacks whenever an attack is legal — it is
 * a competent player with a smaller hand, not a thoughtless one, so it should
 * not be expected to lose by the same margin. 10pp is what "Defensa and Focus
 * earn their slots" ought to look like.
 *
 * It currently fails on every kit at any bar above ~3pp, which is the finding,
 * not the threshold's fault (NEXT-STEPS §16).
 */
export const STRATEGY_SPACE_MARGIN = 0.10;
/**
 * SAMPLE SIZE IS PER REQUIREMENT, because the thresholds differ by an order of
 * magnitude and the cost is dominated by the tightest one.
 *
 * Requirement 1 asks about a 3pp level step and genuinely needs ~2,200 combats
 * (`gamesFor(3)`); requirement 3 asks about a 20pp margin and needs ~50. Running
 * everything at requirement 1's budget — which is what `--games` used to mean —
 * spent 60% of a run buying precision no verdict could use. Measured at 19.8
 * ms/combat, that was ~8 minutes per kit and ~55 for a full sweep, against a
 * design constraint (NEXT-STEPS §7.2) of "under a minute per kit, a coffee
 * break for a sweep, or it will not get run after each edit".
 *
 * `--games` sizes the LEVEL sweep, which is the claim that needs it. The rest
 * are floored well above their own requirement so the report stays readable.
 */
export const MINDLESS_GAMES = Math.max(300, gamesFor(MINDLESS_MARGIN * 100));
/**
 * 3c's verify run gets its OWN budget, because its bar is four times finer
 * than requirement 3's and a sample sized for one cannot resolve the other.
 *
 * MEASURED, not reasoned (NEXT-STEPS §19.1). At 240 combats an arm the 3c
 * margin moved across a 10.8pp range on Enginyer and 14.4pp on Earthbender
 * with the GAME UNCHANGED and only the dice seed moving — against a 5pp bar.
 * The bare comparison this check used flipped PASSA/FALLA/PASSA/FALLA/PASSA
 * over five seeds. Two things were wrong and only one was the missing error
 * term: gamesFor(5) is 800 combats and the check was running 300.
 */
export const ONE_TRICK_GAMES = Math.max(MINDLESS_GAMES, gamesFor(ONE_TRICK_MARGIN * 100));
/**
 * Baselines are SCREENED at half that to select the toughest, then the winner
 * alone is re-measured on fresh numbers.
 *
 * Because the bar is a MAX over a dozen-odd noisy estimates, whichever one got
 * the luckiest sample wins — and that luck is then subtracted from the policy
 * as if it were skill. At 14 baselines the inflation is ~1.7σ (see
 * `maxOfKBias`), which at the old default was ~5pp off a 20pp threshold, all
 * of it against the kit. Select cheap, verify honestly: the same two-stage
 * shape the balancer uses for exactly this reason.
 */
const BASELINE_SCREEN_FRACTION = 0.5;
/**
 * Cards this harness CANNOT judge, and why.
 *
 * The ablation removed the AI's opinion from the verdict, but not the AI from
 * the fight: both arms are still played by it. A card whose value is something
 * only a PERSON can extract is therefore worth nothing in BOTH arms, and
 * ablates to exactly zero — indistinguishable from a card that does nothing at
 * all. Not dead, not weak: invisible, and the honest response to the ❌ would be
 * to "fix" a card that is not broken.
 *
 * (This is the one exemption the ablation still needs, and it is a narrower
 * claim than the play-rate version made: not "the AI undervalues it" — which is
 * no longer an excuse for anything — but "neither arm of the experiment can use
 * it, so the subtraction is 0 − 0".)
 *
 * This list is deliberately hard to add to: a card belongs here only when the
 * AI structurally cannot use it, never when it merely plays it badly.
 */
export const AI_BLIND_CARDS: Record<string, string> = {
  'estat-de-flux': 'grants post-reveal card swaps. The AI commits blind and never '
    + 'swaps, so the card is worth exactly nothing to it and everything to a player '
    + 'who can see the reveal. Its own handler already says so (aiWeight 0.2).',
};

// --- THE DECISION RULES, as pure functions ----------------------------------
//
// Requirements 3, 3b and 3c ask the same question against three different bars:
// "does the real policy beat this impoverished arm by at least X?" They used to
// compute it three times, in three places, and that is exactly how 3c came to
// be missing its error term while its two neighbours had one (NEXT-STEPS
// §19.1). One rule, three bars: the drift has nowhere to happen.
//
// They are pure and exported so they can be CONTROL-TESTED on inputs whose
// answer is known — a margin that clearly clears the bar, one that clearly
// misses, one that misses only inside its own noise, one where the arm wins,
// and one where the sample cannot resolve the bar at all. A verdict rule that
// is only ever exercised by real data is a rule nobody has checked.

export interface MarginCheck {
  ok: boolean;
  margin: number;
  stderr: number;
  /** Misses the bar nominally but reaches it inside its own interval. Worth
   *  saying out loud: the reader should not act on it either way. */
  borderline: boolean;
  /** The impoverished arm BEATS the policy beyond noise. Not a content finding
   *  — an impoverished side outplaying the real one is a statement about the
   *  policy, and pointing it at the kit sends the reader to the wrong file. */
  armWins: boolean;
  /** Whether this many combats can resolve this bar at all (`gamesFor`). A
   *  verdict below its own resolution reports which seed was used. */
  resolvable: boolean;
}

/**
 * Does the policy beat an impoverished arm by at least `bar`?
 *
 * FAILS ONLY ON WHAT IS CLEARLY PAST THE LINE, never on what merely fails to
 * clear it with confidence: a X here means "go look", and a false one costs a
 * session. The asymmetry runs the other way from requirement 1's total-gain
 * check, where failing to DEMONSTRATE a gain is itself the finding.
 */
export function marginVerdict(
  policyWinrate: number, policyGames: number,
  armWinrate: number, armGames: number,
  bar: number,
): MarginCheck {
  const margin = policyWinrate - armWinrate;
  const se = deltaStderr(policyWinrate, policyGames, armWinrate, armGames);
  return {
    margin,
    stderr: se,
    ok: margin + 2 * se >= bar,
    borderline: margin < bar && margin + 2 * se >= bar,
    armWins: margin + 2 * se < 0,
    resolvable: Math.min(policyGames, armGames) >= gamesFor(bar * 100),
  };
}

/** One level step, and whether it is a regression, flat, or just noisy. */
export type StepKind = 'gain' | 'regression' | 'noisy' | 'flat';

/**
 * Classify a level step.
 *
 * A step counts as a REGRESSION only when it is both materially negative AND
 * bigger than its own error bar — otherwise the verdict is a report on the
 * sample size rather than on the kit. At the old default a genuinely flat level
 * read as a regression about one time in four, and over four steps most kits
 * printed a false X.
 */
export function classifyStep(step: number, se: number, regressionPP: number): StepKind {
  if (step < -Math.max(regressionPP, 2 * se)) return 'regression';
  if (step < -regressionPP) return 'noisy';
  if (Math.abs(step) <= 2 * se) return 'flat';
  return 'gain';
}

/**
 * Do fights end?
 *
 * THREE SEPARATE FAILURES, reported separately. "Drags" and "never ends" are
 * different problems with different fixes, and collapsing them into one boolean
 * sent every reader of a X here to look at the wrong number: measured
 * 2026-09-20, every kit failed this on the DRAW RATE while its median (3) and
 * p90 (6) sat comfortably inside their bars.
 */
export function durationVerdict(
  medianRounds: number, p90Rounds: number, drawRate: number,
  maxMedian: number, maxP90: number, maxDraws: number,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (medianRounds > maxMedian) reasons.push(`mediana ${medianRounds} > ${maxMedian}`);
  if (p90Rounds > maxP90) reasons.push(`p90 ${p90Rounds} > ${maxP90}`);
  if (drawRate >= maxDraws) reasons.push(`taules ≥ ${exact(maxDraws)} (combats que no acaben MAI)`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Requirement 7: does this card correlate with LOSING?
 *
 * A FLAG, never a verdict, and confounded by construction: a defense gets
 * played precisely when things are going badly, so a healthy defensive card
 * correlates with losing no matter how good it is. Extracted anyway, because a
 * flag nobody has controlled is a flag nobody should act on — and this one had
 * no test of any kind.
 *
 * Draws sit in the denominator and never the numerator, so the figure is
 * depressed by the draw rate. One more reason not to read it as a verdict.
 */
export function correlatesWithLosing(
  wins: number, plays: number, minPlays: number, floor: number,
): { judged: boolean; flagged: boolean; rate: number } {
  if (plays < minPlays) return { judged: false, flagged: false, rate: 0 };
  const rate = wins / plays;
  // CLEARLY below the floor, not merely measured below it.
  return { judged: true, flagged: rate + 2 * stderr(rate, plays) < floor, rate };
}

export interface AnalyzeBudget {
  /** Verify-pass sample for requirements 3 and 3b. */
  mindlessGames?: number;
  /** Verify-pass sample for 3c, whose bar is four times finer. */
  oneTrickGames?: number;
  /** Fights behind requirement 4/5. */
  cardValueGames?: number;
}

export function analyze(subject: Subject, games: number, budget: AnalyzeBudget = {}): KitReport {
  const mindlessGames = budget.mindlessGames ?? MINDLESS_GAMES;
  const oneTrickGames = budget.oneTrickGames ?? ONE_TRICK_GAMES;
  const cards = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions
    : getEnemy(subject.id)!.skills.flatMap(s => s.actions);
  const maxLevel = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions.length
    : fullKitLevel(getEnemy(subject.id)!);
  const cells = cellsFor(subject);
  // What the numbers depend on besides the cells: the subject's own cards, and
  // (player mode) the level it is built at. A kit edit invalidates that kit's
  // rows and nobody else's, so a full sweep after one edit re-measures one kit.
  const subjectPrint = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  void subjectPrint;
  const keyFor = (l: number, _p: CellPolicy, _off: number) => subjectPrintFor(subject, l);

  const levels: { level: number; run: MatrixResult }[] = [];
  for (let l = 1; l <= maxLevel; l++) {
    levels.push({ level: l, run: runMatrix(cells, setupFor(subject, l), games, 'policy', 0, keyFor(l, 'policy', 0)) });
  }

  // 1. Level monotonicity. A step only counts as a regression when it is both
  // materially negative AND bigger than its own error bar — otherwise the
  // verdict is a report on the sample size, not on the kit. The baselines
  // cancel in a level-to-level comparison, so this is the same claim whether it
  // is read on deltas or on raw winrates.
  const regressions: string[] = [];
  const flat: string[] = [];
  const noisy: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i].run, b = levels[i - 1].run;
    const step = a.delta - b.delta;
    const se = deltaStderr(a.winrate, a.games, b.winrate, b.games);
    const label = `${levels[i - 1].level}→${levels[i].level}`;
    const shown = `${label} ${deltaPP(a.winrate, a.games, b.winrate, b.games)}`;
    const kind = classifyStep(step, se, REGRESSION_PP);
    if (kind === 'regression') regressions.push(shown);
    else if (kind === 'noisy') noisy.push(shown);
    else if (kind === 'flat') flat.push(label);
  }
  const first = levels[0].run, last = levels[levels.length - 1].run;
  const totalGain = last.delta - first.delta;
  const gainSe = deltaStderr(last.winrate, last.games, first.winrate, first.games);
  const monotonicity: Verdict = {
    ok: regressions.length === 0 && totalGain > Math.max(0.05, 2 * gainSe),
    detail: (regressions.length ? `regressions: ${regressions.join(', ')} · ` : '')
      + `guany total ${deltaPP(last.winrate, last.games, first.winrate, first.games)}`
      + (flat.length ? ` · plans (dins del soroll): ${flat.join(', ')}` : '')
      + (noisy.length ? ` · negatius però dins del soroll: ${noisy.join(', ')}` : '')
      + ` [cal ≥${gamesFor(REGRESSION_PP * 100)} combats/nivell per resoldre ${REGRESSION_PP * 100}pp; n=${last.games}]`,
  };

  // 2. Duration (read at full kit — the shape players actually field). This and
  // requirements 4/5 and 7 all read off the level sweep's own combats, so they
  // ride its budget for free rather than costing a run of their own.
  const top = levels[levels.length - 1].run;
  const dur = durationVerdict(top.medianRounds, top.p90Rounds, top.drawRate, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_DRAW_RATE);
  const duration: Verdict = {
    ok: dur.ok,
    detail: `mediana ${top.medianRounds} · p90 ${top.p90Rounds} · taules ${pct(top.drawRate, top.games)}`
      + (dur.reasons.length ? ` → falla per: ${dur.reasons.join(', ')}` : ''),
  };

  // 3. Every mindless strategy must lose, and lose badly. SELECT, THEN VERIFY:
  // the bar is the MAX of a dozen-odd samples, so it is biased upward by
  // whichever one got lucky. Screen cheaply, then re-measure the winner at full
  // precision on FRESH numbers, and take the margin from that second pass —
  // with both arms swept over the SAME cells, since a margin between two
  // different matrices is not a margin.
  const screenGames = Math.max(40, Math.round(mindlessGames * BASELINE_SCREEN_FRACTION));
  const screen = (p: CellPolicy) =>
    runMatrix(cells, setupFor(subject, maxLevel), screenGames, p, 0,
      subjectPrintFor(subject, maxLevel)).winrate;

  const thoughtlessLabels = ['atzar', 'sempre el atac més gran'];
  const restrictedLabels = ['només atacs', 'només defenses (tortuga)', 'només focus'];
  const sideScreened = THOUGHTLESS_POLICIES.map((p, i) => ({ label: thoughtlessLabels[i], policy: p, winrate: screen(p) }));
  const restrictedScreened = RESTRICTED_POLICIES.map((p, i) => ({ label: restrictedLabels[i], policy: p, winrate: screen(p) }));
  const oneTrickScreened = cards
    .filter(c => c.unlockLevel <= maxLevel)
    .map(c => ({ label: `només ${c.name}`, policy: { oneCard: c.id } as CellPolicy, winrate: screen({ oneCard: c.id }) }));

  const picked = sideScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  const pickedTrick = oneTrickScreened.length
    ? oneTrickScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a))
    : null;

  const VERIFY_OFFSET = 7_919;
  const toughest = runMatrix(cells, setupFor(subject, maxLevel), mindlessGames, picked.policy, VERIFY_OFFSET,
    keyFor(maxLevel, picked.policy, VERIFY_OFFSET));
  const policyRun = runMatrix(cells, setupFor(subject, maxLevel), mindlessGames, 'policy', VERIFY_OFFSET,
    keyFor(maxLevel, 'policy', VERIFY_OFFSET));
  const trickRun = pickedTrick
    ? runMatrix(cells, setupFor(subject, maxLevel), oneTrickGames, pickedTrick.policy, VERIFY_OFFSET,
      keyFor(maxLevel, pickedTrick.policy, VERIFY_OFFSET))
    : null;
  // The policy arm 3c subtracts has to carry the SAME sample, or the margin's
  // error is dominated by whichever side was measured more cheaply.
  const trickPolicyRun = pickedTrick
    ? runMatrix(cells, setupFor(subject, maxLevel), oneTrickGames, 'policy', VERIFY_OFFSET,
      keyFor(maxLevel, 'policy', VERIFY_OFFSET))
    : policyRun;
  const pickedRestricted = restrictedScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  const restrictedRun = runMatrix(cells, setupFor(subject, maxLevel), mindlessGames,
    pickedRestricted.policy, VERIFY_OFFSET, keyFor(maxLevel, pickedRestricted.policy, VERIFY_OFFSET));
  const spamCheck = marginVerdict(policyRun.winrate, policyRun.games, toughest.winrate, toughest.games, MINDLESS_MARGIN);
  const margin = spamCheck.margin, marginSe = spamCheck.stderr;
  const screenBias = maxOfKBias(sideScreened.length) * stderr(picked.winrate, screenGames);
  const borderline = spamCheck.borderline;
  const spam: Verdict = {
    // FAIL ONLY WHEN THE MARGIN IS CLEARLY BELOW THE BAR, not whenever it fails
    // to clear it with confidence. A ❌ here means "go look at this kit", so a
    // false one costs a session — which is what the first report card's wall of
    // ❌ cost. The asymmetry runs the other way from requirement 1's total-gain
    // check: there, failing to DEMONSTRATE a gain is itself the finding.
    ok: spamCheck.ok,
    detail: `política ${pct(policyRun.winrate, policyRun.games)} vs la millor estratègia sense pensar`
      + ` (${picked.label}) ${pct(toughest.winrate, toughest.games)}`
      + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, toughest.winrate, toughest.games)}`
      + ` [cal ≥${MINDLESS_MARGIN * 100}pp]${borderline ? ' ⚠️ JUST — el marge no és distingible del llindar' : ''}`
      + ` · triada entre ${sideScreened.length} de COSTAT SENCER`
      + ` (el cribratge la sobreestima ~${(screenBias * 100).toFixed(1)}pp, per això es torna a mesurar amb llavor nova)`,
  };

  // 3b. Does the STRATEGY SPACE matter? A side that still thinks a round ahead,
  // but may only play one type of card. This is a different and much harder
  // question than 3, and it is the one currently failing everywhere: attacking
  // whenever an attack is legal ties free play. Its own bar, because a
  // restricted THINKER is not a thoughtless one.
  const spaceCheck = marginVerdict(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games, STRATEGY_SPACE_MARGIN);
  const spaceMargin = spaceCheck.margin, spaceSe = spaceCheck.stderr;
  const strategySpace: Verdict = {
    ok: spaceCheck.ok,
    detail: `la millor restricció d'espai (${pickedRestricted.label}) ${pct(restrictedRun.winrate, restrictedRun.games)}`
      + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games)}`
      + ` [cal ≥${STRATEGY_SPACE_MARGIN * 100}pp; encara pensa, només té menys cartes on triar]`,
  };

  // 3c. The one-trick flag, scored apart for the reason in ONE_TRICK_MARGIN.
  const trickCheck = trickRun
    ? marginVerdict(trickPolicyRun.winrate, trickPolicyRun.games, trickRun.winrate, trickRun.games, ONE_TRICK_MARGIN)
    : null;
  const trickMargin = trickCheck?.margin ?? 0;
  const oneTrick: Verdict = {
    ok: !trickCheck || trickCheck.ok,
    detail: trickRun && pickedTrick
      ? `la millor carta repetida (${pickedTrick.label}) ${pct(trickRun.winrate, trickRun.games)}`
        + ` → marge ${deltaPP(trickPolicyRun.winrate, trickPolicyRun.games, trickRun.winrate, trickRun.games)}`
        + ` [cal ≥${ONE_TRICK_MARGIN * 100}pp; només un seient dels quatre, no comparable amb 3]`
        + (trickCheck?.armWins ? ' ⚠️ la carta repetida GUANYA — mira la política, no el kit' : '')
      : 'sense cartes per provar',
  };

  // 4/5. WHICH CARDS THE GAME ACTUALLY WANTS PLAYED (NEXT-STEPS §18).
  //
  // This was a leave-one-out ablation until it was calibrated (§17.5) and found
  // to be underpowered by construction: a whole kit in one seat is worth ~11pp
  // against a ~3pp noise floor, so an evenly balanced 5-card kit has every card
  // under the floor. It is now measured AT THE DECISION — force each legal card
  // from a position both branches share exactly, play the fight out, subtract.
  // 29 of 29 cards resolve where 7 did, at a fraction of the cost.
  const kitValues = measureKit(cells, setupFor(subject, maxLevel), budget.cardValueGames ?? cardValueGames(games), DEFAULT_REGRET);
  const scored = scoreCards(kitValues);
  const byId = new Map(scored.map(v => [v.id, v]));

  const dead: string[] = [];
  const unjudged: string[] = [];
  const blind: string[] = [];
  const values: CardScore[] = [];
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    if (AI_BLIND_CARDS[c.id]) { blind.push(c.name); continue; }
    const v = byId.get(c.id);
    if (!v) { unjudged.push(`${c.name} (mai legal)`); continue; }
    values.push(v);
    const shown = `${c.name} ${v.value.toFixed(1)} PV · millor ${share(v.bestShare * v.observations, v.observations).trim()} vs atzar ${exact(v.nullShare)}`;
    // THE VERDICT IS THE ABSOLUTE STATISTIC ONLY. `value` ranks a card against
    // the rest of its hand and those values sum to ~zero by arithmetic, so
    // failing on it would flag half of every kit no matter how good the kit is.
    // "Was it ever the right play" does not have that problem: a card clearly
    // under the share chance alone would hand it is one the game never wants
    // played, and since nothing in these rules costs anything to play or gates
    // a replay, a card never worth playing is a card not worth holding.
    if (v.bestShare + 2 * v.bestStderr < v.nullShare) dead.push(shown);
  }
  values.sort((a, b) => b.value - a.value);
  const cardUse: Verdict = {
    ok: dead.length === 0,
    detail: [
      dead.length ? `MORTES (mai són la millor jugada): ${dead.join(', ')}` : 'cap carta per sota del que donaria l\'atzar',
      unjudged.length ? `sense mostra: ${unjudged.join(', ')}` : '',
      blind.length ? `no mesurables per la IA: ${blind.join(', ')}` : '',
      `[${kitValues.positions} decisions en ${kitValues.fights} combats]`,
    ].filter(Boolean).join(' · '),
  };

  // 7. Cards correlating with losing (a flag, not a verdict — confounded).
  const losers: string[] = [];
  for (const c of cards) {
    const plays = top.stats.actionPlays[c.id] ?? 0;
    const wins = top.stats.actionWinPlays[c.id] ?? 0;
    const r7 = correlatesWithLosing(wins, plays, games * 0.2, LOSING_FLOOR);
    if (!r7.judged) continue;
    const w = r7.rate;
    // Clearly below 40%, not merely measured below it. (Draws count in the
    // denominator and never in the numerator, so this figure is depressed by
    // the draw rate; one more reason not to read it as a verdict.)
    if (r7.flagged) losers.push(`${c.name} ${share(wins, plays).trim()}`);
  }
  const correlation: Verdict = {
    ok: losers.length === 0,
    detail: losers.length ? `correlacionen amb perdre: ${losers.join(', ')}` : 'cap per sota del 40%',
  };

  return {
    subject, cards, levels, cardValues: values,
    monotonicity, duration, spam, strategySpace, oneTrick, cardUse, correlation,
  };
}

// --- Warming one matrix, for bench/parallel.ts ------------------------------

/**
 * Compute and cache ONE matrix run, addressed the way a warm job addresses it.
 *
 * This exists so a child process can fill a cache entry the main run will then
 * read. It deliberately goes through the same `cellsFor`/`setupFor`/`matrixKey`
 * path as `analyze`, because a warmer that built its key differently would fill
 * the cache with entries nothing ever reads — a silent, pure-waste failure.
 */
export function warmMatrix(job: {
  mode: 'player' | 'enemy'; id: string; count?: number;
  level: number; games: number; policy: string; seedOffset: number; cellIdx: number;
}): void {
  const subject: Subject = { mode: job.mode, id: job.id, count: job.count };
  const cells = cellsFor(subject);
  const cell = cells[job.cellIdx];
  if (!cell) return;
  const policy: CellPolicy = job.policy.startsWith('one:')
    ? { oneCard: job.policy.slice(4) }
    : (job.policy as CellPolicy);
  const perCell = Math.max(SMOKE ? 1 : 10, Math.round(job.games / cells.length));
  cellResult(
    () => setupFor(subject, job.level)(cell), cell, perCell, policy, job.seedOffset,
    cellKey(subjectPrintFor(subject, job.level), cell, perCell, policy, job.seedOffset),
  );
}

/** The subject half of a cell key. Shared so the warmer and the real run
 *  cannot address the same measurement differently — a warmer that keyed
 *  differently would fill the cache with entries nothing ever reads. */
export function subjectPrintFor(subject: Subject, level: number): string {
  const base = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  return `${base}@L${level}`;
}

/** Every matrix run `analyze` will ask for, so they can be warmed up front. */
export function warmJobsFor(subject: Subject, games: number): {
  mode: 'player' | 'enemy'; id: string; count?: number;
  level: number; games: number; policy: string; seedOffset: number; cellIdx: number;
}[] {
  const cards = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions
    : getEnemy(subject.id)!.skills.flatMap(s => s.actions);
  const maxLevel = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions.length
    : fullKitLevel(getEnemy(subject.id)!);
  const base = { mode: subject.mode, id: subject.id, count: subject.count };
  const jobs = [];
  const nCells = cellsFor(subject).length;
  const cellIdxs = Array.from({ length: nCells }, (_, i) => i);
  for (let l = 1; l <= maxLevel; l++) {
    for (const cellIdx of cellIdxs) jobs.push({ ...base, level: l, games, policy: 'policy', seedOffset: 0, cellIdx });
  }
  const screenGames = Math.max(40, Math.round(MINDLESS_GAMES * BASELINE_SCREEN_FRACTION));
  for (const p of [...THOUGHTLESS_POLICIES, ...RESTRICTED_POLICIES]) {
    for (const cellIdx of cellIdxs) jobs.push({ ...base, level: maxLevel, games: screenGames, policy: p as string, seedOffset: 0, cellIdx });
  }
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    for (const cellIdx of cellIdxs) jobs.push({ ...base, level: maxLevel, games: screenGames, policy: `one:${c.id}`, seedOffset: 0, cellIdx });
  }
  // The verify pass cannot be warmed: which policy it re-measures is CHOSEN
  // from the screen above, so it is not known until that has run.
  return jobs;
}
