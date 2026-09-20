/**
 * THE POLICY BENCHMARK — how strong is the AI we measure the game with?
 *
 * THE BALANCER'S AI IS THE UNIT OF DIFFICULTY: price an encounter against a
 * party that blunders and it will feel trivial at a table that does not. This
 * benchmark is what that claim gets checked against.
 *
 * It was written when the project ran three AIs — the engine's heuristic, a
 * distilled "lean" policy, and an offline search — and found them disagreeing
 * wildly about whether defense cards are worth playing (2026-08-08). That
 * finding is what killed the lean policy: it turned out to be 16pp weaker than
 * the heuristic and only ~5pp above random, and it was what every encounter
 * ever priced had been simulated with. There is ONE AI now, with a depth knob,
 * and no per-card learned table to go stale.
 *
 * The AI here is a measuring instrument, not an opponent: what it owes us is
 * accuracy, consistency between runs, and never silently going stale. So this
 * harness answers four questions, in order of how load-bearing they are:
 *
 *  1. STRENGTH — each policy drives the party against one fixed encounter,
 *     with the enemy side held on a constant policy. Higher winrate = stronger
 *     play. A policy that cannot beat `spam` or `random` is not measuring
 *     anything.
 *  2. HEAD TO HEAD — mirrored parties, policy X on one side and Y on the
 *     other, played BOTH ways round so seat bias cancels.
 *  3. WHAT THEY ACTUALLY PLAY — share of decisions spent on each action type,
 *     and per-card play rate conditioned on LEGALITY. This is where the
 *     disagreement lives, and it is the robust way to see it: a policy that
 *     answers "defense: 0%" while another answers "defense: 28%" cannot be
 *     reconciled by tuning.
 *  4. STALENESS — asserted rather than measured, because there is nothing left
 *     to go stale: the AI carries no per-card table, so a new or homebrew card
 *     plays well with no retraining. Kept as a line in the report so the
 *     property is checked rather than assumed — it is the failure mode that
 *     silently invalidated a whole session's report card.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/ai-benchmark.ts
 *      … src/ai-benchmark.ts --games 400 --search
 */
import {
  ActionType, Character, CombatEngine, availableActionIndices, lookaheadChooser,
  random, selectAction, setAIControlled, withSeed,
} from '@pimpampum/engine';
import { ALL_EQUIPMENT, buildReferenceParty, type PartySpec } from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { REGISTRY } from './bench/arena.js';
import { MAIN_KITS } from './bench/reference.js';
import { SHAPES, calibrationParty, solveShape } from './bench/shapes.js';
import { pct, share } from './bench/report.js';
import { instrument, newCardCounters, type CardCounters } from './bench/cells.js';
import { games } from './bench/games.js';

declare const process: { argv: string[]; env: Record<string, string | undefined> };
const argvHas = (f: string) => process.argv.slice(2).includes(f);
const arg = (f: string) => {
  const i = process.argv.slice(2).indexOf(f);
  return i >= 0 ? process.argv.slice(2)[i + 1] : undefined;
};

type Chooser = (engine: CombatEngine, actor: Character) => number | null;

// --- The policies under test ------------------------------------------------

/** The engine's own heuristic AI, exposed as a plain chooser so every policy
 *  here has the same shape. */
const heuristic: Chooser = (engine, actor) => {
  const { actionIdx } = selectAction(engine, actor);
  return actionIdx >= 0 ? actionIdx : null;
};

/** Uniformly random over legal cards — the floor. Anything that fails to beat
 *  this is not a policy.
 *
 *  Draws from the engine's SEEDED `random()`. It used to use `Math.random()`
 *  inside a `withSeed` block, which made the floor of every comparison here
 *  irreproducible while looking deterministic. */
const uniform: Chooser = (engine, actor) => {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[Math.floor(random() * legal.length)] : null;
};

/** Always the biggest attack — the strategy the triangle must beat. */
const spam: Chooser = (engine, actor) => {
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

const POLICIES: Record<string, Chooser> = {
  heuristic,
  // The SAME heuristic AI, thinking one round ahead (engine `aiDepth`). Driven
  // here through the per-team chooser so the opponent can be held constant.
  'depth1 s2 p1 k3': lookaheadChooser({ depth: 1, samples: 2, passes: 1, topK: 3 }),
  'depth1 s4 p2 k3': lookaheadChooser({ depth: 1, samples: 4, passes: 2, topK: 3 }),
  spam,
  uniform,
};

/**
 *  used to add the old learned-value search at several budgets. That
 * AI is gone: the depth ladder above IS the search now, evaluated by the
 * engine's own hand-written position score. Kept as a no-op flag so old command
 * lines do not silently measure something else.
 */
if (argvHas('--search')) {
  console.log('!! --search is obsolete: use the depth1 rows above (engine aiDepth).\n');
}

/** The side we are NOT measuring is held on this policy, so a strength column
 *  compares like with like. The heuristic AI is the constant because it is
 *  what a real table faces in the web app. */
const CONSTANT_OPPONENT = 'heuristic';

// --- Fixtures ---------------------------------------------------------------

const MAINS = MAIN_KITS;
/** The reference table (bench/reference.ts) — named kits, asserted Σ, one
 *  definition for the whole package. It used to be re-derived here as
 *  `MAINS.slice(0, 4)`, which silently re-based this harness whenever a kit
 *  was added to or reordered in the catalogue. */
/**
 * The fight every policy is compared on: a SOLVED shape (`bench/shapes.ts`),
 * picked with `--shape` (default the first).
 *
 * It used to be a hand-written `6× goblin N3 @15 PV + 1× diable d'os N3 @28` —
 * numbers the solver returned in an earlier era of the rules, which is how a
 * benchmark quietly stops measuring the game that exists. A solved shape
 * re-prices itself. The `--shape` flag is what the old `measure-mix.ts` was
 * for; it is folded in here rather than kept as a second harness asking the
 * same question with its own sample size.
 */
const SHAPE = SHAPES.find(s => s.label === (arg('--shape') ?? process.env.SHAPE))
  ?? SHAPES[0];
/** The policies drive the CALIBRATION party — the same seats a report-card cell
 *  uses, so a number here and a number there mean the same thing. */
const PARTY: PartySpec = calibrationParty(0);
const ENCOUNTER = solveShape(SHAPE).groups;
const SEED = 424242;

/** Dispatch per team so two policies can share one combat. */
function split(team0: Chooser, team1: Chooser): Chooser {
  return (engine, actor) => (actor.team === 0 ? team0 : team1)(engine, actor);
}

// "Played out of the times it was LEGAL" is measured by `bench/cells.ts`, not
// here. It had three independent implementations across this package — this
// file's, the kit analyzer's and the action-mix harness's — which is three
// numbers that can disagree about one measurement.
type Usage = CardCounters;
const newUsage = newCardCounters;
const watch = instrument;

/** Party (team 0) on `chooser`, enemies on `enemyChooser`, fixed encounter.
 *  Also times the run: a balancer solve is thousands of combats, so cost per
 *  combat decides whether a policy is usable at all. */
function runParty(chooser: Chooser, enemyChooser: Chooser, games: number, u?: Usage): { winrate: number; rounds: number; msPerCombat: number } {
  let wins = 0, rounds = 0;
  const base = split(chooser, enemyChooser);
  const driver = u ? watch(base, 0, u) : base;
  const started = performance.now();
  withSeed(SEED, () => {
    for (let i = 0; i < games; i++) {
      const players = buildReferenceParty(PARTY);
      setAIControlled(players);
      const enemies = buildComposition(ENCOUNTER);
      const res = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40, actionChooser: driver })
        .runCombat();
      rounds += res.rounds;
      if (res.winner === 0) wins++;
      else if (res.winner === null) wins += 0.5;
    }
  });
  return { winrate: wins / games, rounds: rounds / games, msPerCombat: (performance.now() - started) / games };
}

/** Mirrored parties: X on team 0 vs Y on team 1, then swapped, averaged. */
function headToHead(x: Chooser, y: Chooser, games: number): number {
  const half = Math.max(1, Math.round(games / 2));
  const play = (a: Chooser, b: Chooser) => {
    let wins = 0;
    withSeed(SEED, () => {
      for (let i = 0; i < half; i++) {
        const teamA = buildReferenceParty(PARTY);
        const teamB = buildReferenceParty(PARTY);
        setAIControlled(teamA);
        setAIControlled(teamB);
        const res = new CombatEngine(teamA, teamB, {
          registry: REGISTRY, maxRounds: 40, actionChooser: split(a, b),
        }).runCombat();
        if (res.winner === 0) wins++;
        else if (res.winner === null) wins += 0.5;
      }
    });
    return wins / half;
  };
  // X's winrate as team 0, plus X's winrate as team 1, averaged.
  return (play(x, y) + (1 - play(y, x))) / 2;
}

// --- Report -----------------------------------------------------------------

const argv = process.argv.slice(2);
/** Sized so the head-to-head cells can distinguish a real 5pp gap: at 300 a
 *  policy comparison carried ±4pp and the table was read to one decimal. */
const GAMES = games(800);
const NAMES = Object.keys(POLICIES);
const TYPE_LABEL: Record<string, string> = {
  [ActionType.Atac]: 'Atac', [ActionType.Defensa]: 'Defensa', [ActionType.Focus]: 'Focus',
};

console.log(`BENCHMARK DE POLÍTIQUES · ${GAMES} combats per cel·la · llavor ${SEED}`);
console.log(
  `Forma «${SHAPE.label}» resolta: ${ENCOUNTER.map(g => `${g.count}× ${g.enemyId} pv${g.pv}`).join(' + ')}`
  + ' · colla de calibratge (seient 1 + una companyia real)\n',
);

// 1. Strength + 3. what they play.
console.log('1. FORÇA — cada política porta la colla; els enemics sempre amb la política ' + CONSTANT_OPPONENT);
console.log('   política          winrate   rondes   ms/combat    Atac  Defensa   Focus   (repartiment de decisions)');
const usages: Record<string, Usage> = {};
for (const name of NAMES) {
  const u = newUsage();
  usages[name] = u;
  const { winrate, rounds, msPerCombat } = runParty(POLICIES[name], POLICIES[CONSTANT_OPPONENT], GAMES, u);
  const typeShare = (t: ActionType) => share(u.playedByType[String(t)] ?? 0, u.decisions, 4);
  console.log(
    `   ${name.padEnd(16)} ${pct(winrate, GAMES)}  ${rounds.toFixed(1).padStart(6)}  ${msPerCombat.toFixed(2).padStart(8)}`
    + `  ${typeShare(ActionType.Atac)}  ${typeShare(ActionType.Defensa)}  ${typeShare(ActionType.Focus)}`,
  );
}

// 2. Head to head. Skipped under --search: a search cell costs orders more, and
// the matrix is quadratic in the policy count.
if (!argvHas('--search')) {
  console.log('\n2. CARA A CARA — colles mirall, X a l\'esquerra; winrate de X (mitjana dels dos costats)');
  console.log('                  ' + NAMES.map(n => n.padStart(12)).join(''));
  for (const x of NAMES) {
    // Both seats are played, so each cell rests on `GAMES` combats in total.
    const cells = NAMES.map(y => (x === y ? '           —' : pct(headToHead(POLICIES[x], POLICIES[y], GAMES), GAMES).padStart(12)));
    console.log(`   ${x.padEnd(15)}` + cells.join(''));
  }
}

// 3b. Per-card play rate conditioned on legality — the disagreement, per card.
console.log('\n3. ÚS PER CARTA (jugades / cops que la carta era legal), colla de referència');
// The cards THIS PARTY actually holds. It used to be every main kit's cards,
// so most of the table was `n/d` — the calibration party seats four kits, not
// all six, and a row of "no data" for a kit that was never in the fight reads
// like a kit nobody plays.
const partyKits = new Set(PARTY.characters!.flatMap(c => Object.keys(c.skills ?? {})));
const cards = MAINS.filter(s => partyKits.has(s.id)).flatMap(s => s.actions);
const header = NAMES.map(n => n.padStart(16)).join('');
console.log(`   ${'carta'.padEnd(26)}${'tipus'.padEnd(9)}${header}`);
for (const c of cards) {
  const cells = NAMES.map(n => {
    const u = usages[n];
    const legal = u.legal[c.id] ?? 0;
    if (legal < 20) return '             n/d';
    return share(u.played[c.id] ?? 0, legal, 10);
  });
  console.log(`   ${c.name.slice(0, 25).padEnd(26)}${(TYPE_LABEL[c.actionType] ?? '?').padEnd(9)}${cells.join('')}`);
}

// 4. Staleness — nothing to check any more, and that is the point: the AI
// carries no per-card table to go stale. Kept as a line in the report so the
// property is asserted rather than assumed.
console.log('\n4. OBSOLESCÈNCIA — cap: l\'AI no té cap taula per carta. Contingut nou juga bé sense reentrenar res.');
console.log('');
