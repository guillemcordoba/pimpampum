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
 * same cell (`@pimpampum/bench`, `positions.ts`). Two problems disappear when you subtract it:
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
 * The CLI that prints a report card from this is `tools/src/kit-analyzer.ts`.
 */
import type { ActionDefinition } from '@pimpampum/engine';
import {
  calibrationGames, calibrationParty, exact, type CardScore, type Cell, cellKey, type CellPolicy, cellResult,
  type CellSetup, companyCount, companyPrint, DEFAULT_REGRET, deltaPP, deltaStderr, enemyPrint, type FieldedGroup, groupsPrint,
  gamesFor, isSaturated, type KitInfo, type MatrixResult, maxOfKBias, matrixCell, measureKit, measureKitCell, type PartySpec, pct,
  RESTRICTED_POLICIES, runMatrix, scoreCards, shapeEnemies, share, skillPrint, SMOKE, stderr,
  subjectParty, theSet, THOUGHTLESS_POLICIES, usableCells,
} from '@pimpampum/bench';
import {
  AUTO_INCLUDE_SHARE, BASELINE_SCREEN_FRACTION, classifyStep, isAutoInclude, KIT_BAND, type MarginCheck, strengthVerdict, correlatesWithLosing, durationVerdict, isDeadCard, LOSING_FLOOR, marginVerdict,
  MAX_STALL_RATE, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MIN_PLAYS_JUDGED, MINDLESS_GAMES, MINDLESS_MARGIN,
  ONE_TRICK_GAMES, ONE_TRICK_MARGIN, REGRESSION_PP, STRATEGY_SPACE_MARGIN,
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
    // EVERY SEAT the subject kit. Requirements 2, 3 and 3b are properties of
    // the whole SIDE, not of one seat, so a control kit occupying one of four
    // cannot move them: a kit with a single distinct card still measured a
    // +13.5pp thinking margin because its three companions were real kits
    // (NEXT-STEPS §19.6). This is the seam those controls need, and nothing
    // else uses it — a real sweep always fields the calibration company, which
    // is what makes kits comparable to each other.
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
// party — then held fixed while the level sweeps. Its baseline in a cell is the
// complement of the party's measured winrate there, i.e. what this creature
// scores when it knows all its cards. A level's delta then reads directly as
// "how much of the finished kit does this level have".
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
    // its levels will be — see `positions.baselineFor` for why that matters.
    const probe: Cell = { shapeIdx: 0, companyIdx, label: 'baseline', baseline: 0, baselineGames: 0, context: '' };
    const baseline = cellResult(
      () => ({ party: calibrationParty(companyIdx), enemies: groups, subjectTeam: 1 }),
      probe, games, 'policy', ENEMY_CALIBRATION_SEED,
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

/** Build the party and opposition for one cell. The ONLY thing the two modes
 *  differ by. */
/** How a subject is fielded at a level. */
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
  // Controls and assertions used to regex the Catalan `detail` — slicing the
  // "MORTES" section by hand, scraping `marge +X pp` — and one of those slices
  // cut inside a card's own text and passed for the wrong reason. A verdict a
  // machine reads must be data.
  /** Requirements 3 / 3b / 3c: the margin rule's whole answer. */
  margin?: MarginCheck;
  /** Requirement 4/5: ids dead under EVERY opponent model. Requirement 7: ids flagged. */
  cards?: string[];
  /** Requirement 4/5: ids dead under SOME models only — reported, never failed on. */
  sensitive?: string[];
  /** Requirement 2: which bars failed. */
  reasons?: string[];
  /** Requirement 8: the full-kit delta against the neutral stand-in, and its 1σ. */
  band?: { delta: number; stderr: number };
  /** Requirement 1: the level steps that regressed ("2→3"), and the total gain. */
  regressions?: string[];
  gain?: { value: number; stderr: number };
}

/**
 * How many fights the per-decision valuation gets, derived from the analyzer's
 * own budget so one `--games` scales everything. A quarter, because every
 * DECISION is an observation here and every FIGHT was one there.
 */
function cardValueGames(games: number): number {
  return Math.max(SMOKE ? 2 : 12, Math.round(games / 4));
}

/** The fights each opponent model gets — the card-value budget split, not multiplied. */
function cardValuePerModel(games: number, budget: AnalyzeBudget, models: number[]): number {
  return Math.max(1, Math.round((budget.cardValueGames ?? cardValueGames(games)) / models.length));
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
  /** Requirement 5: no card erases the decision. */
  autoInclude: Verdict;
  /** Requirement 8: the kit sits inside the power band around the neutral stand-in. */
  strength: Verdict;
  correlation: Verdict;
}

export interface AnalyzeBudget {
  /** Field the subject kit in ALL FOUR seats. Control kits only — see
   *  `partyWith`. A real sweep must field the calibration company, or kits
   *  stop being comparable with each other. */
  allSeats?: boolean;
  /** Verify-pass sample for requirements 3 and 3b. */
  mindlessGames?: number;
  /** Verify-pass sample for 3c, whose bar is four times finer. */
  oneTrickGames?: number;
  /** Fights behind requirement 4/5. */
  cardValueGames?: number;
  /**
   * Requirements this caller will not read, so `analyze` can skip MEASURING
   * them rather than merely measuring them cheaply.
   *
   * `analyze` computes all seven whichever one you came for, and the two named
   * here are most of the bill: 4/5 plays out a fight per candidate card per
   * DECISION, and 3c re-measures two arms at its own four-times-finer bar. A
   * control asserting one verdict was paying for seven —
   * `requirement-controls.test.ts` reached FORTY MINUTES on a single file, and
   * a suite nobody can afford to run is one nobody runs, which is the whole
   * reason bench's `games()` exists.
   *
   * Skipped requirements come back INCONCLUSIVE, never ok. A ✅ meaning "we did
   * not look" is the one lie the summary table must never tell.
   *
   * Sweeps and report cards pass nothing here — they read every verdict.
   */
  skip?: ('cardValue' | 'oneTrick')[];
  /**
   * Opponent models requirement 4/5 measures each card under — the
   * continuation's `aiSharpness`. A card is dead only if it is dead under ALL
   * of them; one that dies under some and lives under others is reported as
   * SENSITIVE and never failed on.
   *
   * The budget is split across the models, not multiplied, so robustness costs
   * sample size rather than time. See `DEFAULT_CARD_VALUE_MODELS`.
   */
  cardValueModels?: number[];
}

/**
 * Soft, default, and hard. Spread either side of the engine's `aiSharpness: 2`
 * because there is no defensible single value and the spread is the point:
 * 0.5 treats the enemy's face-down card as a broad distribution, 4 as nearly a
 * single line, and a card that only reads dead at one end of that range has not
 * been measured (NEXT-STEPS §20.11).
 *
 * Three, not more, because each one costs a third of the sample.
 */
export const DEFAULT_CARD_VALUE_MODELS = [0.5, 2, 4];

/**
 * The smallest screen a baseline arm gets. A floor, so a report stays readable
 * at a thin budget — but under `BENCH_SMOKE` it has to give way like every other
 * sample, or a two-combat smoke run still screens nine arms at forty fights each
 * (a minute per control file, measured) and nobody runs the smoke either.
 */
const SCREEN_FLOOR = SMOKE ? 2 : 40;

/** A requirement deliberately not measured (see `AnalyzeBudget.skip`). */
function notMeasured(what: string): Verdict {
  return { ok: false, inconclusive: true, detail: `no mesurat (skip: ${what})` };
}

export function analyze(subject: Subject, games: number, budget: AnalyzeBudget = {}): KitReport {
  const mindlessGames = budget.mindlessGames ?? MINDLESS_GAMES;
  const oneTrickGames = budget.oneTrickGames ?? ONE_TRICK_GAMES;
  const cards = kitOf(subject).actions;
  const maxLevel = kitOf(subject).fullLevel;
  const cells = cellsFor(subject);
  // What the numbers depend on besides the cells: the subject's own cards, and
  // (player mode) the level it is built at. A kit edit invalidates that kit's
  // rows and nobody else's, so a full sweep after one edit re-measures one kit.
  const subjectPrint = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  void subjectPrint;
  const keyFor = (l: number, _p: CellPolicy, _off: number) => subjectPrintFor(subject, l, budget.allSeats);

  const levels: { level: number; run: MatrixResult }[] = [];
  for (let l = 1; l <= maxLevel; l++) {
    levels.push({ level: l, run: runMatrix(cells, setupFor(subject, l, budget.allSeats), games, 'policy', 0, keyFor(l, 'policy', 0)) });
  }

  // 1. Level monotonicity. A step only counts as a regression when it is both
  // materially negative AND bigger than its own error bar — otherwise the
  // verdict is a report on the sample size, not on the kit. The baselines
  // cancel in a level-to-level comparison, so this is the same claim whether it
  // is read on deltas or on raw winrates.
  const regressions: string[] = [];
  const regressed: string[] = [];
  const flat: string[] = [];
  const noisy: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i].run, b = levels[i - 1].run;
    const step = a.delta - b.delta;
    const se = deltaStderr(a.winrate, a.games, b.winrate, b.games);
    const label = `${levels[i - 1].level}→${levels[i].level}`;
    const shown = `${label} ${deltaPP(a.winrate, a.games, b.winrate, b.games)}`;
    const kind = classifyStep(step, se, REGRESSION_PP);
    if (kind === 'regression') { regressions.push(shown); regressed.push(label); }
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
    regressions: regressed,
    gain: { value: totalGain, stderr: gainSe },
  };

  // 2. Duration (read at full kit — the shape players actually field). This and
  // requirements 4/5 and 7 all read off the level sweep's own combats, so they
  // ride its budget for free rather than costing a run of their own.
  const top = levels[levels.length - 1].run;
  const dur = durationVerdict(top.medianRounds, top.p90Rounds, top.stallRate, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE);
  const duration: Verdict = {
    ok: dur.ok,
    detail: `mediana ${top.medianRounds} · p90 ${top.p90Rounds} · encallats ${pct(top.stallRate, top.games)} · taules ${pct(top.drawRate, top.games)}`
      + (dur.reasons.length ? ` → falla per: ${dur.reasons.join(', ')}` : ''),
    reasons: dur.reasons,
  };

  // 3. Every mindless strategy must lose, and lose badly. SELECT, THEN VERIFY:
  // the bar is the MAX of a dozen-odd samples, so it is biased upward by
  // whichever one got lucky. Screen cheaply, then re-measure the winner at full
  // precision on FRESH numbers, and take the margin from that second pass —
  // with both arms swept over the SAME cells, since a margin between two
  // different matrices is not a margin.
  const { screenGames, sideScreened, picked, pickedTrick, pickedRestricted } = screenArms(subject, budget);
  const toughest = runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), mindlessGames, picked.policy, VERIFY_OFFSET,
    keyFor(maxLevel, picked.policy, VERIFY_OFFSET));
  const policyRun = runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), mindlessGames, 'policy', VERIFY_OFFSET,
    keyFor(maxLevel, 'policy', VERIFY_OFFSET));
  const skipTrick = budget.skip?.includes('oneTrick') ?? false;
  const trickRun = pickedTrick && !skipTrick
    ? runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), oneTrickGames, pickedTrick.policy, VERIFY_OFFSET,
      keyFor(maxLevel, pickedTrick.policy, VERIFY_OFFSET))
    : null;
  // The policy arm 3c subtracts has to carry the SAME sample, or the margin's
  // error is dominated by whichever side was measured more cheaply.
  const trickPolicyRun = pickedTrick && !skipTrick
    ? runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), oneTrickGames, 'policy', VERIFY_OFFSET,
      keyFor(maxLevel, 'policy', VERIFY_OFFSET))
    : policyRun;
  const restrictedRun = runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), mindlessGames,
    pickedRestricted.policy, VERIFY_OFFSET, keyFor(maxLevel, pickedRestricted.policy, VERIFY_OFFSET));
  const spamCheck = marginVerdict(policyRun.winrate, policyRun.games, toughest.winrate, toughest.games, MINDLESS_MARGIN);
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
    margin: spamCheck,
  };

  // 3b. Does the STRATEGY SPACE matter? A side that still thinks a round ahead,
  // but may only play one type of card. This is a different and much harder
  // question than 3, and it is the one currently failing everywhere: attacking
  // whenever an attack is legal ties free play. Its own bar, because a
  // restricted THINKER is not a thoughtless one.
  const spaceCheck = marginVerdict(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games, STRATEGY_SPACE_MARGIN);
  const strategySpace: Verdict = {
    ok: spaceCheck.ok,
    detail: `la millor restricció d'espai (${pickedRestricted.label}) ${pct(restrictedRun.winrate, restrictedRun.games)}`
      + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games)}`
      + ` [cal ≥${STRATEGY_SPACE_MARGIN * 100}pp; encara pensa, només té menys cartes on triar]`,
    margin: spaceCheck,
  };

  // 3c. The one-trick flag, scored apart for the reason in ONE_TRICK_MARGIN.
  const trickCheck = trickRun
    ? marginVerdict(trickPolicyRun.winrate, trickPolicyRun.games, trickRun.winrate, trickRun.games, ONE_TRICK_MARGIN)
    : null;
  const oneTrick: Verdict = skipTrick ? notMeasured('oneTrick') : {
    ok: !trickCheck || trickCheck.ok,
    detail: trickRun && pickedTrick
      ? `la millor carta repetida (${pickedTrick.label}) ${pct(trickRun.winrate, trickRun.games)}`
        + ` → marge ${deltaPP(trickPolicyRun.winrate, trickPolicyRun.games, trickRun.winrate, trickRun.games)}`
        + ` [cal ≥${ONE_TRICK_MARGIN * 100}pp; només un seient dels quatre, no comparable amb 3]`
        + (trickCheck?.armWins ? ' ⚠️ la carta repetida GUANYA — mira la política, no el kit' : '')
      : 'sense cartes per provar',
    margin: trickCheck ?? undefined,
  };

  // 4/5. WHICH CARDS THE GAME ACTUALLY WANTS PLAYED (NEXT-STEPS §18).
  //
  // This was a leave-one-out ablation until it was calibrated (§17.5) and found
  // to be underpowered by construction: a whole kit in one seat is worth ~11pp
  // against a ~3pp noise floor, so an evenly balanced 5-card kit has every card
  // under the floor. It is now measured AT THE DECISION — force each legal card
  // from a position both branches share exactly, play the fight out, subtract.
  // 29 of 29 cards resolve where 7 did, at a fraction of the cost.
  // MEASURED UNDER SEVERAL OPPONENT MODELS, AND DEAD ONLY IF DEAD UNDER ALL.
  //
  // The continuation's greediness is a free parameter with no defensible value,
  // and it is the most biased knob in the package: sweeping it moves individual
  // cards' measured usage by 4–9× in relative terms, and it moves them most for
  // exactly the set-up cards this requirement was calling dead (§20.11).
  // Picking a "better" sharpness only relocates that bias.
  //
  // So the robustness check IS the fix: a verdict that flips when an
  // unjustifiable modelling choice changes is not a verdict. The budget is
  // SPLIT across the models rather than multiplied, so this costs no more than
  // before — each model gets a smaller sample, which widens its error bars,
  // which makes the check conservative. That is the right direction for a
  // verdict whose whole job is to say "stop and look at this card".
  const skipCards = budget.skip?.includes('cardValue') ?? false;
  const models = budget.cardValueModels ?? DEFAULT_CARD_VALUE_MODELS;
  const perModel = cardValuePerModel(games, budget, models);
  const setup = setupFor(subject, maxLevel, budget.allSeats);
  const runs = skipCards ? [] : models.map(sharpness => {
    const kv = measureKit(cells, setup, perModel, { ...DEFAULT_REGRET, continuationSharpness: sharpness },
      subjectPrintFor(subject, maxLevel, budget.allSeats));
    return { sharpness, kv, byId: new Map(scoreCards(kv).map(v => [v.id, v])) };
  });
  const kitValues = runs.length
    ? { positions: runs.reduce((s, r) => s + r.kv.positions, 0), fights: runs.reduce((s, r) => s + r.kv.fights, 0) }
    : { positions: 0, fights: 0 };

  const dead: string[] = [];
  const deadIds: string[] = [];
  /** Dead under SOME models and not others — the honest third category. */
  const fragile: string[] = [];
  const fragileIds: string[] = [];
  const auto: string[] = [];
  const autoIds: string[] = [];
  const unjudged: string[] = [];
  const blind: string[] = [];
  const values: CardScore[] = [];
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    if (theSet().calibration.aiBlindCards[c.id]) { blind.push(c.name); continue; }
    const seen = runs.map(r => r.byId.get(c.id)).filter((v): v is CardScore => v !== undefined);
    if (!seen.length) { if (runs.length) unjudged.push(`${c.name} (mai legal)`); continue; }
    // Reported value is the mean across models; the VERDICT is per model.
    const mean = seen.reduce((s, v) => s + v.value, 0) / seen.length;
    values.push({ ...seen[0], value: mean });
    // THE VERDICT IS THE ABSOLUTE STATISTIC ONLY. `value` ranks a card against
    // the rest of its hand and those values sum to ~zero by arithmetic, so
    // failing on it would flag half of every kit no matter how good the kit is.
    // "Was it ever the right play" does not have that problem: a card clearly
    // under the share chance alone would hand it is one the game never wants
    // played, and since nothing in these rules costs anything to play or gates
    // a replay, a card never worth playing is a card not worth holding.
    const deadIn = seen.filter(v => isDeadCard(v.bestShare, v.bestStderr, v.nullShare)).length;
    const shown = `${c.name} ${mean.toFixed(1)} PV · mort en ${deadIn}/${seen.length} models`;
    if (deadIn === seen.length) { dead.push(shown); deadIds.push(c.id); }
    else if (deadIn > 0) { fragile.push(shown); fragileIds.push(c.id); }
    // Requirement 5, the other tail, under the same all-models rule.
    if (seen.every(v => isAutoInclude(v.bestShare, v.bestStderr))) {
      // Its own error bar, not one invented from a made-up n.
      auto.push(`${c.name} millor en ${exact(seen[0].bestShare)}±${exact(seen[0].bestStderr)} de les decisions`);
      autoIds.push(c.id);
    }
  }
  values.sort((a, b) => b.value - a.value);
  const cardUse: Verdict = skipCards ? notMeasured('cardValue') : {
    ok: dead.length === 0,
    detail: [
      dead.length ? `MORTES en tots els models: ${dead.join(', ')}` : 'cap carta morta sota tots els models',
      // Printed, never failed on. A card that dies under one model and lives
      // under another has not been measured, and saying so is the point.
      fragile.length ? `⚠️ SENSIBLES al model de rival (no és veredicte): ${fragile.join(', ')}` : '',
      unjudged.length ? `sense mostra: ${unjudged.join(', ')}` : '',
      blind.length ? `no mesurables per la IA: ${blind.join(', ')}` : '',
      `[${kitValues.positions} decisions en ${kitValues.fights} combats · models aiSharpness ${models.join('/')}]`,
    ].filter(Boolean).join(' · '),
    cards: deadIds,
    sensitive: fragileIds,
  };

  const autoInclude: Verdict = skipCards ? notMeasured('cardValue') : {
    ok: autoIds.length === 0,
    detail: autoIds.length
      ? `AUTOMÀTIQUES (la decisió desapareix) en tots els models: ${auto.join(', ')}`
      : `cap carta és la millor jugada en més del ${AUTO_INCLUDE_SHARE * 100}% de les seves decisions`,
    cards: autoIds,
  };

  // 8. The power band: the full kit against the neutral stand-in, in the same
  // cells. The delta is already what every report headlines; this judges it.
  const band = strengthVerdict(top.delta, top.deltaStderr, KIT_BAND);
  const strength: Verdict = {
    ok: band.ok,
    detail: `${top.delta >= 0 ? '+' : ''}${(top.delta * 100).toFixed(1)}pp±${(top.deltaStderr * 100).toFixed(1)} vs neutre`
      + ` [banda ±${KIT_BAND * 100}pp]`
      + (band.side === 'above' ? ' → clarament PER SOBRE' : band.side === 'below' ? ' → clarament PER SOTA' : ''),
    band: { delta: top.delta, stderr: top.deltaStderr },
  };

  // 7. Cards correlating with losing (a flag, not a verdict — confounded).
  const losers: string[] = [];
  const loserIds: string[] = [];
  for (const c of cards) {
    const plays = top.stats.actionPlays[c.id] ?? 0;
    const wins = top.stats.actionWinPlays[c.id] ?? 0;
    const r7 = correlatesWithLosing(wins, plays, MIN_PLAYS_JUDGED, LOSING_FLOOR);
    if (!r7.judged) continue;
    // Clearly below 40%, not merely measured below it. (Draws count in the
    // denominator and never in the numerator, so this figure is depressed by
    // the draw rate; one more reason not to read it as a verdict.)
    if (r7.flagged) { losers.push(`${c.name} ${share(wins, plays).trim()}`); loserIds.push(c.id); }
  }
  const correlation: Verdict = {
    ok: losers.length === 0,
    detail: losers.length ? `correlacionen amb perdre: ${losers.join(', ')}` : 'cap per sota del 40%',
    cards: loserIds,
  };

  return {
    subject, cards, levels, cardValues: values,
    monotonicity, duration, spam, strategySpace, oneTrick, cardUse, autoInclude, strength, correlation,
  };
}

/** The subject half of a cell key. Shared so the warmer and the real run
 *  cannot address the same measurement differently — a warmer that keyed
 *  differently would fill the cache with entries nothing ever reads. */
export function subjectPrintFor(subject: Subject, level: number, allSeats = false): string {
  const base = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  // allSeats is part of the KEY: a four-seat run and a one-seat run of the
  // same kit at the same level are different experiments, and sharing a cache
  // entry would serve one as the other. The ablation learned this the hard way.
  return `${base}@L${level}${allSeats ? ':all4' : ''}`;
}

// --- The plan: every expensive measurement `analyze` makes -----------------

/** The seed offset of the verify pass — fresh numbers for the arms the screen picked. */
const VERIFY_OFFSET = 7_919;

interface Screened { label: string; policy: CellPolicy; winrate: number }

/** The screen's sample: a fraction of the verify pass's, never under the floor. */
function screenGamesFor(budget: AnalyzeBudget): number {
  return Math.max(SCREEN_FLOOR, Math.round((budget.mindlessGames ?? MINDLESS_GAMES) * BASELINE_SCREEN_FRACTION));
}

/**
 * Requirement 3's SCREEN: every mindless arm, cheaply, and the one each family
 * picks for the verify pass. One function for `analyze` and for the warm plan,
 * so the arms warmed are the arms measured.
 */
export function screenArms(subject: Subject, budget: AnalyzeBudget = {}): {
  screenGames: number;
  sideScreened: Screened[]; restrictedScreened: Screened[]; oneTrickScreened: Screened[];
  picked: Screened; pickedRestricted: Screened; pickedTrick: Screened | null;
} {
  const maxLevel = kitOf(subject).fullLevel;
  const cells = cellsFor(subject);
  const screenGames = screenGamesFor(budget);
  const screen = (p: CellPolicy) =>
    runMatrix(cells, setupFor(subject, maxLevel, budget.allSeats), screenGames, p, 0,
      subjectPrintFor(subject, maxLevel, budget.allSeats)).winrate;
  const thoughtlessLabels = ['atzar', 'sempre el atac més gran'];
  const restrictedLabels = ['només atacs', 'només defenses (tortuga)', 'només focus'];
  const sideScreened = THOUGHTLESS_POLICIES.map((p, i) => ({ label: thoughtlessLabels[i], policy: p, winrate: screen(p) }));
  const restrictedScreened = RESTRICTED_POLICIES.map((p, i) => ({ label: restrictedLabels[i], policy: p, winrate: screen(p) }));
  const oneTrickScreened = kitOf(subject).actions
    .filter(c => c.unlockLevel <= maxLevel)
    .map(c => ({ label: `només ${c.name}`, policy: { oneCard: c.id } as CellPolicy, winrate: screen({ oneCard: c.id }) }));
  const best = (xs: Screened[]) => xs.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  return {
    screenGames, sideScreened, restrictedScreened, oneTrickScreened,
    picked: best(sideScreened),
    pickedRestricted: best(restrictedScreened),
    pickedTrick: oneTrickScreened.length ? best(oneTrickScreened) : null,
  };
}

/** One unit a warm worker can compute — one CELL of one measurement. */
export type AnalysisJob =
  | { kind: 'matrix'; level: number; games: number; policy: string; seedOffset: number; cellIdx: number }
  | { kind: 'cardValue'; sharpness: number; games: number; cellIdx: number };

const encodePolicy = (p: CellPolicy): string => (typeof p === 'string' ? p : `one:${p.oneCard}`);
const decodePolicy = (p: string): CellPolicy => (p.startsWith('one:') ? { oneCard: p.slice(4) } : p as CellPolicy);

/**
 * Every cell `analyze` will measure, as warm jobs, in two stages: what is known
 * up front (the level sweep, the screens, card value), and — once the screens
 * are in the cache, which is what `stage: 'verify'` needs — the arms the screen
 * picked. Derived from the same budget `analyze` reads, and keyed by the same
 * functions, so a warmed entry is always one `analyze` then reads.
 */
export function analysisJobs(subject: Subject, games: number, budget: AnalyzeBudget, stage: 'upfront' | 'verify'): AnalysisJob[] {
  const kit = kitOf(subject);
  const maxLevel = kit.fullLevel;
  const cellIdxs = cellsFor(subject).map((_, i) => i);
  const matrix = (level: number, g: number, policy: CellPolicy, seedOffset: number): AnalysisJob[] =>
    cellIdxs.map(cellIdx => ({ kind: 'matrix', level, games: g, policy: encodePolicy(policy), seedOffset, cellIdx }));
  const skipTrick = budget.skip?.includes('oneTrick') ?? false;

  if (stage === 'verify') {
    const mindlessGames = budget.mindlessGames ?? MINDLESS_GAMES;
    const oneTrickGames = budget.oneTrickGames ?? ONE_TRICK_GAMES;
    const { picked, pickedRestricted, pickedTrick } = screenArms(subject, budget);
    return [
      ...matrix(maxLevel, mindlessGames, picked.policy, VERIFY_OFFSET),
      ...matrix(maxLevel, mindlessGames, 'policy', VERIFY_OFFSET),
      ...matrix(maxLevel, mindlessGames, pickedRestricted.policy, VERIFY_OFFSET),
      ...(pickedTrick && !skipTrick
        ? [...matrix(maxLevel, oneTrickGames, pickedTrick.policy, VERIFY_OFFSET), ...matrix(maxLevel, oneTrickGames, 'policy', VERIFY_OFFSET)]
        : []),
    ];
  }

  const screenGames = screenGamesFor(budget);
  // MOST EXPENSIVE FIRST — the warm pool takes jobs in order (bench/parallel.ts):
  // card value (a rollout per legal card per decision), then the level sweep
  // from the top, then the cheap screens.
  const jobs: AnalysisJob[] = [];
  if (!(budget.skip?.includes('cardValue') ?? false)) {
    const models = budget.cardValueModels ?? DEFAULT_CARD_VALUE_MODELS;
    const perModel = cardValuePerModel(games, budget, models);
    for (const sharpness of models) for (const cellIdx of cellIdxs) jobs.push({ kind: 'cardValue', sharpness, games: perModel, cellIdx });
  }
  for (let l = maxLevel; l >= 1; l--) jobs.push(...matrix(l, games, 'policy', 0));
  for (const p of [...THOUGHTLESS_POLICIES, ...RESTRICTED_POLICIES]) jobs.push(...matrix(maxLevel, screenGames, p, 0));
  for (const c of kit.actions) if (c.unlockLevel <= maxLevel) jobs.push(...matrix(maxLevel, screenGames, { oneCard: c.id }, 0));
  return jobs;
}

/** Compute and cache ONE job's cell — what a warm worker does with each job. */
export function runAnalysisJob(subject: Subject, budget: AnalyzeBudget, job: AnalysisJob): void {
  const cells = cellsFor(subject);
  const cell = cells[job.cellIdx];
  if (!cell) return;
  const maxLevel = kitOf(subject).fullLevel;
  if (job.kind === 'cardValue') {
    measureKitCell(cells, job.cellIdx, setupFor(subject, maxLevel, budget.allSeats), job.games,
      { ...DEFAULT_REGRET, continuationSharpness: job.sharpness }, subjectPrintFor(subject, maxLevel, budget.allSeats));
    return;
  }
  matrixCell(cells, job.cellIdx, setupFor(subject, job.level, budget.allSeats), job.games,
    decodePolicy(job.policy), job.seedOffset, subjectPrintFor(subject, job.level, budget.allSeats));
}
