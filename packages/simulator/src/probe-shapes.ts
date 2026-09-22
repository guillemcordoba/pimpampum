/**
 * SHAPE CALIBRATION PROBE — is each of the kit analyzer's fight shapes actually
 * a FAIR fight?
 *
 * `kit-analyzer.ts` solves every shape to `FAIR` so each cell is even by
 * construction and can never go stale. That only holds if the solve can REACH
 * the target: a shape whose bodies are too flimsy to threaten the party (the
 * solver caps it on duration) or too numerous for integer PV to be a fine
 * enough lever lands well off `FAIR`, and the kit verdicts then average a free
 * win against a near-certain loss.
 *
 * So sweep the BODY COUNT per species and read where the solve lands. The
 * output picks the counts `bench/shapes.ts` should use.
 *
 * The probe and the analyzer share `bench/shapes.ts` — the calibration party,
 * FAIR and the tolerance all come from there. They used to hold private copies,
 * which meant the tool that chooses the counts could disagree with the tool the
 * counts are for, about the very thing being calibrated.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/probe-shapes.ts
 */
import { simulateEncounter, solveEncounter } from '@pimpampum/enemies';
import {
  calibrationKit, calibrationParty, COMPANY, FAIR, SATURATION,
 FANTASY } from '@pimpampum/set-fantasy';
import { exact, games, pct, searchGames, SMOKE, useSet } from '@pimpampum/bench';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

declare const process: { env: Record<string, string | undefined> };

const SEARCH_GAMES = searchGames(120);

/** Candidate counts per shape family. */
const CANDIDATES: { label: string; pool: (n: number) => { enemyId: string; count: number }[]; counts: number[] }[] = [
  { label: 'horda (goblin)', pool: n => [{ enemyId: 'goblin', count: n }], counts: [4, 5, 6, 8, 10, 12] },
  { label: 'escamot (bone-devil)', pool: n => [{ enemyId: 'bone-devil', count: n }], counts: [3, 4, 5, 6, 8] },
  { label: 'cap (basilisk)', pool: n => [{ enemyId: 'basilisk', count: n }], counts: [1, 2] },
  {
    label: 'mixt (goblin + horned-devil)',
    pool: n => [{ enemyId: 'goblin', count: n }, { enemyId: 'horned-devil', count: 1 }],
    counts: [2, 3, 4, 6],
  },
];

/** Games per company when re-measuring a solved count. */
const CHECK_GAMES = games(400);

console.log(
  `CALIBRATGE DE FORMES · objectiu ${FAIR * 100}% (només una diana; el que compta és la saturació)`
  + ` · colla de calibratge: ${COMPANY.map((_, i) => calibrationKit(i)).join('/')} al seient 1`
  + ` + la companyia corresponent (la MATEIXA forma que una cel·la) · searchGames ${SEARCH_GAMES}`,
);
console.log(
  'Es resol contra la companyia 0 i es MESURA contra totes — igual que ho fa l\'analitzador,'
  + ' perquè la companyia val desenes de punts.\n',
);

for (const family of CANDIDATES) {
  console.log(`${family.label}`);
  // Seventeen solves is the cost here, not the sample size, so the smoke run
  // probes one count per family: enough to prove the harness executes.
  for (const count of (SMOKE ? family.counts.slice(0, 1) : family.counts)) {
    const solved = solveEncounter(family.pool(count), calibrationParty(0), FAIR, { searchGames: SEARCH_GAMES });
    if (!solved) { console.log(`  ${String(count).padStart(3)}× → sense solució`); continue; }
    const groups = solved.groups.map(g => ({ enemyId: g.enemyId, count: g.count, level: g.level, pv: g.pv }));
    const byCompany = COMPANY.map((_, i) =>
      simulateEncounter(groups, calibrationParty(i), { games: CHECK_GAMES, seed: 616_000 + i * 31 }).winrate);
    const mean = byCompany.reduce((a, b) => a + b, 0) / byCompany.length;
    const spread = Math.max(...byCompany) - Math.min(...byCompany);
    const gap = mean - FAIR;
    const usable = byCompany.filter(w => w >= SATURATION.min && w <= SATURATION.max).length;
    const flags = [
      solved.durationCapped ? 'durada' : '',
      solved.clamped ? 'topall de PV' : '',
      `${usable}/${byCompany.length} cel·les`,
    ].filter(Boolean).join(' ');
    console.log(
      `  ${String(count).padStart(3)}× → ${pct(mean, CHECK_GAMES * COMPANY.length)}`
      + ` (${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(0)}pp, per companyia ${byCompany.map(w => exact(w)).join('/')}, obertura ${(spread * 100).toFixed(0)}pp)`
      + `  ${groups.map(g => `${g.count}×${g.enemyId} pv${g.pv}`).join(' + ').padEnd(36)}`
      + ` ${solved.avgRounds.toFixed(1)} rondes  ${flags}`,
    );
  }
  console.log('');
}
