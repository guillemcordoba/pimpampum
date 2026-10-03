/**
 * THE KIT ANALYZER — command line.
 *
 * The analysis itself lives in `@pimpampum/playtest` (`analyze.ts`, warmed by
 * `prepare.ts`), shared with the kit test suites; this file only prints it.
 */
import { ALL_SKILLS, ENEMY_DEFINITIONS, getEnemy } from '@pimpampum/set-fantasy';
import { calibrationDrift, FAIR, MAIN_KITS, REFRESHED, SATURATION, SHAPES, FANTASY } from '@pimpampum/set-fantasy/bench';
import { saturatedCells, usableCells, cacheStatus, exact, games, lanes, pct, share, SMOKE, stderr, useSet, solvedShape, flag } from '@pimpampum/bench';
import {
  analyze, measureTriangle, prepare,
  type KitReport, type Subject, type TriangleReport, type Verdict,
} from '@pimpampum/playtest';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);
{
  // The baselines are measured with the calibration SNAPSHOT, not the live
  // kits: say which live edits they do not reflect yet.
  const drift = calibrationDrift();
  console.log(drift.length
    ? `calibració: instantània del ${REFRESHED}, desfasada per a ${drift.join(', ')} (pnpm calibration:refresh per actualitzar-la)`
    : `calibració: instantània del ${REFRESHED}, al dia amb els kits`);
}

// --- CLI --------------------------------------------------------------------

function subjectName(s: Subject): string {
  return s.mode === 'player'
    ? ALL_SKILLS.find(k => k.id === s.id)!.displayName
    : getEnemy(s.id)!.displayName;
}

/**
 * THE CARD RANKING — every number read off the same per-decision rollouts:
 * at each of the subject's decisions the fight is copied once per legal card,
 * each copy plays its card and the fight out, and the end is scored as our
 * health left minus theirs. Read, never judged (requirement 3 judges the kit).
 *
 *  - VAL VS. LA MÀ: a card's score minus the mean of the other cards at the
 *    same moment, averaged. RELATIVE: it sums to about zero across the hand,
 *    so beside two stars a solid card reads negative.
 *  - MILLOR JUGADA: the share of its moments where it scored highest.
 *  - QUAN ÉS LA MILLOR, GUANYA: in those moments, its lead over the runner-up
 *    (cross-fitted). Low share + big lead = rarely right, decisive when it is.
 *  - LA IA LA TRIA: how often the production AI actually played it when legal.
 */
function printCardRanking(r: KitReport): void {
  const top = r.fullKit;
  const byId = new Map(r.cards.map(c => [c.id, c]));
  console.log('  rànquing de cartes (millor → pitjor)');
  console.log(`  ${'#'.padStart(2)}  ${'carta'.padEnd(24)} ${'val vs. la mà'.padStart(13)}  ${'millor jugada'.padStart(13)}  ${'quan és la millor, guanya'.padStart(25)}  ${'la IA la tria'.padStart(13)}`);
  r.cardValues.forEach((v, i) => {
    const name = byId.get(v.id)?.name ?? v.id;
    const legal = top.counters.legal[v.id] ?? 0;
    const picked = legal ? share(top.counters.played[v.id] ?? 0, legal).trim() : 'n/d';
    const gain = v.gainWhenBest === null ? '—' : `${v.gainWhenBest >= 0 ? '+' : ''}${v.gainWhenBest.toFixed(1)} PV`;
    console.log(
      `  ${String(i + 1).padStart(2)}  ${name.padEnd(24)} ${`${v.value >= 0 ? '+' : ''}${v.value.toFixed(1)} PV`.padStart(13)}`
      + `  ${exact(v.bestShare).padStart(13)}  ${gain.padStart(25)}  ${picked.padStart(13)}`,
    );
  });
  console.log('      val vs. la mà = PV de més que una altra carta qualsevol de la mà, en aquell moment (relatiu: suma ~0)');
  console.log('      millor jugada = cops que va ser la millor opció · quan és la millor, guanya = avantatge sobre la segona');
}

function printReport(r: KitReport): void {
  // Three states, not two: a requirement the harness cannot currently TEST is
  // neither passed nor failed, and rendering it ✅ would claim a check that did
  // not happen.
  const mark = (v: Verdict) => (v.inconclusive ? '➖' : v.ok ? '✅' : '❌');
  console.log(`\n━━ ${subjectName(r.subject)} (${r.subject.id}) · mode ${r.subject.mode} ━━`);
  // The DELTA is the headline: "how much better than a neutral kit, in the same
  // seats". The raw winrate is kept beside it because it is what a reader has
  // in their head — but it is the column that moves when a shape drifts.
  const top = r.fullKit;
  const d = top.delta * 100;
  console.log(
    `  kit complet: ${(d >= 0 ? '+' : '') + d.toFixed(1)}pp±${(top.deltaStderr * 100).toFixed(1)} vs neutre`
    + ` (brut ${pct(top.winrate, top.games).trim()}, ${top.games} combats)`,
  );
  console.log(`  ${mark(r.duration)} 1. els combats acaben — ${r.duration.detail}`);
  console.log(`  ${mark(r.strength)} 2. dins de la banda de poder — ${r.strength.detail}`);
  console.log(`  ${mark(r.choices)} 3. triar importa — ${r.choices.detail}`);
  printCardRanking(r);

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
}

const argv = process.argv.slice(2);
const arg = flag;

/**
 * Default sample for the FULL-KIT RUN — `--games` means this; the card value
 * derives its own fights from it.
 *
 * Sized by requirement 2: 800 combats put the kit's delta at about ±2pp, far
 * inside a ±15pp band, and give the duration's 2% stall bar a σ under half a
 * point.
 */
const DEFAULT_GAMES = 800;
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

console.log(`ANALITZADOR DE KITS · ~${GAMES} combats al kit complet, repartits per la matriu`);
console.log(
  'Cada forma es resol contra una colla amb la MATEIXA FORMA que una cel·la i després es MESURA'
  + ' contra totes les companyies. Les puntuacions són DELTES respecte d\'aquesta línia de base,'
  + ' així que la dificultat de la cel·la i el seient s\'anul·len.',
);
console.log('');

// WARM FIRST, ACROSS THE CORES, THEN MEASURE SERIALLY — the same `prepare`
// the kit test suites use. It fills the cache (calibration first, then every
// cell each analysis will read); the tables and reports below are the same
// serial code as ever and find their answers computed. BEFORE anything reads a
// cell: the calibration table used to come first, and computing it solved
// every shape and baseline serially here, so the parallel warm found nothing
// left to do.
const context = { set: { module: import.meta.resolve('@pimpampum/set-fantasy/bench'), export: 'FANTASY' } };
for (const s of subjects) {
  process.stdout.write(`   escalfant ${s.id} en ${lanes} processos…`);
  await prepare({ ...context, subject: s }, s, GAMES);
  process.stdout.write(' fet\n');
}
console.log('');

const cells = usableCells();
for (let i = 0; i < SHAPES.length; i++) {
  const s = solvedShape(i);
  const comp = s.groups.map(g => `${g.count}× ${g.enemyId} pv${g.pv}`).join(' + ');
  const used = cells.filter(c => c.shapeIdx === i).length;
  console.log(
    `   ${SHAPES[i].label.padEnd(9)} ${comp.padEnd(42)} línia de base ${s.byCompany.map(w => exact(w)).join('/')}`
    + `  → ${used}/${s.byCompany.length} cel·les${s.groups.length === 0 ? ' (sense solució)' : ''}`,
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
console.log(
  `\n(memòria cau: ${cacheStatus.hits} encerts, ${cacheStatus.misses} càlculs`
  + ' — BENCH_NO_CACHE=1 per recalcular-ho tot)',
);

// --- The roll-up ------------------------------------------------------------
if (reports.length > 1) {
  console.log('\n━━ RESUM ━━');
  console.log('  kit                    vs neutre    1.durada  2.banda  3.triar');
  for (const r of reports) {
    const d = r.fullKit.delta * 100;
    const m = (v: Verdict) => (v.inconclusive ? '   ➖   ' : v.ok ? '   ✅   ' : '   ❌   ');
    console.log(
      `  ${subjectName(r.subject).padEnd(22)} ${((d >= 0 ? '+' : '') + d.toFixed(1) + 'pp').padStart(8)}    `
      + `${m(r.duration)} ${m(r.strength)} ${m(r.choices)}`,
    );
  }
}

// --- Requirement 4: the set's triangle, on request ---------------------------
// Set-level and costly (three duels of depth-1 mirrors), so opt-in here; the
// asserting copy is `sets/fantasy/test/triangle.slow.test.ts`.
if (argv.includes('--triangle')) {
  const t: TriangleReport = measureTriangle();
  console.log(`\n━━ 4. TRIANGLE D'ESTRATÈGIA ${t.ok ? '✅' : '❌'} ━━`);
  for (const e of t.edges) {
    console.log(`  ${(e.winner + ' > ' + e.loser).padEnd(20)} ${pct(e.winrate, e.games)}${t.broken.includes(`${e.winner} > ${e.loser}`) ? '  ✗ no es compleix' : ''}`);
  }
}
console.log('');
