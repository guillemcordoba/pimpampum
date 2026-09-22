/**
 * Is LEVEL a usable lever for combat LENGTH?
 *
 * The solver currently fields every creature at its full kit and moves only
 * PV, so difficulty is bought with hit points and fights get long. For each
 * (composition, level) this solves PV to the SAME target winrate and reports
 * how long the resulting fight runs: if length falls as level rises, the
 * solver is leaving a lever on the table.
 */
import { solveEncounter, TARGET_WINRATES, getEnemy, fullKitLevel } from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';
import { exact, pct, searchGames, SMOKE, useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

const party: PartySpec = { count: 4, levels: [5, 5, 5, 5], armor: [1, 1, 1, 1] };
const TARGET = TARGET_WINRATES.hard;

const CASES: { label: string; enemyId: string; count: number }[] = [
  { label: '3× Goblin', enemyId: 'goblin', count: 3 },
  { label: '6× Goblin', enemyId: 'goblin', count: 6 },
  { label: '1× Basilisc', enemyId: 'basilisk', count: 1 },
  { label: '2× Diable Banyut', enemyId: 'horned-devil', count: 2 },
  { label: '4× Llop', enemyId: 'wolf', count: 4 },
];

console.log(`objectiu ${exact(TARGET)} de victòria · 4 jugadors, 5 nivells, armadura 1\n`);
for (const c of (SMOKE ? CASES.slice(0, 1) : CASES)) {
  const def = getEnemy(c.enemyId)!;
  const full = fullKitLevel(def);
  console.log(`${c.label}   (kit complet = nivell ${full})`);
  console.log(`   niv |    PV | PV total | rondes | winrate mesurat`);
  for (let level = 1; level <= full; level++) {
    const s = solveEncounter([{ enemyId: c.enemyId, count: c.count, level }], party, TARGET, { searchGames: searchGames(120) });
    if (!s) continue;
    const pv = s.groups[0].pv;
    const flag = s.clamped ? ' (clamped)' : '';
    console.log(
      `   ${String(level).padStart(3)} | ${String(pv).padStart(5)} | ${String(pv * c.count).padStart(8)} |`
      + ` ${s.avgRounds.toFixed(1).padStart(6)} | ${pct(s.predictedWinrate, s.games)}${flag}`,
    );
  }
  console.log('');
}
