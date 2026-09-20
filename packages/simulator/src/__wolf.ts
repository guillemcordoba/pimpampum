import { solveEncounter } from '@pimpampum/enemies';
import { referenceParty } from './bench/reference.js';
import { pct } from './bench/report.js';
const party = referenceParty();
console.log('Llop — cossos per a un combat igualat (50%) en ≤6 rondes');
console.log('niv  cossos   PV   rondes   winrate jugadors');
for (const level of [1, 2, 3]) {
  for (const count of [4, 6, 8, 12, 16]) {
    const s = solveEncounter([{ enemyId: 'wolf', count, level }], party, 0.5, { games: 300, searchGames: 80 });
    if (!s) continue;
    const ok = s.predictedWinrate <= 0.58;
    console.log(`  ${level}  ${String(count).padStart(5)}  ${String(s.groups[0].pv).padStart(4)}  ${s.avgRounds.toFixed(1).padStart(6)}   ${pct(s.predictedWinrate, s.games)}${ok ? '  ← EVEN' : ''}${s.durationCapped ? ' (durada)' : ''}`);
    if (ok) break;
  }
}
