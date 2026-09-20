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
 *  4/5. NO DEAD CARDS / NO AUTO-INCLUDES — play rate per card conditioned on
 *     LEGALITY (not on turns), so a card that is rarely playable isn't scored
 *     as if it were always on offer. Both tails fail.
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
  SIDE_POLICIES, runMatrix, type CellPolicy, type CellSetup, type MatrixResult,
} from './bench/cells.js';
import { deltaPP, deltaStderr, exact, gamesFor, maxOfKBias, pct, share, stderr } from './bench/report.js';
import { games, SMOKE } from './bench/games.js';

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
function setupFor(subject: Subject, level: number): (cell: Cell) => CellSetup {
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

/** The cells a subject is measured in. */
function cellsFor(subject: Subject): Cell[] {
  return subject.mode === 'player' ? usableCells() : enemyShape(subject).cells;
}

export interface Verdict { ok: boolean; detail: string }

export interface KitReport {
  subject: Subject;
  cards: ActionDefinition[];
  levels: { level: number; run: MatrixResult }[];
  monotonicity: Verdict;
  duration: Verdict;
  spam: Verdict;
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
const REGRESSION_PP = 0.03;
/**
 * Requirement 3's bar. Playing the kit properly must beat every MINDLESS
 * strategy — random legal cards, attack-spam, and repeating any single card —
 * by a wide margin, not by a nose. A kit that only edges past them is a kit
 * whose decisions barely matter, whatever its cards say on paper.
 */
const MINDLESS_MARGIN = 0.20;
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
 * Play rate (conditioned on legality) outside this band fails 4/5.
 *
 * THE DEAD LINE IS RELATIVE, the auto-include line is absolute, and the
 * asymmetry is the point.
 *
 * A policy spreading evenly over N cards puts each at 1/N, so what counts as
 * "never chosen" depends on how many alternatives there are: 1/N is 20% in a
 * five-card kit and 3.3% in a thirty-card one. A flat 2% works today and stops
 * working as kits grow — by ~30 cards the dead line sits at the neutral rate
 * and every card reads dead. So the line is a FRACTION OF NEUTRAL. (At today's
 * 4-6 card kits that lands at 2.5-3.8%, i.e. where the old constant was — this
 * changes how the test ages, not what it says now.)
 *
 * Auto-include does not scale: a card chosen 85% of the times it is legal has
 * removed the decision regardless of how many cards it beat.
 */
const DEAD_FRACTION_OF_NEUTRAL = 0.15;
const AUTO_INCLUDE = 0.85;

/** The "never chosen" line for a kit of `cards` cards. */
function deadCardLine(cards: number): number {
  return (DEAD_FRACTION_OF_NEUTRAL / Math.max(1, cards));
}

export function analyze(subject: Subject, games: number): KitReport {
  const cards = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions
    : getEnemy(subject.id)!.skills.flatMap(s => s.actions);
  const maxLevel = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions.length
    : fullKitLevel(getEnemy(subject.id)!);
  const cells = cellsFor(subject);

  const levels: { level: number; run: MatrixResult }[] = [];
  for (let l = 1; l <= maxLevel; l++) {
    levels.push({ level: l, run: runMatrix(cells, setupFor(subject, l), games) });
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
    runMatrix(cells, setupFor(subject, maxLevel), screenGames, p).winrate;

  const sideLabels = ['atzar', 'només atacs', 'només defenses (tortuga)', 'només focus'];
  const sideScreened = SIDE_POLICIES.map((p, i) => ({ label: sideLabels[i], policy: p, winrate: screen(p) }));
  const oneTrickScreened = cards
    .filter(c => c.unlockLevel <= maxLevel)
    .map(c => ({ label: `només ${c.name}`, policy: { oneCard: c.id } as CellPolicy, winrate: screen({ oneCard: c.id }) }));

  const picked = sideScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  const pickedTrick = oneTrickScreened.length
    ? oneTrickScreened.reduce((a, b) => (b.winrate > a.winrate ? b : a))
    : null;

  const VERIFY_OFFSET = 7_919;
  const toughest = runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, picked.policy, VERIFY_OFFSET);
  const policyRun = runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, 'policy', VERIFY_OFFSET);
  const trickRun = pickedTrick
    ? runMatrix(cells, setupFor(subject, maxLevel), MINDLESS_GAMES, pickedTrick.policy, VERIFY_OFFSET)
    : null;
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

  // 3b. The one-trick flag, scored apart for the reason in ONE_TRICK_MARGIN.
  const trickMargin = trickRun ? policyRun.winrate - trickRun.winrate : 0;
  const oneTrick: Verdict = {
    ok: !trickRun || trickMargin >= ONE_TRICK_MARGIN,
    detail: trickRun && pickedTrick
      ? `la millor carta repetida (${pickedTrick.label}) ${pct(trickRun.winrate, trickRun.games)}`
        + ` → marge ${deltaPP(policyRun.winrate, policyRun.games, trickRun.winrate, trickRun.games)}`
        + ` [cal ≥${ONE_TRICK_MARGIN * 100}pp; només un seient dels quatre, no comparable amb 3]`
      : 'sense cartes per provar',
  };

  // 4/5. Play rate conditioned on legality, at full kit.
  const deadLine = deadCardLine(cards.length);
  // Enough legality observations to tell `deadLine` apart from zero at ~2σ. The
  // old gate compared an accumulated per-decision count against a COMBAT count,
  // which is not the same dimension.
  const minLegal = Math.ceil(4 / deadLine);
  const dead: string[] = [];
  const auto: string[] = [];
  const unjudged: string[] = [];
  for (const c of cards) {
    const legal = top.counters.legal[c.id] ?? 0;
    if (legal < minLegal) { unjudged.push(`${c.name} (${legal})`); continue; }
    const played = top.counters.played[c.id] ?? 0;
    const rate = played / legal;
    const se = stderr(rate, legal);
    if (rate + 2 * se < deadLine) dead.push(`${c.name} ${share(played, legal).trim()}`);
    else if (rate - 2 * se > AUTO_INCLUDE) auto.push(`${c.name} ${share(played, legal).trim()}`);
  }
  const cardUse: Verdict = {
    ok: dead.length === 0 && auto.length === 0,
    detail: [
      dead.length ? `mortes: ${dead.join(', ')}` : '',
      auto.length ? `automàtiques: ${auto.join(', ')}` : '',
      unjudged.length ? `sense prou mostra: ${unjudged.join(', ')}` : '',
    ].filter(Boolean).join(' · ')
      || `totes dins la banda [${exact(deadLine, 1)} – ${exact(AUTO_INCLUDE)}, ${cards.length} cartes]`,
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

  return { subject, cards, levels, monotonicity, duration, spam, oneTrick, cardUse, correlation };
}

// --- CLI --------------------------------------------------------------------

function subjectName(s: Subject): string {
  return s.mode === 'player'
    ? ALL_SKILLS.find(k => k.id === s.id)!.displayName
    : getEnemy(s.id)!.displayName;
}

function printReport(r: KitReport): void {
  const mark = (v: Verdict) => (v.ok ? '✅' : '❌');
  console.log(`\n━━ ${subjectName(r.subject)} (${r.subject.id}) · mode ${r.subject.mode} ━━`);
  // The DELTA is the headline: "how much better than a neutral kit, in the same
  // seats". The raw winrate is kept beside it because it is what a reader has
  // in their head — but it is the column that moves when a shape drifts.
  console.log('  nivell   vs neutre        (brut)      combats  mediana  p90   taules');
  for (const { level, run } of r.levels) {
    const d = run.delta * 100;
    console.log(
      `  ${String(level).padStart(6)}   ${(d >= 0 ? '+' : '') + d.toFixed(1)}pp±${(run.deltaStderr * 100).toFixed(1)}`.padEnd(29)
      + `  ${pct(run.winrate, run.games)}   ${String(run.games).padStart(6)}`
      + `  ${String(run.medianRounds).padStart(7)}  ${String(run.p90Rounds).padStart(3)}`
      + `   ${(run.drawRate * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log(`  ${mark(r.monotonicity)} 1. nivell superior = millor kit — ${r.monotonicity.detail}`);
  console.log(`  ${mark(r.duration)} 2. els combats no s'allarguen — ${r.duration.detail}`);
  console.log(`  ${mark(r.spam)} 3. pensar bat qualsevol estratègia sense pensar — ${r.spam.detail}`);
  console.log(`  ${mark(r.oneTrick)} 3b. una sola carta repetida no basta — ${r.oneTrick.detail}`);
  console.log(`  ${mark(r.cardUse)} 4/5. ni cartes mortes ni automàtiques — ${r.cardUse.detail}`);
  console.log(`  ${mark(r.correlation)} 7. cap carta correlaciona amb perdre — ${r.correlation.detail}`);

  const top = r.levels[r.levels.length - 1].run;
  // The spread across cells: a kit with no bad matchup is as much a problem as
  // one with no good matchup (§7.1 #10). Deltas, so the seat is already out.
  if (top.byCell.length > 1) {
    const lo = Math.min(...top.byCell.map(c => c.delta));
    const hi = Math.max(...top.byCell.map(c => c.delta));
    const perCell = Math.round(top.games / top.byCell.length);
    console.log(
      `  per cel·la: ${top.byCell.map(c => `${c.label} ${(c.delta * 100 >= 0 ? '+' : '') + (c.delta * 100).toFixed(0)}`).join(' · ')}`
      + ` (obertura ${((hi - lo) * 100).toFixed(0)}pp, ±${(stderr(0.5, perCell) * 100 * 1.41).toFixed(0)} per cel·la)`,
    );
  }
  console.log('  ús per carta (jugades / cops que era legal):');
  for (const c of r.cards) {
    const legal = top.counters.legal[c.id] ?? 0;
    console.log(`      ${c.name.padEnd(24)} ${legal ? share(top.counters.played[c.id] ?? 0, legal) : '     n/d'}`
      + `   (legal ${legal} cops)`);
  }
}

const argv = process.argv.slice(2);
const arg = (flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

/**
 * Default sample size FOR THE LEVEL SWEEP — `--games` means this and only this.
 *
 * Sized by the tightest claim on the card, requirement 1: resolving a 3pp level
 * step at 2σ needs ~2,200 combats (`gamesFor(3)`). Every other requirement is
 * sized by its own threshold (`MINDLESS_GAMES`) or rides this sweep's combats
 * for free, which is what keeps a kit at ~90 seconds rather than ~8 minutes.
 */
const DEFAULT_GAMES = 2_400;
const GAMES = games(DEFAULT_GAMES);

const subjects: Subject[] = [];
if (arg('--player')) subjects.push({ mode: 'player', id: arg('--player')! });
if (arg('--enemy')) {
  subjects.push({
    mode: 'enemy', id: arg('--enemy')!,
    count: Number(arg('--count') ?? 3),
    pv: arg('--pv') ? Number(arg('--pv')) : undefined,   // undefined = solve it
  });
}
if (subjects.length === 0) {
  // The sweep is the cost, not the sample: the smoke run does one kit.
  for (const s of (SMOKE ? MAIN_KITS.slice(0, 1) : MAIN_KITS)) subjects.push({ mode: 'player', id: s.id });
  if (argv.includes('--all')) {
    for (const e of ENEMY_DEFINITIONS) subjects.push({ mode: 'enemy', id: e.id, count: 3 });
  }
}

console.log(`ANALITZADOR DE KITS · ~${GAMES} combats per nivell, repartits per la matriu`);
console.log(
  'Cada forma es resol contra una colla amb la MATEIXA FORMA que una cel·la i després es MESURA'
  + ' contra totes les companyies. Les puntuacions són DELTES respecte d\'aquesta línia de base,'
  + ' així que la dificultat de la cel·la i el seient s\'anul·len.',
);
if (GAMES < gamesFor(REGRESSION_PP * 100)) {
  console.log(
    `⚠️  ${GAMES} combats/nivell no resolen un pas de ${REGRESSION_PP * 100}pp (calen ~${gamesFor(REGRESSION_PP * 100)}).`
    + ' Els veredictes de nivell d\'aquesta passada són indicatius, no concloents.',
  );
}
console.log('');

const cells = usableCells();
for (let i = 0; i < SHAPES.length; i++) {
  const s = solveShape(SHAPES[i]);
  const comp = s.groups.map(g => `${g.count}× ${g.enemyId} pv${g.pv}`).join(' + ');
  const used = cells.filter(c => c.shapeIdx === i).length;
  console.log(
    `   ${SHAPES[i].label.padEnd(9)} ${comp.padEnd(42)} línia de base ${s.byCompany.map(w => exact(w)).join('/')}`
    + `  → ${used}/${s.byCompany.length} cel·les${s.capped ? ' (solve amb topall)' : ''}`,
  );
}
const dropped = saturatedCells();
if (dropped.length) {
  console.log(
    `\n   ${dropped.length} cel·les descartades per saturació (fora de ${exact(SATURATION.min)}–${exact(SATURATION.max)}): `
    + dropped.map(c => `${c.label} ${exact(c.baseline)}`).join(', '),
  );
}
console.log(`   ${cells.length} cel·les utilitzables.\n`);

const reports = subjects.map(s => { const r = analyze(s, GAMES); printReport(r); return r; });

// --- The roll-up ------------------------------------------------------------
// Folded in from the old `measure-verdict.ts`, which asked the same question at
// party level with its own setup and its own sample size — a second answer to
// requirement 3 that could disagree with this one. One measurement, one answer.
if (reports.length > 1) {
  console.log('\n━━ RESUM ━━');
  console.log('  kit                    vs neutre    1.nivell  2.durada  3.pensar  3b.1carta  4/5.cartes  7.correl');
  for (const r of reports) {
    const top = r.levels[r.levels.length - 1].run;
    const d = top.delta * 100;
    const m = (v: Verdict) => (v.ok ? '   ✅   ' : '   ❌   ');
    console.log(
      `  ${subjectName(r.subject).padEnd(22)} ${((d >= 0 ? '+' : '') + d.toFixed(1) + 'pp').padStart(8)}    `
      + `${m(r.monotonicity)}  ${m(r.duration)}  ${m(r.spam)}  ${m(r.oneTrick)}   ${m(r.cardUse)}    ${m(r.correlation)}`,
    );
  }
  const failsSpam = reports.filter(r => !r.spam.ok).map(r => subjectName(r.subject));
  console.log('');
  if (failsSpam.length === 0) {
    console.log('  VEREDICT: pensar bat qualsevol estratègia sense pensar, a tots els kits.');
    console.log('  → el triangle d\'estratègia no és decoració.');
  } else {
    console.log(`  VEREDICT: ${failsSpam.length}/${reports.length} kits no superen una estratègia sense pensar`);
    console.log(`  per ${MINDLESS_MARGIN * 100}pp — ${failsSpam.join(', ')}.`);
    console.log('  → en aquests kits, les decisions amb prou feines importen.');
  }
}
console.log('');
