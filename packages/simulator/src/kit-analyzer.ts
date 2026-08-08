/**
 * THE KIT ANALYZER (NEXT-STEPS §7) — the regression harness you run after
 * every kit edit. Fix the kit, throw a large seeded sample at it, get back a
 * pass/fail report card.
 *
 * One code path, two modes; they differ only in which side is the SUBJECT:
 *
 *  - `player`: the subject skill sits on hero 1 of an otherwise fixed
 *    reference party, against a fixed reference encounter. Subject winrate =
 *    the party's.
 *  - `enemy`: the subject creature (a fixed count at a fixed PV) faces the
 *    fixed reference party. Subject winrate = the creature's.
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
 *     replayed with the WHOLE subject side impoverished, one way at a time:
 *     random legal cards; and restricted to attacks only, defenses only or
 *     focuses only — still thinking as hard as ever inside that space, which is
 *     the fair form of the question. Defenses-only is the TURTLE, and it is the
 *     triangle's own test: Power is supposed to beat Protect, so a party that
 *     never advances the win condition should lose to one that builds up.
 *     Plus, weaker but useful, "one seat repeats a single card" per card.
 *     The best of all of them is the bar, and the real policy must clear it by
 *     MINDLESS_MARGIN, not by a nose.
 *  4/5. NO DEAD CARDS / NO AUTO-INCLUDES — play rate per card conditioned on
 *     LEGALITY (not on turns), so a card that is rarely playable isn't scored
 *     as if it were always on offer. Both tails fail: never chosen = dominated
 *     or mispriced, always chosen = the decision was removed.
 *  7. NO CARD CORRELATES WITH LOSING — win-when-played per card. Confounded on
 *     its own (a defense gets played when already losing), so it is reported as
 *     a flag to investigate, never as a verdict.
 *
 * Run:
 *   pnpm --filter @pimpampum/simulator exec tsx src/kit-analyzer.ts            # every player kit
 *   … src/kit-analyzer.ts --enemy goblin                                       # one creature
 *   … src/kit-analyzer.ts --player berserk --games 1000
 *   … src/kit-analyzer.ts --all                                                # players + enemies
 */
import {
  ActionDefinition, ActionType, Character, CombatEngine, CombatStats,
  availableActionIndices, lookaheadChooser, newCombatStats, setAIControlled, withSeed,
} from '@pimpampum/engine';
import {
  ALL_SKILLS, COMPLEMENTARY_SKILLS, PLAYER_SKILLS, buildReferenceParty,
  type CharacterBuildSpec, type PartySpec,
} from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, buildComposition, fullKitLevel, getEnemy, solveEncounter,
  type FieldedGroup,
} from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';

declare const process: { argv: string[]; env: Record<string, string | undefined> };

// --- The scenario matrix ----------------------------------------------------
// A kit is never measured against ONE fight. A single reference encounter has
// two failures: it silently goes stale (the 2026-08-08 AI rebuild moved the
// party from 60% to 13-58% on the old one, distorting every reading), and it
// only ever asks how the kit does against that one shape — a kit that shines
// against hordes and folds against a boss reads as fine.
//
// So the subject is thrown at a MATRIX: several fight shapes × several sets of
// allies. The headline is the mean; the spread across shapes is itself
// evidence (§7.1 #10: a kit should have matchups it loses).
const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));

function hero(name: string, skillId: string, level: number): CharacterBuildSpec {
  const skill = ALL_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return {
    name, pv: 12, category: 'player', equipment,
    skills: { [skill.id]: Math.max(1, Math.min(skill.actions.length, level)) },
  };
}

/** Fight SHAPES, not encounters: the PV is solved, never written down here.
 *  Different species per shape so a verdict is never secretly goblin-specific. */
const SHAPES: { label: string; pool: { enemyId: string; count: number }[] }[] = [
  { label: 'horda', pool: [{ enemyId: 'goblin', count: 8 }] },
  { label: 'escamot', pool: [{ enemyId: 'bone-devil', count: 3 }] },
  { label: 'cap', pool: [{ enemyId: 'basilisk', count: 1 }] },
  { label: 'mixt', pool: [{ enemyId: 'goblin', count: 4 }, { enemyId: 'horned-devil', count: 1 }] },
];

/** Sets of allies the subject is measured beside. A kit that only works next to
 *  particular company shows up as spread across these rather than being
 *  averaged away. */
const COMPANY: string[][] = [
  ['mestre-armes', 'volcanic', 'metge'],
  ['berserk', 'earthbender', 'runes'],
  ['nigromant', 'enginyer-explosius', 'gel'],
];

/** Every scenario is solved to THIS winrate against a neutral party, so each
 *  cell is a fair fight by construction. The subject's score is how far above
 *  or below it lands — which never needs re-calibrating when the AI or the
 *  cards move, because the solve moves with them. */
const FAIR = 0.6;

/** Neutral party the shapes are priced against: four mains at full kit, none of
 *  them the subject. */
const NEUTRAL_PARTY: PartySpec = {
  characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id, 5)),
};

/** The subject at `level` in seat 1, with the given company at full kit. */
function partyWith(skillId: string, level: number, company: string[]): PartySpec {
  return {
    characters: [
      hero('Subjecte', skillId, level),
      ...company.map((id, i) => hero(`Company ${i + 1}`, id, 5)),
    ],
  };
}

const SEED = 515000;

/** Solved shapes, priced once and reused for every kit and level. */
const solvedShapes = new Map<string, { groups: FieldedGroup[]; predicted: number; capped: boolean }>();
function shapeGroups(shape: (typeof SHAPES)[number]): { groups: FieldedGroup[]; predicted: number; capped: boolean } {
  const hit = solvedShapes.get(shape.label);
  if (hit) return hit;
  const solved = solveEncounter(shape.pool, NEUTRAL_PARTY, FAIR, { searchGames: 120 });
  const entry = solved
    ? {
      groups: solved.groups.map(g => ({ enemyId: g.enemyId, count: g.count, level: g.level, pv: g.pv })),
      predicted: solved.predictedWinrate,
      capped: solved.durationCapped || solved.clamped,
    }
    : { groups: [] as FieldedGroup[], predicted: 1, capped: true };
  solvedShapes.set(shape.label, entry);
  return entry;
}

// --- Instrumentation --------------------------------------------------------

/** Per-card counters for the subject side: how often each card was LEGAL, and
 *  how often it was then chosen. */
interface CardCounters {
  legal: Record<string, number>;
  played: Record<string, number>;
}

function newCardCounters(): CardCounters {
  return { legal: {}, played: {} };
}

/**
 * Wrap a chooser so every decision the subject side makes records which cards
 * were on offer. Play rate conditioned on legality (requirements 4/5) is
 * otherwise unmeasurable: `CombatStats.actionPlays` counts turns, and a card
 * that is legal one turn in ten looks dead when it is merely rare.
 */
function instrument(
  base: (e: CombatEngine, a: Character) => number | null,
  team: number,
  counters: CardCounters,
) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return base(engine, actor);
    for (const i of availableActionIndices(actor, engine.registry)) {
      const id = actor.actions[i].def.id;
      counters.legal[id] = (counters.legal[id] ?? 0) + 1;
    }
    const pick = base(engine, actor);
    if (pick !== null && actor.actions[pick]) {
      const id = actor.actions[pick].def.id;
      counters.played[id] = (counters.played[id] ?? 0) + 1;
    }
    return pick;
  };
}

/** Uniformly random over legal cards — the "no decisions at all" floor. A kit
 *  whose thought-out play barely beats this is not asking the player anything. */
function uniformChooser(team: number, fallback: (e: CombatEngine, a: Character) => number | null) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return fallback(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
  };
}

/** "Always this one card, whenever it is legal" — the one-trick strategy. Run
 *  once per card in the kit, the BEST of them is the bar the full policy has to
 *  clear by a wide margin: if a single repeated card plays the kit nearly as
 *  well as thinking does, the other cards are decoration. */
function oneCardChooser(team: number, cardId: string, fallback: (e: CombatEngine, a: Character) => number | null) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return fallback(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    const pick = legal.find(i => actor.actions[i].def.id === cardId);
    return pick ?? (legal.length ? fallback(engine, actor) : null);
  };
}

// --- The run ----------------------------------------------------------------

export interface RunResult {
  /** Winrate of the SUBJECT side (draws count as half). */
  winrate: number;
  stderr: number;
  drawRate: number;
  medianRounds: number;
  /** Winrate per fight shape — the SPREAD is evidence in its own right: a kit
   *  should have matchups it loses (§7.1 #10). */
  byShape: { label: string; winrate: number }[];
  p90Rounds: number;
  stats: CombatStats;
  counters: CardCounters;
}

export interface Subject {
  mode: 'player' | 'enemy';
  id: string;
  /** enemy mode only: how many bodies and at what PV. */
  count?: number;
  pv?: number;
}
/**
 * How the SUBJECT SIDE plays a cell. Requirement 3 asks the real policy to beat
 * every impoverished one by a wide margin:
 *
 *  - `uniform`  — nobody thinks at all: random legal cards, whole party.
 *  - `onlyX`    — the WHOLE PARTY is restricted to one action type, but still
 *                 thinks as hard as ever inside it (the lookahead's restrictTo),
 *                 which is the fair form of the question. `onlyDefenses` is the
 *                 turtle: if never advancing the win condition still wins, then
 *                 Power > Protect is not real and the triangle is decoration.
 *  - `oneCard`  — ONE SEAT repeats a single card while the party plays on. A
 *                 weaker claim than the others: it asks whether this kit is
 *                 better used as a one-trick role, not whether thinking matters.
 */
export type CellPolicy =
  | 'policy' | 'uniform'
  | 'onlyAttacks' | 'onlyDefenses' | 'onlyFocus'
  | { oneCard: string };

/** One CELL: the subject at `level`, in one company, against one solved shape. */
function runScenario(
  subject: Subject,
  level: number,
  shapeIdx: number,
  companyIdx: number,
  games: number,
  policy: CellPolicy,
  stats: CombatStats,
  counters: CardCounters,
): { winrate: number; drawRate: number; rounds: number[] } {
  const subjectTeam = subject.mode === 'player' ? 0 : 1;
  // The kit's REAL play: the one AI, thinking a round ahead — the same setting
  // the balancer prices encounters at, so a report card and a difficulty number
  // mean the same thing. The mindless baselines fall back to it whenever their
  // own rule has nothing legal to offer.
  const AI = { depth: 1, samples: 2, passes: 1, topK: 3 };
  const real = lookaheadChooser(AI);
  /** The subject side restricted to one action type, still thinking inside it;
   *  the opposition plays its ordinary game. */
  const restricted = (types: ActionType[]) => {
    const mine = lookaheadChooser({ ...AI, restrictTo: types }, [subjectTeam]);
    return (e: CombatEngine, a: Character) =>
      (a.team === subjectTeam ? mine(e, a) ?? real(e, a) : real(e, a));
  };
  const base = policy === 'policy' ? real
    : policy === 'uniform' ? uniformChooser(subjectTeam, real)
    : policy === 'onlyAttacks' ? restricted([ActionType.Atac])
    : policy === 'onlyDefenses' ? restricted([ActionType.Defensa])
    : policy === 'onlyFocus' ? restricted([ActionType.Focus])
    : oneCardChooser(subjectTeam, policy.oneCard, real);
  const actionChooser = instrument(base, subjectTeam, counters);

  const company = COMPANY[companyIdx % COMPANY.length];
  const spec = subject.mode === 'player'
    ? partyWith(subject.id, level, company)
    : { characters: [hero('Subjecte', company[0], 5), ...company.map((id, i) => hero(`Company ${i + 1}`, id, 5))] };
  const enemies = subject.mode === 'player'
    ? shapeGroups(SHAPES[shapeIdx % SHAPES.length]).groups
    : [{ enemyId: subject.id, count: subject.count!, level, pv: subject.pv! }];

  let wins = 0, draws = 0;
  const rounds: number[] = [];
  withSeed(SEED + shapeIdx * 101 + companyIdx * 17, () => {
    for (let i = 0; i < games; i++) {
      const players = buildReferenceParty(spec);
      setAIControlled(players);
      const res = new CombatEngine(players, buildComposition(enemies), {
        registry: REGISTRY, maxRounds: 40, actionChooser,
      }).runCombat(stats);
      rounds.push(res.rounds);
      if (res.winner === subjectTeam) wins++;
      else if (res.winner === null) { draws++; wins += 0.5; }
    }
  });
  return { winrate: wins / games, drawRate: draws / games, rounds };
}

/**
 * One reading of the kit at `level`: the whole matrix of shapes × companies,
 * averaged. `cells` narrows the matrix — the mindless baselines only need one
 * company, since what they test is the strategy space, not the seating.
 */
export function runCell(
  subject: Subject,
  level: number,
  games: number,
  policy: CellPolicy = 'policy',
  companies = COMPANY.length,
): RunResult {
  const stats = newCombatStats();
  const counters = newCardCounters();
  const shapes = subject.mode === 'player' ? SHAPES.length : 1;
  const perCell = Math.max(10, Math.round(games / (shapes * companies)));

  const byShape: { label: string; winrate: number }[] = [];
  const allRounds: number[] = [];
  let winSum = 0, drawSum = 0, cells = 0;
  for (let s = 0; s < shapes; s++) {
    let shapeWin = 0;
    for (let c = 0; c < companies; c++) {
      const r = runScenario(subject, level, s, c, perCell, policy, stats, counters);
      winSum += r.winrate; drawSum += r.drawRate; shapeWin += r.winrate; cells++;
      allRounds.push(...r.rounds);
    }
    byShape.push({
      label: subject.mode === 'player' ? SHAPES[s].label : 'directe',
      winrate: shapeWin / companies,
    });
  }
  allRounds.sort((a, b) => a - b);
  const winrate = winSum / Math.max(1, cells);
  const n = perCell * Math.max(1, cells);
  return {
    winrate,
    stderr: Math.sqrt(Math.max(winrate * (1 - winrate), 0.01) / n),
    drawRate: drawSum / Math.max(1, cells),
    medianRounds: allRounds[Math.floor(allRounds.length / 2)],
    p90Rounds: allRounds[Math.floor(allRounds.length * 0.9)],
    byShape,
    stats,
    counters,
  };
}

// --- The report card --------------------------------------------------------

export interface Verdict { ok: boolean; detail: string }

export interface KitReport {
  subject: Subject;
  cards: ActionDefinition[];
  levels: { level: number; run: RunResult }[];
  monotonicity: Verdict;
  duration: Verdict;
  spam: Verdict;
  cardUse: Verdict;
  correlation: Verdict;
}

/** Rounds budget from intentions.md: combats should not run past ~5. */
const MAX_MEDIAN_ROUNDS = 5;
const MAX_P90_ROUNDS = 8;
/** A level step below this is a regression; below zero-ish but inside it, flat. */
const REGRESSION_PP = 0.03;
/**
 * Requirement 3's bar. Playing the kit properly must beat every MINDLESS
 * strategy — random legal cards, attack-spam, and repeating any single card —
 * by a wide margin, not by a nose. A kit that only edges past them is a kit
 * whose decisions barely matter, whatever its cards say on paper.
 */
const MINDLESS_MARGIN = 0.20;
/** Play rate (conditioned on legality) outside this band fails 4/5. */
const DEAD_CARD = 0.02;
const AUTO_INCLUDE = 0.85;

export function analyze(subject: Subject, games: number): KitReport {
  const cards = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions
    : getEnemy(subject.id)!.skills.flatMap(s => s.actions);
  const maxLevel = subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === subject.id)!.actions.length
    : fullKitLevel(getEnemy(subject.id)!);

  const levels: { level: number; run: RunResult }[] = [];
  for (let l = 1; l <= maxLevel; l++) levels.push({ level: l, run: runCell(subject, l, games) });

  // 1. Level monotonicity.
  const regressions: string[] = [];
  const flat: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const delta = levels[i].run.winrate - levels[i - 1].run.winrate;
    const label = `${levels[i - 1].level}→${levels[i].level}`;
    if (delta < -REGRESSION_PP) regressions.push(`${label} ${(delta * 100).toFixed(1)}pp`);
    else if (Math.abs(delta) <= 0.01) flat.push(label);
  }
  const totalGain = levels[levels.length - 1].run.winrate - levels[0].run.winrate;
  const monotonicity: Verdict = {
    ok: regressions.length === 0 && totalGain > 0.05,
    detail: regressions.length
      ? `regressions: ${regressions.join(', ')}`
      : `guany total ${(totalGain * 100).toFixed(1)}pp${flat.length ? ` · nivells plans: ${flat.join(', ')}` : ''}`,
  };

  // 2. Duration (read at full kit — the shape players actually field).
  const top = levels[levels.length - 1].run;
  const duration: Verdict = {
    ok: top.medianRounds <= MAX_MEDIAN_ROUNDS && top.p90Rounds <= MAX_P90_ROUNDS && top.drawRate < 0.02,
    detail: `mediana ${top.medianRounds} · p90 ${top.p90Rounds} · taules ${(top.drawRate * 100).toFixed(1)}%`,
  };

  // 3. Every mindless strategy must lose, and lose badly: random cards,
  // attack-spam, and repeating any ONE card of the kit (each tried in turn —
  // the best of them is the bar).
  const baselines: { label: string; winrate: number }[] = [
    // Baselines sweep the fight shapes but only ONE company: what they test is
    // the strategy space, not the seating, and they are run once per card.
    { label: 'atzar', winrate: runCell(subject, maxLevel, games, 'uniform', 1).winrate },
    { label: 'només atacs', winrate: runCell(subject, maxLevel, games, 'onlyAttacks', 1).winrate },
    { label: 'només defenses (tortuga)', winrate: runCell(subject, maxLevel, games, 'onlyDefenses', 1).winrate },
    { label: 'només focus', winrate: runCell(subject, maxLevel, games, 'onlyFocus', 1).winrate },
  ];
  for (const c of cards) {
    if (c.unlockLevel > maxLevel) continue;
    baselines.push({ label: `només ${c.name}`, winrate: runCell(subject, maxLevel, games, { oneCard: c.id }, 1).winrate });
  }
  const toughest = baselines.reduce((a, b) => (b.winrate > a.winrate ? b : a));
  const margin = top.winrate - toughest.winrate;
  const spam: Verdict = {
    ok: margin >= MINDLESS_MARGIN,
    detail: `política ${(top.winrate * 100).toFixed(1)}% vs la millor estratègia sense pensar`
      + ` (${toughest.label}) ${(toughest.winrate * 100).toFixed(1)}% → marge ${(margin * 100).toFixed(1)}pp`
      + ` [cal ≥${MINDLESS_MARGIN * 100}pp]`,
  };

  // 4/5. Play rate conditioned on legality, at full kit.
  const dead: string[] = [];
  const auto: string[] = [];
  for (const c of cards) {
    const legal = top.counters.legal[c.id] ?? 0;
    if (legal < games * 0.1) continue; // too rarely legal to judge
    const rate = (top.counters.played[c.id] ?? 0) / legal;
    if (rate < DEAD_CARD) dead.push(`${c.name} ${(rate * 100).toFixed(1)}%`);
    else if (rate > AUTO_INCLUDE) auto.push(`${c.name} ${(rate * 100).toFixed(0)}%`);
  }
  const cardUse: Verdict = {
    ok: dead.length === 0 && auto.length === 0,
    detail: [dead.length ? `mortes: ${dead.join(', ')}` : '', auto.length ? `automàtiques: ${auto.join(', ')}` : '']
      .filter(Boolean).join(' · ') || 'totes dins la banda',
  };

  // 7. Cards correlating with losing (a flag, not a verdict — confounded).
  const losers: string[] = [];
  for (const c of cards) {
    const plays = top.stats.actionPlays[c.id] ?? 0;
    if (plays < games * 0.2) continue;
    const w = (top.stats.actionWinPlays[c.id] ?? 0) / plays;
    if (w < 0.4) losers.push(`${c.name} ${(w * 100).toFixed(0)}%`);
  }
  const correlation: Verdict = {
    ok: losers.length === 0,
    detail: losers.length ? `correlacionen amb perdre: ${losers.join(', ')}` : 'cap per sota del 40%',
  };

  return { subject, cards, levels, monotonicity, duration, spam, cardUse, correlation };
}

// --- CLI --------------------------------------------------------------------

function printReport(r: KitReport): void {
  const name = r.subject.mode === 'player'
    ? ALL_SKILLS.find(s => s.id === r.subject.id)!.displayName
    : getEnemy(r.subject.id)!.displayName;
  const mark = (v: Verdict) => (v.ok ? '✅' : '❌');
  console.log(`\n━━ ${name} (${r.subject.id}) · mode ${r.subject.mode} ━━`);
  console.log('  nivell   winrate      mediana  p90   taules');
  for (const { level, run } of r.levels) {
    console.log(
      `  ${String(level).padStart(6)}   ${(run.winrate * 100).toFixed(1).padStart(5)}%±${(run.stderr * 100).toFixed(1)}`
      + `   ${String(run.medianRounds).padStart(7)}  ${String(run.p90Rounds).padStart(3)}`
      + `   ${(run.drawRate * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log(`  ${mark(r.monotonicity)} 1. nivell superior = millor kit — ${r.monotonicity.detail}`);
  console.log(`  ${mark(r.duration)} 2. els combats no s'allarguen — ${r.duration.detail}`);
  console.log(`  ${mark(r.spam)} 3. pensar bat qualsevol estratègia sense pensar — ${r.spam.detail}`);
  console.log(`  ${mark(r.cardUse)} 4/5. ni cartes mortes ni automàtiques — ${r.cardUse.detail}`);
  console.log(`  ${mark(r.correlation)} 7. cap carta correlaciona amb perdre — ${r.correlation.detail}`);

  const top = r.levels[r.levels.length - 1].run;
  // The spread across fight shapes: a kit with no bad matchup is as much a
  // problem as one with no good matchup (§7.1 #10).
  if (top.byShape.length > 1) {
    const lo = Math.min(...top.byShape.map(s => s.winrate));
    const hi = Math.max(...top.byShape.map(s => s.winrate));
    console.log(
      `  per forma de combat: ${top.byShape.map(s => `${s.label} ${(s.winrate * 100).toFixed(0)}%`).join(' · ')}`
      + ` (obertura ${((hi - lo) * 100).toFixed(0)}pp)`,
    );
  }
  console.log('  ús per carta (jugades / cops que era legal):');
  for (const c of r.cards) {
    const legal = top.counters.legal[c.id] ?? 0;
    const rate = legal ? (top.counters.played[c.id] ?? 0) / legal : 0;
    console.log(`      ${c.name.padEnd(24)} ${legal ? `${(rate * 100).toFixed(1)}%`.padStart(6) : '   n/d'}`
      + `   (legal ${legal} cops)`);
  }
}

const argv = process.argv.slice(2);
const arg = (flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const GAMES = Number(arg('--games') ?? process.env.GAMES ?? 400);

const subjects: Subject[] = [];
if (arg('--player')) subjects.push({ mode: 'player', id: arg('--player')! });
if (arg('--enemy')) subjects.push({ mode: 'enemy', id: arg('--enemy')!, count: Number(arg('--count') ?? 3), pv: Number(arg('--pv') ?? 20) });
if (subjects.length === 0) {
  for (const s of MAINS) subjects.push({ mode: 'player', id: s.id });
  if (argv.includes('--all')) {
    for (const e of ENEMY_DEFINITIONS) subjects.push({ mode: 'enemy', id: e.id, count: 3, pv: 20 });
  }
}

console.log(`ANALITZADOR DE KITS · ~${GAMES} combats per nivell, repartits per la matriu · llavor ${SEED}`);
console.log(`Matriu: ${SHAPES.length} formes de combat × ${COMPANY.length} companyies. Cada forma es resol al ${FAIR * 100}% contra una colla neutra, així que cada cel·la és un combat just per construcció.\n`);
for (const shape of SHAPES) {
  const s = shapeGroups(shape);
  const comp = s.groups.map(g => `${g.count}× ${g.enemyId} pv${g.pv}`).join(' + ');
  console.log(`   ${shape.label.padEnd(9)} ${comp.padEnd(42)} colla neutra ${(s.predicted * 100).toFixed(0)}%${s.capped ? '  ⚠️ no s\'ha pogut fer just' : ''}`);
}
for (const s of subjects) printReport(analyze(s, GAMES));
console.log('');
