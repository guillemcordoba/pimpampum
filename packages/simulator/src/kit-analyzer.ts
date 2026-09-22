/**
 * THE KIT ANALYZER — command line.
 *
 * The analysis itself lives in `kit-analyzer-lib.ts`, so a warm worker
 * (`bench/parallel.ts`) can import it without running this file's CLI.
 */
import { ALL_SKILLS } from '@pimpampum/skills';
import { ENEMY_DEFINITIONS, getEnemy } from '@pimpampum/enemies';
import {
  COMPANY, FAIR, MAIN_KITS, saturatedCells, SATURATION, SHAPES, solveShape, usableCells,
 FANTASY } from '@pimpampum/set-fantasy';

const COMPANY_COUNT = COMPANY.map((_, i) => i);
import {
  cacheStatus, exact, games, gamesFor, lanes, pct, pp, share, SMOKE, stderr, warm, type WarmJob,
 useSet } from '@pimpampum/bench';
import {
  analyze, warmJobsFor, REGRESSION_PP, MINDLESS_MARGIN,
  type KitReport, type Subject, type Verdict,
} from './kit-analyzer-lib.js';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: { write(s: string): void };
};

// --- CLI --------------------------------------------------------------------

function subjectName(s: Subject): string {
  return s.mode === 'player'
    ? ALL_SKILLS.find(k => k.id === s.id)!.displayName
    : getEnemy(s.id)!.displayName;
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
  console.log(`  ${mark(r.strategySpace)} 3b. l'espai d'estratègia importa — ${r.strategySpace.detail}`);
  console.log(`  ${mark(r.oneTrick)} 3c. una sola carta repetida no basta — ${r.oneTrick.detail}`);
  console.log(`  ${mark(r.cardUse)} 4/5. cap carta morta (valor per decisió) — ${r.cardUse.detail}`);
  // The whole table, not just the failures: the SHAPE of a kit's card values is
  // the design finding, and a pass/fail line hides it. Printed once per kit,
  // strongest first, so a kit carried by one card is visible at a glance even
  // when every card clears the line.
  const cardName = new Map(r.cards.map(c => [c.id, c.name]));
  for (const v of r.cardValues) {
    // Two columns, two different claims. `valor` RANKS a card inside its own
    // hand and the column sums to ~zero by arithmetic, so a negative entry
    // means "worse than the other things available", never "bad card". "millor
    // opció" against its own chance null is the one that can say dead.
    console.log(
      `        ${(cardName.get(v.id) ?? v.id).padEnd(24)} ${v.value.toFixed(1).padStart(6)} PV`
      + `   millor ${share(v.bestShare * v.observations, v.observations)} vs atzar ${exact(v.nullShare)}`,
    );
  }
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

// WARM FIRST, IN PARALLEL, THEN MEASURE SERIALLY.
//
// The children only fill the cache (bench/parallel.ts); the run below is the
// same single-threaded code it has always been and simply finds its answers
// already computed. A child that fails costs nothing — the entry is missing and
// the serial path computes it.
// Two phases, because a baseline needs its shape solved first: four solves,
// then sixteen baselines fanned out across the lanes.
await warm(SHAPES.map(s => ({ kind: 'shape' as const, label: s.label })));
await warm(SHAPES.flatMap(s => COMPANY_COUNT.map(i => ({
  kind: 'baseline' as const, label: s.label, companyIdx: i,
}))));
const matrixJobs: WarmJob[] = subjects.flatMap(s =>
  warmJobsFor(s, GAMES).map(j => ({ kind: 'matrix' as const, ...j })));
if (matrixJobs.length > 1) {
  process.stdout.write(`   escalfant ${matrixJobs.length} mesures en ${lanes} processos…`);
  await warm(matrixJobs);
  process.stdout.write(' fet\n\n');
}

const reports = subjects.map(s => { const r = analyze(s, GAMES); printReport(r); return r; });
console.log(
  `\n(memòria cau: ${cacheStatus.hits} encerts, ${cacheStatus.misses} càlculs`
  + ' — BENCH_NO_CACHE=1 per recalcular-ho tot)',
);

// --- The roll-up ------------------------------------------------------------
// Folded in from the old `measure-verdict.ts`, which asked the same question at
// party level with its own setup and its own sample size — a second answer to
// requirement 3 that could disagree with this one. One measurement, one answer.
if (reports.length > 1) {
  console.log('\n━━ RESUM ━━');
  console.log('  kit                    vs neutre    1.nivell  2.durada  3.pensar  3b.espai  3c.1carta  4/5.cartes  7.correl');
  for (const r of reports) {
    const top = r.levels[r.levels.length - 1].run;
    const d = top.delta * 100;
    const m = (v: Verdict) => (v.inconclusive ? '   ➖   ' : v.ok ? '   ✅   ' : '   ❌   ');
    console.log(
      `  ${subjectName(r.subject).padEnd(22)} ${((d >= 0 ? '+' : '') + d.toFixed(1) + 'pp').padStart(8)}    `
      + `${m(r.monotonicity)}  ${m(r.duration)}  ${m(r.spam)}  ${m(r.strategySpace)} ${m(r.oneTrick)}   ${m(r.cardUse)}    ${m(r.correlation)}`,
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
