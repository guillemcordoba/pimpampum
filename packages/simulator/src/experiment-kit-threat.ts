/**
 * KIT SCOREBOARD — how dangerous can each creature actually be, and is its
 * kit FINISHED?
 *
 * The duration budget turned "is this kit any good?" into a measurable
 * question. PV buys durability, not danger, so within a fixed number of rounds
 * a creature can only be as threatening as its CARDS make it. Ask the solver
 * for an even fight: if the round budget has to cap the answer, that cap IS
 * the kit's ceiling for that composition.
 *
 * Two questions, two readings of the same grid:
 *
 *  1. CAN IT CARRY A FIGHT — the cheapest composition that reaches an even
 *     match inside the budget. Reported as bodies needed, not as a winrate:
 *     winrates saturate (everything strong reads "50%") while "needs 12 bodies
 *     vs needs 4" keeps discriminating.
 *
 *  2. IS THE KIT TRUNCATED — does that body count keep FALLING as the level
 *     rises? If it is still falling at the top level, the creature is being
 *     held back by having run out of cards, and writing more will keep buying
 *     danger. If it flattened several levels ago, more cards will not help:
 *     the cards it already has need teeth.
 *
 * Re-run after changing a kit; the numbers move iff the danger did.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-kit-threat.ts
 */
import {
  ENEMY_DEFINITIONS, fullKitLevel, solveEncounter, DEFAULT_MAX_AVG_ROUNDS,
} from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';
import { referenceParty } from './bench/reference.js';
import { pct } from './bench/report.js';
import { games, searchGames, SMOKE } from './bench/games.js';

// The reference table: four heroes on four main kits, PROPERLY EQUIPPED. An
// unequipped party is a different (much weaker) benchmark and would flatter
// every kit — a weapon kit with no weapon cannot play its cards at all.
/** The reference table (bench/reference.ts) — named kits, asserted Σ, one
 *  definition for the whole package. It used to be re-derived here as
 *  `MAINS.slice(0, 4)`, which silently re-based this harness whenever a kit
 *  was added to or reordered in the catalogue. */
const PARTY: PartySpec = referenceParty();

// The grid is the cost — creatures × counts × levels, each cell a solve. The
// smoke run walks one creature and two counts.
const COUNTS = SMOKE ? [1, 3] : [1, 2, 3, 4, 6, 8, 12, 16];
const EVEN_FIGHT = 0.50;
/** Slack over EVEN_FIGHT: a solve reporting 54% did reach an even match. */
const PASS = 0.55;
const SOLVE_OPTS = { games: games(400), searchGames: searchGames(100) };

interface Cell { winrate: number; capped: boolean; pv: number; rounds: number; }

interface KitReport {
  id: string;
  name: string;
  maxLevel: number;
  /** Bodies needed for an even fight at each level; null when unreachable. */
  needByLevel: (number | null)[];
  /** Best (lowest) winrate anywhere in the grid. */
  ceiling: number;
  best: { count: number; level: number; pv: number; rounds: number } | null;
}

const reports: KitReport[] = [];
const t0 = Date.now();

for (const def of (SMOKE ? ENEMY_DEFINITIONS.slice(0, 1) : ENEMY_DEFINITIONS)) {
  const maxLevel = fullKitLevel(def);
  const levels = Array.from({ length: maxLevel }, (_, i) => i + 1);
  const grid = new Map<string, Cell>();
  const needByLevel: (number | null)[] = [];
  let ceiling = 1;
  let best: KitReport['best'] = null;

  for (const level of levels) {
    let need: number | null = null;
    for (const count of COUNTS) {
      // Stop widening the swarm once this level can already carry a fight —
      // the question is the CHEAPEST composition, not every composition.
      if (need !== null) break;
      const solved = solveEncounter(
        [{ enemyId: def.id, count, level }], PARTY, EVEN_FIGHT, SOLVE_OPTS,
      );
      if (!solved) continue;
      const cell: Cell = {
        winrate: solved.predictedWinrate,
        capped: solved.durationCapped,
        pv: solved.groups[0].pv,
        rounds: solved.avgRounds,
      };
      grid.set(`${level}:${count}`, cell);
      if (cell.winrate < ceiling) {
        ceiling = cell.winrate;
        best = { count, level, pv: cell.pv, rounds: cell.rounds };
      }
      if (cell.winrate <= PASS) need = count;
    }
    needByLevel.push(need);
  }

  reports.push({ id: def.id, name: def.displayName, maxLevel, needByLevel, ceiling, best });

  console.log(`\n${def.displayName}  (${def.id})`);
  console.log(`  cossos necessaris per a un combat igualat en ≤${DEFAULT_MAX_AVG_ROUNDS} rondes`);
  for (const level of levels) {
    const need = needByLevel[level - 1];
    const cell = need !== null ? grid.get(`${level}:${need}`)! : null;
    const detail = cell
      ? `${String(need).padStart(3)} cossos  (${cell.pv} PV, ${cell.rounds.toFixed(1)} rondes, ${pct(cell.winrate, SOLVE_OPTS.games)})`
      : '  — cap composició hi arriba';
    console.log(`    nivell ${level}/${maxLevel} │ ${detail}`);
  }
}

// --- Scoreboard --------------------------------------------------------------
const cheapest = (r: KitReport) => {
  const found = r.needByLevel.filter((n): n is number => n !== null);
  return found.length ? Math.min(...found) : null;
};

/** Still gaining from levels at the top? Compare the bodies needed at the top
 *  level with the best any LOWER level managed. Fewer bodies at the top means
 *  the last cards written are still buying danger — so more would too. */
function trend(r: KitReport): 'truncat' | 'pla' | 'mai' {
  const top = r.needByLevel[r.maxLevel - 1];
  if (top === null) return 'mai';
  const below = r.needByLevel.slice(0, -1).filter((n): n is number => n !== null);
  const bestBelow = below.length ? Math.min(...below) : null;
  if (bestBelow === null) return 'truncat';          // only the top level works at all
  return top < bestBelow ? 'truncat' : 'pla';
}

reports.sort((a, b) => (cheapest(a) ?? 999) - (cheapest(b) ?? 999));

console.log('\n' + '='.repeat(86));
console.log(`SCOREBOARD — dins de ${DEFAULT_MAX_AVG_ROUNDS} rondes, contra 4 herois equipats (Σ20 nivells)`);
console.log('='.repeat(86));
console.log('  CRIATURA               cossos per empatar   sostre   kit');
for (const r of reports) {
  const need = cheapest(r);
  const t = trend(r);
  const kit = t === 'mai' ? '—'
    : t === 'truncat' ? 'encara millora al nivell màxim → MÉS CARTES'
      : 'ja pla → les cartes actuals necessiten ullals';
  console.log(
    `  ${r.name.padEnd(22)}${(need === null ? 'mai' : `${need}×`).padStart(12)}`
    + `${pct(r.ceiling, SOLVE_OPTS.games).padStart(13)}   ${kit}`,
  );
}

const never = reports.filter(r => cheapest(r) === null);
const truncated = reports.filter(r => cheapest(r) !== null && trend(r) === 'truncat');
console.log(`\n${never.length}/${reports.length} no poden muntar un combat igualat a cap composició.`);
console.log(`${truncated.length}/${reports.length} encara guanyen perill al seu nivell màxim`
  + ' — allargar el kit els seguiria ajudant.');
console.log(`\nTemps total: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
