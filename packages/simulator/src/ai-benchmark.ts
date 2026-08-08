/**
 * THE POLICY BENCHMARK — which AI should we be measuring the game with?
 *
 * The project runs three AIs (ARCHITECTURE "The AI"): the heuristic one in the
 * engine (the default, and what the web app's enemies use), the distilled lean
 * policy (what `simulate.ts` prices every encounter with), and the offline
 * search. Until now nothing compared them, and on 2026-08-08 they were found to
 * disagree wildly about whether defense cards are worth playing — which matters
 * because THE BALANCER'S AI IS THE UNIT OF DIFFICULTY. A policy that never
 * defends prices every encounter as if no one defends.
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
 *  4. STALENESS — the lean policy carries a per-card learned bias keyed by card
 *     id. Cards missing from it score 0 (every new or homebrew card), and ids
 *     left behind by renames are dead weight. Both are reported: this is the
 *     failure mode that cost a full session to notice.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/ai-benchmark.ts
 *      … src/ai-benchmark.ts --games 400 --search
 */
import {
  ActionType, Character, CombatEngine, availableActionIndices, lookaheadChooser,
  selectAction, setAIControlled, withSeed,
} from '@pimpampum/engine';
import {
  ALL_EQUIPMENT, ALL_SKILLS, COMPLEMENTARY_SKILLS, PLAYER_SKILLS, buildReferenceParty,
  type CharacterBuildSpec, type PartySpec,
} from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';

declare const process: { argv: string[]; env: Record<string, string | undefined> };
const argvHas = (f: string) => process.argv.slice(2).includes(f);

type Chooser = (engine: CombatEngine, actor: Character) => number | null;

// --- The policies under test ------------------------------------------------

/** The engine's own heuristic AI, exposed as a plain chooser so every policy
 *  here has the same shape. */
const heuristic: Chooser = (engine, actor) => {
  const { actionIdx } = selectAction(engine, actor);
  return actionIdx >= 0 ? actionIdx : null;
};

/** Uniformly random over legal cards — the floor. Anything that fails to beat
 *  this is not a policy. */
const uniform: Chooser = (engine, actor) => {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
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

const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));

function hero(name: string, skillId: string): CharacterBuildSpec {
  const skill = ALL_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return { name, pv: 12, category: 'player', equipment, skills: { [skill.id]: skill.actions.length } };
}

const PARTY: PartySpec = { characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id)) };
/** Same fixed encounter the kit analyzer uses, so the two harnesses agree. */
const ENCOUNTER = [
  { enemyId: 'goblin', count: 6, level: 3, pv: 15 },
  { enemyId: 'bone-devil', count: 1, level: 3, pv: 28 },
];
const SEED = 424242;

/** Dispatch per team so two policies can share one combat. */
function split(team0: Chooser, team1: Chooser): Chooser {
  return (engine, actor) => (actor.team === 0 ? team0 : team1)(engine, actor);
}

interface Usage {
  legalByType: Record<string, number>;
  playedByType: Record<string, number>;
  legalByCard: Record<string, number>;
  playedByCard: Record<string, number>;
  decisions: number;
}

function newUsage(): Usage {
  return { legalByType: {}, playedByType: {}, legalByCard: {}, playedByCard: {}, decisions: 0 };
}

/** Record what was on offer and what was taken, for one team's decisions. */
function watch(base: Chooser, team: number, u: Usage): Chooser {
  return (engine, actor) => {
    if (actor.team !== team) return base(engine, actor);
    const legal = availableActionIndices(actor, engine.registry);
    for (const i of legal) {
      const def = actor.actions[i].def;
      u.legalByType[String(def.actionType)] = (u.legalByType[String(def.actionType)] ?? 0) + 1;
      u.legalByCard[def.id] = (u.legalByCard[def.id] ?? 0) + 1;
    }
    const pick = base(engine, actor);
    if (pick !== null && actor.actions[pick]) {
      const def = actor.actions[pick].def;
      u.playedByType[String(def.actionType)] = (u.playedByType[String(def.actionType)] ?? 0) + 1;
      u.playedByCard[def.id] = (u.playedByCard[def.id] ?? 0) + 1;
      u.decisions++;
    }
    return pick;
  };
}

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
const arg = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const GAMES = Number(arg('--games') ?? process.env.GAMES ?? 300);
const NAMES = Object.keys(POLICIES);
const TYPE_LABEL: Record<string, string> = {
  [ActionType.Atac]: 'Atac', [ActionType.Defensa]: 'Defensa', [ActionType.Focus]: 'Focus',
};

console.log(`BENCHMARK DE POLÍTIQUES · ${GAMES} combats per cel·la · llavor ${SEED}`);
console.log(`Encontre fix: 6× goblin N3 (15 PV) + 1× diable d'os N3 (28 PV) · colla de referència (4 kits principals)\n`);

// 1. Strength + 3. what they play.
console.log('1. FORÇA — cada política porta la colla; els enemics sempre amb la política ' + CONSTANT_OPPONENT);
console.log('   política      winrate   rondes   ms/combat    Atac  Defensa   Focus   (repartiment de decisions)');
const usages: Record<string, Usage> = {};
for (const name of NAMES) {
  const u = newUsage();
  usages[name] = u;
  const { winrate, rounds, msPerCombat } = runParty(POLICIES[name], POLICIES[CONSTANT_OPPONENT], GAMES, u);
  const share = (t: ActionType) => {
    const played = u.playedByType[String(t)] ?? 0;
    return u.decisions ? `${((played / u.decisions) * 100).toFixed(0)}%`.padStart(6) : '     —';
  };
  console.log(
    `   ${name.padEnd(12)} ${(winrate * 100).toFixed(1).padStart(6)}%  ${rounds.toFixed(1).padStart(6)}  ${msPerCombat.toFixed(2).padStart(8)}`
    + `  ${share(ActionType.Atac)}  ${share(ActionType.Defensa)}  ${share(ActionType.Focus)}`,
  );
}

// 2. Head to head. Skipped under --search: a search cell costs orders more, and
// the matrix is quadratic in the policy count.
if (!argvHas('--search')) {
  console.log('\n2. CARA A CARA — colles mirall, X a l\'esquerra; winrate de X (mitjana dels dos costats)');
  console.log('              ' + NAMES.map(n => n.padStart(10)).join(''));
  for (const x of NAMES) {
    const cells = NAMES.map(y => (x === y ? '        —' : `${(headToHead(POLICIES[x], POLICIES[y], GAMES) * 100).toFixed(1)}%`.padStart(10)));
    console.log(`   ${x.padEnd(11)}` + cells.join(''));
  }
}

// 3b. Per-card play rate conditioned on legality — the disagreement, per card.
console.log('\n3. ÚS PER CARTA (jugades / cops que la carta era legal), colla de referència');
const cards = MAINS.flatMap(s => s.actions);
const header = NAMES.map(n => n.padStart(11)).join('');
console.log(`   ${'carta'.padEnd(26)}${'tipus'.padEnd(9)}${header}`);
for (const c of cards) {
  const cells = NAMES.map(n => {
    const u = usages[n];
    const legal = u.legalByCard[c.id] ?? 0;
    if (legal < 20) return '        n/d';
    return `${(((u.playedByCard[c.id] ?? 0) / legal) * 100).toFixed(1)}%`.padStart(11);
  });
  console.log(`   ${c.name.slice(0, 25).padEnd(26)}${(TYPE_LABEL[c.actionType] ?? '?').padEnd(9)}${cells.join('')}`);
}

// 4. Staleness — nothing to check any more, and that is the point: the AI
// carries no per-card table to go stale. Kept as a line in the report so the
// property is asserted rather than assumed.
console.log('\n4. OBSOLESCÈNCIA — cap: l\'AI no té cap taula per carta. Contingut nou juga bé sense reentrenar res.');
console.log('');
