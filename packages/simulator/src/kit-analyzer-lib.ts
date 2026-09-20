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
 *  4/5. NO DEAD CARDS, NO TRAPS — LEAVE-ONE-OUT ABLATION. Play the kit; play it
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
import { MAIN_KITS, hero, heroWithout } from './bench/reference.js';
import {
  FAIR, SATURATION, SHAPES, calibrationParty, saturatedCells, solveShape, usableCells,
  type Cell,
} from './bench/shapes.js';
import {
  RESTRICTED_POLICIES, THOUGHTLESS_POLICIES, cellKey, cellResult, runMatrix,
  type CellPolicy, type CellSetup, type MatrixResult,
  pairedMatrixDelta,
} from './bench/cells.js';
import { deltaPP, deltaStderr, gamesFor, maxOfKBias, pct, pp, share, stderr } from './bench/report.js';
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
function partyWith(skillId: string, level: number, companyIdx: number, without?: string): PartySpec {
  const base = calibrationParty(companyIdx).characters!;
  const subject = without
    ? heroWithout('Subjecte', skillId, level, without)
    : hero('Subjecte', skillId, level);
  return { characters: [subject, ...base.slice(1)] };
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
/**
 * How a subject is fielded at a level — and, optionally, WITHOUT one of its
 * cards (the leave-one-out ablation; see `heroWithout`).
 *
 * The opposition is untouched by `without`: the whole claim is that this side
 * lost one option and nothing else moved.
 */
export function setupFor(subject: Subject, level: number, without?: string): (cell: Cell) => CellSetup {
  if (subject.mode === 'player') {
    return cell => ({
      party: partyWith(subject.id, level, cell.companyIdx, without),
      enemies: solveShape(SHAPES[cell.shapeIdx]).groups,
      subjectTeam: 0,
    });
  }
  const shape = enemyShape(subject);
  return cell => ({
    party: calibrationParty(cell.companyIdx),
    // PV is held at the value solved for the FULL kit. An ablated creature
    // re-solved to the same target winrate would simply grow PV until the
    // missing card stopped mattering, and every card would price at zero.
    enemies: shape.groups.map(g => ({ ...g, level, without: without ? [without] : undefined })),
    subjectTeam: 1,
  });
}

/** The cells a subject is measured in. */
function cellsFor(subject: Subject): Cell[] {
  return subject.mode === 'player' ? usableCells() : enemyShape(subject).cells;
}

export interface Verdict { ok: boolean; detail: string }

/**
 * What one card is worth to its kit, by leave-one-out ablation.
 *
 * Carried on the report rather than folded into the verdict string because the
 * DISTRIBUTION is the finding: a kit whose cards are worth +8/+7/+6/+5 and one
 * whose cards are worth +24/+1/+0/+0 both pass the dead-card check, and they
 * are not the same kit.
 */
export interface CardValue {
  id: string;
  name: string;
  /** winrate(kit) − winrate(kit without this card). */
  value: number;
  /** 1σ on that difference. */
  stderr: number;
  /** Turns the card was legal / chosen, in the FULL-kit arm. Explanation for a
   *  value, never the verdict behind it. */
  legal: number;
  played: number;
  /** Worst and best cell for this card, in winrate points. A card can be worth
   *  nothing on average and decide two matchups in opposite directions, and
   *  that is a design fact rather than noise — it is what a KIT having bad
   *  matchups looks like, one card at a time. */
  worst: { label: string; diff: number };
  best: { label: string; diff: number };
}

export interface KitReport {
  subject: Subject;
  cards: ActionDefinition[];
  levels: { level: number; run: MatrixResult }[];
  monotonicity: Verdict;
  duration: Verdict;
  /** Per-card ablation values, strongest first. */
  cardValues: CardValue[];
  spam: Verdict;
  strategySpace: Verdict;
  oneTrick: Verdict;
  cardUse: Verdict;
  correlation: Verdict;
}

/** Rounds budget from intentions.md: combats should not run past ~5. */
const MAX_MEDIAN_ROUNDS = 5;
const MAX_P90_ROUNDS = 8;
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
const ONE_TRICK_MARGIN = 0.05;
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
const STRATEGY_SPACE_MARGIN = 0.10;
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
const MINDLESS_GAMES = Math.max(300, gamesFor(MINDLESS_MARGIN * 100));
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
 * WHAT A CARD IS WORTH — and why this is no longer a play rate.
 *
 * Requirement 4/5 used to read "how often was this card chosen out of the turns
 * it was legal", with a dead line near 1/N. That question has the AI judging
 * the card, and the AI is a hand-written evaluator: the same eleven cards read
 * DEAD, then ALIVE, then dead again across three sessions in which not one die
 * changed. A measurement whose verdict tracks an evaluator constant is
 * measuring the evaluator.
 *
 * So the question is now LEAVE-ONE-OUT: build the kit, build it again with this
 * card physically absent (`heroWithout`), play both over the same matrix on the
 * same dice, and subtract.
 *
 *   value(C) = winrate(kit) − winrate(kit without C)
 *
 * WHAT THIS IS AND IS NOT ROBUST TO. A play rate is a function of the
 * EVALUATOR'S RANKING: edit one `aiWeight` and it moves to whatever you like,
 * which is how `Aguantar el cop` went from dead to alive at 0.6 → 1.1. An
 * ablation is a function of GAME OUTCOMES: if the AI plays a card more and the
 * winrate does not move, the card is doing nothing WHEN PLAYED, and no constant
 * can fake that. That is the robustness being bought, and it is real.
 *
 * But the AI is still playing both arms, so read the sign carefully:
 *
 *  - value > 0 → a LOWER BOUND on what the card is worth, and the one claim
 *    here that holds for a better player too. A larger choice set can never hurt
 *    someone who plays it optimally, so anyone who plays at least this well gets
 *    at least this much from the card.
 *  - value ≈ 0 → THIS AI gains nothing from holding it. The weaker claim, and
 *    the one requirement 4/5 fails on: a stronger player might still find a use,
 *    but nothing in the harness can see it, and a card whose entire value is
 *    invisible to a round of lookahead is a card to go and look at.
 *  - value < 0 → the AI plays WORSE for holding the card, which an optimal
 *    player never would: you can always ignore a card. So this is not evidence
 *    against the CARD, it is evidence that the AI is drawn to it wrongly — or
 *    that it is a genuine trap option, tempting and bad, which a human would
 *    fall for too. The harness cannot tell those apart, so it FLAGS this rather
 *    than failing the kit, the same way requirement 7 flags a confounded
 *    correlation.
 *
 * KNOWN WEAKNESS, and it is structural rather than a bug: leave-one-out is
 * SUB-ADDITIVE. Two cards that do the same job cover for each other, so each
 * ablates to nearly nothing and the pair reads dead while the function they
 * share is load-bearing. Read a dead verdict as "nothing here needs THIS card",
 * never as "this card does nothing". The level sweep (requirement 1) is the
 * complement — it removes cards in prefixes, so redundancy cannot hide there.
 */
/**
 * A card worth less than this in winrate is not carrying its slot.
 *
 * PROVISIONAL, and honestly so: nobody knows yet what a healthy card is worth
 * under this measurement, because nothing has ever measured it. The one thing
 * that would be wrong is to pick the number that makes today's kits pass.
 *
 * Two soft anchors put it near 2pp. Requirement 1 asks the whole kit to gain
 * ≥5pp from its first card to its last, which over today's 4-6 card kits is
 * ~1pp a card if the gain were spread evenly — so 2pp asks a card to pull
 * somewhat above an even share. And 2pp is roughly what the default sample can
 * resolve at 2σ; a finer line would only report noise.
 *
 * The report prints EVERY card's value, not just the failures, precisely so the
 * distribution is visible and this constant can be set from it rather than from
 * an argument. Move it when the numbers say to — and re-run every scoreboard,
 * because it is a unit.
 */
const DEAD_VALUE = 0.02;

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

export function analyze(subject: Subject, games: number): KitReport {
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
    if (step < -Math.max(REGRESSION_PP, 2 * se)) regressions.push(shown);
    else if (step < -REGRESSION_PP) noisy.push(shown);
    else if (Math.abs(step) <= 2 * se) flat.push(label);
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
  const duration: Verdict = {
    ok: top.medianRounds <= MAX_MEDIAN_ROUNDS && top.p90Rounds <= MAX_P90_ROUNDS && top.drawRate < 0.02,
    detail: `mediana ${top.medianRounds} · p90 ${top.p90Rounds} · taules ${pct(top.drawRate, top.games)}`,
  };

  // 3. Every mindless strategy must lose, and lose badly. SELECT, THEN VERIFY:
  // the bar is the MAX of a dozen-odd samples, so it is biased upward by
  // whichever one got lucky. Screen cheaply, then re-measure the winner at full
  // precision on FRESH numbers, and take the margin from that second pass —
  // with both arms swept over the SAME cells, since a margin between two
  // different matrices is not a margin.
  const screenGames = Math.max(40, Math.round(MINDLESS_GAMES * BASELINE_SCREEN_FRACTION));
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
  const toughest = runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, picked.policy, VERIFY_OFFSET,
    keyFor(maxLevel, picked.policy, VERIFY_OFFSET));
  const policyRun = runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, 'policy', VERIFY_OFFSET,
    keyFor(maxLevel, 'policy', VERIFY_OFFSET));
  const trickRun = pickedTrick
    ? runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, pickedTrick.policy, VERIFY_OFFSET,
      keyFor(maxLevel, pickedTrick.policy, VERIFY_OFFSET))
    : null;
  const pickedRestricted = restrictedScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  const restrictedRun = runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES,
    pickedRestricted.policy, VERIFY_OFFSET, keyFor(maxLevel, pickedRestricted.policy, VERIFY_OFFSET));
  const margin = policyRun.winrate - toughest.winrate;
  const marginSe = deltaStderr(policyRun.winrate, policyRun.games, toughest.winrate, toughest.games);
  const screenBias = maxOfKBias(sideScreened.length) * stderr(picked.winrate, screenGames);
  const borderline = margin < MINDLESS_MARGIN && margin + 2 * marginSe >= MINDLESS_MARGIN;
  const spam: Verdict = {
    // FAIL ONLY WHEN THE MARGIN IS CLEARLY BELOW THE BAR, not whenever it fails
    // to clear it with confidence. A ❌ here means "go look at this kit", so a
    // false one costs a session — which is what the first report card's wall of
    // ❌ cost. The asymmetry runs the other way from requirement 1's total-gain
    // check: there, failing to DEMONSTRATE a gain is itself the finding.
    ok: margin + 2 * marginSe >= MINDLESS_MARGIN,
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
  const spaceMargin = policyRun.winrate - restrictedRun.winrate;
  const spaceSe = deltaStderr(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games);
  const strategySpace: Verdict = {
    ok: spaceMargin + 2 * spaceSe >= STRATEGY_SPACE_MARGIN,
    detail: `la millor restricció d'espai (${pickedRestricted.label}) ${pct(restrictedRun.winrate, restrictedRun.games)}`
      + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, restrictedRun.winrate, restrictedRun.games)}`
      + ` [cal ≥${STRATEGY_SPACE_MARGIN * 100}pp; encara pensa, només té menys cartes on triar]`,
  };

  // 3c. The one-trick flag, scored apart for the reason in ONE_TRICK_MARGIN.
  const trickMargin = trickRun ? policyRun.winrate - trickRun.winrate : 0;
  const oneTrick: Verdict = {
    ok: !trickRun || trickMargin >= ONE_TRICK_MARGIN,
    detail: trickRun && pickedTrick
      ? `la millor carta repetida (${pickedTrick.label}) ${pct(trickRun.winrate, trickRun.games)}`
        + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, trickRun.winrate, trickRun.games)}`
        + ` [cal ≥${ONE_TRICK_MARGIN * 100}pp; només un seient dels quatre, no comparable amb 3]`
      : 'sense cartes per provar',
  };

  // 4/5. LEAVE-ONE-OUT ABLATION: is the kit worse without each card?
  //
  // Same cells, same games, same seed offset as the full-kit run above, so the
  // two arms meet the same dice and differ by one card. The baselines cancel in
  // the subtraction, so this is read on raw winrates.
  const dead: string[] = [];
  const misplayed: string[] = [];
  const unjudged: string[] = [];
  const blind: string[] = [];
  const values: CardValue[] = [];
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    if (AI_BLIND_CARDS[c.id]) { blind.push(c.name); continue; }
    const run = runMatrix(cells, setupFor(subject, maxLevel, c.id), games, 'policy', 0,
      subjectPrintFor(subject, maxLevel, c.id));
    // PAIRED, per cell. The two arms met the same cells from the same seeds, so
    // the between-cell spread — tens of points — cancels rather than being
    // counted twice. Treating them as independent puts a ±2.9pp bar around an
    // effect of one card in a four-seat party, which is wider than any card is
    // worth, and every verdict would be decided by noise.
    const paired = pairedMatrixDelta(top, run);
    const { delta: value, stderr: se } = paired;
    const ranked = [...paired.byCell].sort((a, b) => a.diff - b.diff);
    // Play rate is no longer the verdict, but it is the best available
    // EXPLANATION of one: a card worth nothing and never played is a card the
    // kit does not need, while a card worth nothing and played constantly is a
    // card something else already covers.
    const legal = top.counters.legal[c.id] ?? 0;
    const played = top.counters.played[c.id] ?? 0;
    values.push({
      id: c.id, name: c.name, value, stderr: se, legal, played,
      worst: ranked[0], best: ranked[ranked.length - 1],
    });
    const shown = `${c.name} ${pp(value)}±${(se * 200).toFixed(1)}${legal ? ` (jugada ${share(played, legal).trim()})` : ''}`;
    if (value + 2 * se < 0) misplayed.push(shown);
    else if (value + 2 * se < DEAD_VALUE) dead.push(shown);
    // Not enough power to tell DEAD_VALUE from zero — say so rather than pass.
    else if (2 * se > DEAD_VALUE && value - 2 * se < DEAD_VALUE) unjudged.push(shown);
  }
  values.sort((a, b) => b.value - a.value);
  const cardUse: Verdict = {
    // Two things do NOT fail the kit. An UNJUDGED card fails the SAMPLE, and
    // saying "this kit is broken" on the strength of too few combats is the
    // failure mode this whole layer was cleaned up to stop. A NEGATIVE value is
    // a statement about the AI, not the card — see the note on the sign above.
    ok: dead.length === 0,
    detail: [
      misplayed.length
        ? `la IA juga PITJOR amb aquestes a la mà (mira-hi, no és culpa de la carta): ${misplayed.join(', ')}`
        : '',
      dead.length ? `mortes: ${dead.join(', ')}` : '',
      unjudged.length ? `sense prou mostra per decidir: ${unjudged.join(', ')}` : '',
      blind.length ? `no mesurables per la IA: ${blind.join(', ')}` : '',
    ].filter(Boolean).join(' · ')
      || `totes ≥${pp(DEAD_VALUE)} de valor d'ablació`,
  };

  // 7. Cards correlating with losing (a flag, not a verdict — confounded).
  const losers: string[] = [];
  for (const c of cards) {
    const plays = top.stats.actionPlays[c.id] ?? 0;
    if (plays < games * 0.2) continue;
    const wins = top.stats.actionWinPlays[c.id] ?? 0;
    const w = wins / plays;
    // Clearly below 40%, not merely measured below it. (Draws count in the
    // denominator and never in the numerator, so this figure is depressed by
    // the draw rate; one more reason not to read it as a verdict.)
    if (w + 2 * stderr(w, plays) < 0.4) losers.push(`${c.name} ${share(wins, plays).trim()}`);
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
  without?: string;
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
    () => setupFor(subject, job.level, job.without)(cell), cell, perCell, policy, job.seedOffset,
    cellKey(subjectPrintFor(subject, job.level, job.without), cell, perCell, policy, job.seedOffset),
  );
}

/** The subject half of a cell key. Shared so the warmer and the real run
 *  cannot address the same measurement differently — a warmer that keyed
 *  differently would fill the cache with entries nothing ever reads. */
export function subjectPrintFor(subject: Subject, level: number, without?: string): string {
  const base = subject.mode === 'player'
    ? skillPrint(subject.id)
    : `${enemyPrint(subject.id)}:${subject.count}:${enemyShape(subject).pv}`;
  return `${base}@L${level}${without ? `-${without}` : ''}`;
}

/** Every matrix run `analyze` will ask for, so they can be warmed up front. */
export function warmJobsFor(subject: Subject, games: number): {
  mode: 'player' | 'enemy'; id: string; count?: number;
  level: number; games: number; policy: string; seedOffset: number; cellIdx: number;
  without?: string;
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
  // The ablations: one full-kit run per card, with that card gone. Same games
  // and same seed offset as the level sweep's top row, because that row is what
  // each of them is subtracted from and the two must meet the same dice.
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    if (AI_BLIND_CARDS[c.id]) continue;
    for (const cellIdx of cellIdxs) {
      jobs.push({ ...base, level: maxLevel, games, policy: 'policy', seedOffset: 0, cellIdx, without: c.id });
    }
  }
  // The verify pass cannot be warmed: which policy it re-measures is CHOSEN
  // from the screen above, so it is not known until that has run.
  return jobs;
}
