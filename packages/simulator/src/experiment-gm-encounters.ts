/**
 * 100 encounters, asked for exactly the way a GM asks for them.
 *
 * The inputs are the ones the web creator collects: a real party, a
 * composition (species / how many / what level) and a target winrate. The
 * balancer supplies the only output it owns — the PV per body — and reports
 * the winrate it thinks it achieved.
 *
 * Then every solved encounter is REPLAYED under an independent seed, so the
 * promised winrate is checked against a fresh measurement rather than against
 * the sample the search steered on.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-gm-encounters.ts
 */
import {
  ENEMY_DEFINITIONS, getEnemy, fullKitLevel,
  solveEncounter, simulateEncounter, TARGET_WINRATES,
  type PoolSpec, type FieldedGroup, type SolvedEncounter,
} from '@pimpampum/enemies';
import { PLAYER_SKILLS, COMPLEMENTARY_SKILLS, type PartySpec, type CharacterBuildSpec } from '@pimpampum/skills';

// --- The party a GM would have entered --------------------------------------
// Four heroes on four different MAIN kits at level 5, PV 12, leather + shield,
// and an axe for the kits whose cards need a weapon. This is what the web app
// seeds and what a table actually looks like.
const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));

function hero(name: string, skillId: string, level = 5): CharacterBuildSpec {
  const skill = PLAYER_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return {
    name, pv: 12,
    skills: { [skill.id]: Math.min(skill.actions.length, level) },
    equipment,
    category: 'player',
  };
}

const PARTY: PartySpec = {
  characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id)),
};

// --- The 100 requests --------------------------------------------------------
interface Request {
  label: string;
  kind: 'solo' | 'grup' | 'eixam' | 'mixt';
  pool: PoolSpec[];
  difficulty: keyof typeof TARGET_WINRATES;
}

const SPECIES = ENEMY_DEFINITIONS.map(d => d.id);
const SMALL = ['goblin', 'goblin-shaman', 'wolf', 'spined-devil'];
const DIFFS = Object.keys(TARGET_WINRATES) as (keyof typeof TARGET_WINRATES)[];
const lvl = (id: string) => fullKitLevel(getEnemy(id)!);
const nameOf = (id: string) => getEnemy(id)!.displayName;

const MIXES: { label: string; pool: PoolSpec[] }[] = [
  { label: 'Goblin ×4 + Xaman', pool: [{ enemyId: 'goblin', count: 4, level: lvl('goblin') }, { enemyId: 'goblin-shaman', count: 1, level: lvl('goblin-shaman') }] },
  { label: 'Llop ×3 + Basilisc', pool: [{ enemyId: 'wolf', count: 3, level: lvl('wolf') }, { enemyId: 'basilisk', count: 1, level: lvl('basilisk') }] },
  { label: 'Diables espinosos ×4 + Banyut', pool: [{ enemyId: 'spined-devil', count: 4, level: lvl('spined-devil') }, { enemyId: 'horned-devil', count: 1, level: lvl('horned-devil') }] },
  { label: "Gòlem + Diable d'Os ×2", pool: [{ enemyId: 'stone-golem', count: 1, level: lvl('stone-golem') }, { enemyId: 'bone-devil', count: 2, level: lvl('bone-devil') }] },
  { label: 'Goblin ×6 + Llop ×2', pool: [{ enemyId: 'goblin', count: 6, level: lvl('goblin') }, { enemyId: 'wolf', count: 2, level: lvl('wolf') }] },
];

const REQUESTS: Request[] = [];
for (const d of DIFFS) {
  for (const id of SPECIES) {
    REQUESTS.push({ label: `1× ${nameOf(id)}`, kind: 'solo', difficulty: d, pool: [{ enemyId: id, count: 1, level: lvl(id) }] });
    REQUESTS.push({ label: `3× ${nameOf(id)}`, kind: 'grup', difficulty: d, pool: [{ enemyId: id, count: 3, level: lvl(id) }] });
  }
  for (const id of SMALL) {
    REQUESTS.push({ label: `6× ${nameOf(id)}`, kind: 'eixam', difficulty: d, pool: [{ enemyId: id, count: 6, level: lvl(id) }] });
  }
  for (const m of MIXES) {
    REQUESTS.push({ label: m.label, kind: 'mixt', difficulty: d, pool: m.pool });
  }
}

// --- Run ---------------------------------------------------------------------
const VERIFY_GAMES = 500;
const VERIFY_SEED = 987654321;      // independent of the solver's own seed

interface Row {
  req: Request;
  target: number;
  solved: SolvedEncounter | null;
  verified: number;
  rounds: number;
  bodies: number;
  maxPV: number;
}

const rows: Row[] = [];
console.log(`Party: ${PARTY.characters!.map(c => `${Object.keys(c.skills)[0]} ${Object.values(c.skills)[0]}`).join(', ')}`);
console.log(`${REQUESTS.length} encontres · verificats amb ${VERIFY_GAMES} combats i llavor independent\n`);

const t0 = Date.now();
REQUESTS.forEach((req, i) => {
  const target = TARGET_WINRATES[req.difficulty];
  const solved = solveEncounter(req.pool, PARTY, target);
  let verified = NaN, rounds = NaN, bodies = 0, maxPV = 0;
  if (solved) {
    const fielded: FieldedGroup[] = solved.groups.map(g => ({ enemyId: g.enemyId, count: g.count, level: g.level, pv: g.pv }));
    const check = simulateEncounter(fielded, PARTY, { games: VERIFY_GAMES, seed: VERIFY_SEED });
    verified = check.winrate;
    rounds = check.avgRounds;
    bodies = solved.groups.reduce((n, g) => n + g.count, 0);
    maxPV = Math.max(...solved.groups.map(g => g.pv));
  }
  rows.push({ req, target, solved, verified, rounds, bodies, maxPV });
  if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${REQUESTS.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
});

// --- Report ------------------------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

console.log('\n' + '='.repeat(96));
console.log(pad('ENCONTRE', 30) + pad('DIF', 7) + pad('PV/cos', 9) + pad('promès', 9) + pad('real', 9) + pad('error', 8) + 'rondes');
console.log('='.repeat(96));
for (const r of rows) {
  if (!r.solved) { console.log(pad(r.req.label, 30) + pad(r.req.difficulty, 7) + 'SENSE SOLUCIÓ'); continue; }
  const err = r.verified - r.target;
  console.log(
    pad(r.req.label, 30)
    + pad(r.req.difficulty, 7)
    + pad(r.solved.groups.map(g => String(g.pv)).join('/'), 9)
    + pad(pct(r.solved.predictedWinrate), 9)
    + pad(pct(r.verified), 9)
    + pad(`${err >= 0 ? '+' : ''}${(err * 100).toFixed(0)}pp`, 8)
    + r.rounds.toFixed(1)
    + (r.solved.clamped ? '  [clamped]' : ''),
  );
}

// --- Aggregates --------------------------------------------------------------
const ok = rows.filter(r => r.solved);
const errs = ok.map(r => Math.abs(r.verified - r.target));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const quantile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// A duration-capped solve is a REFUSAL, not a miss: the solver was asked for a
// difficulty only reachable by dragging the fight out, and said so. Scoring it
// as calibration error would hide the thing that actually matters — whether
// the solver still hits the target when it is free to.
const capped = ok.filter(r => r.solved!.durationCapped);
const free = ok.filter(r => !r.solved!.durationCapped);
const freeErrs = free.map(r => Math.abs(r.verified - r.target));

console.log('\n' + '='.repeat(96));
console.log(`CALIBRATGE quan el pressupost de rondes NO lliga  (${free.length}/${ok.length} encontres)`);
if (freeErrs.length) {
  console.log(`  mitjana ${(mean(freeErrs) * 100).toFixed(1)}pp · mediana ${(quantile(freeErrs, 0.5) * 100).toFixed(1)}pp `
    + `· p90 ${(quantile(freeErrs, 0.9) * 100).toFixed(1)}pp · màxim ${(Math.max(...freeErrs) * 100).toFixed(1)}pp`);
  console.log(`  dins de ±5pp: ${freeErrs.filter(e => e <= 0.05).length}/${freeErrs.length}`
    + ` · dins de ±10pp: ${freeErrs.filter(e => e <= 0.10).length}/${freeErrs.length}`);
}
console.log(`\nREBUTJATS pel pressupost de rondes: ${capped.length}/${ok.length}`);
if (capped.length) {
  console.log(`  surten ${(mean(capped.map(r => r.verified - r.target)) * 100).toFixed(0)}pp més fàcils del que es demanava`
    + ` (el combat més dur que hi cap)`);
}
console.log(`\nCALIBRATGE global, comptant els rebuigs com a error`);
console.log(`  mitjana ${(mean(errs) * 100).toFixed(1)}pp · mediana ${(quantile(errs, 0.5) * 100).toFixed(1)}pp `
  + `· màxim ${(Math.max(...errs) * 100).toFixed(1)}pp`);
console.log(`  clamped: ${ok.filter(r => r.solved!.clamped).length}/${ok.length}`);

console.log('\nDURADA  (objectiu de disseny: ≤5 rondes)');
const rounds = ok.map(r => r.rounds);
console.log(`  mitjana ${mean(rounds).toFixed(1)} · mediana ${quantile(rounds, 0.5).toFixed(1)} `
  + `· p90 ${quantile(rounds, 0.9).toFixed(1)} · màxim ${Math.max(...rounds).toFixed(1)}`);
console.log(`  ≤5 rondes: ${rounds.filter(x => x <= 5).length}/${rounds.length}`
  + ` · >10 rondes: ${rounds.filter(x => x > 10).length}/${rounds.length}`);

console.log('\nPV PER COS  (un heroi en té 12)');
const pvs = ok.map(r => r.maxPV);
console.log(`  mitjana ${mean(pvs).toFixed(1)} · mediana ${quantile(pvs, 0.5)} · màxim ${Math.max(...pvs)}`);

console.log('\nPER TIPUS DE COMPOSICIÓ');
for (const kind of ['solo', 'grup', 'eixam', 'mixt'] as const) {
  const g = ok.filter(r => r.req.kind === kind);
  if (!g.length) continue;
  console.log(`  ${pad(kind, 7)} error ${(mean(g.map(r => Math.abs(r.verified - r.target))) * 100).toFixed(1)}pp`
    + ` · rondes ${mean(g.map(r => r.rounds)).toFixed(1)}`
    + ` · PV/cos ${mean(g.map(r => r.maxPV)).toFixed(0)}`);
}

console.log('\nPER DIFICULTAT');
for (const d of DIFFS) {
  const g = ok.filter(r => r.req.difficulty === d);
  console.log(`  ${pad(d, 7)} demanat ${pct(TARGET_WINRATES[d])}`
    + ` · real ${pct(mean(g.map(r => r.verified)))}`
    + ` · error ${(mean(g.map(r => Math.abs(r.verified - r.target))) * 100).toFixed(1)}pp`
    + ` · rondes ${mean(g.map(r => r.rounds)).toFixed(1)}`);
}

console.log('\nPITJORS 10 DESVIACIONS');
[...ok].sort((a, b) => Math.abs(b.verified - b.target) - Math.abs(a.verified - a.target)).slice(0, 10)
  .forEach(r => console.log(`  ${pad(r.req.label, 30)} ${pad(r.req.difficulty, 7)}`
    + ` demanat ${pct(r.target)} → real ${pct(r.verified)}`
    + ` (${r.solved!.groups.map(g => g.pv).join('/')} PV, ${r.rounds.toFixed(1)} rondes)`));

console.log(`\nTemps total: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
