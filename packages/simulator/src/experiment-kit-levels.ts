/**
 * IS A HIGHER LEVEL A BETTER KIT? — requirement 1 of the kit analyzer
 * (NEXT-STEPS §7.1), measured directly.
 *
 * Level N+1 knows a SUPERSET of level N's cards, so a rational chooser can
 * never do worse. Any measured regression therefore means a TRAP CARD (it
 * costs more than it returns) or an AI that overvalues the new card. Flat
 * steps are nearly as bad: a level that buys nothing is a level the GM pays
 * for.
 *
 * The kit scoreboard (`experiment-kit-threat.ts`, §5) can only see this
 * through the solver — a body-count grid stepping 3 → 4 → 6, at ±2.5pp per
 * solve. Two coarse knobs disagreeing look exactly like a regression. So ask
 * the question directly: FIX the composition and the PV, sweep only the level,
 * and read the winrate under common random numbers.
 *
 * Then name the culprit. A regression tells you WHICH level added the bad
 * card, not whether that card is bad or merely overplayed; the per-card
 * breakdown (plays per combat, and how often the creature won when it played
 * the card) separates a trap from dead weight.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-kit-levels.ts
 *      ENEMY=stone-golem COUNT=4 EPV=20 pnpm … src/experiment-kit-levels.ts
 */
import { simulateEncounter, getEnemy, fullKitLevel, buildComposition } from '@pimpampum/enemies';
import { buildReferenceParty, type PartySpec } from '@pimpampum/skills';
import {
  CombatEngine, newCombatStats, withSeed, setAIControlled, type CombatStats,
} from '@pimpampum/engine';
import { referenceParty } from './bench/reference.js';
import { exact, pct } from './bench/report.js';
import { REGISTRY } from './bench/arena.js';
import { games } from './bench/games.js';

// Same reference table as the scoreboard: four heroes on four main kits,
// properly equipped. Anything else would not be comparable to §5.
/** The reference table (bench/reference.ts) — named kits, asserted Σ, one
 *  definition for the whole package. It used to be re-derived here as
 *  `MAINS.slice(0, 4)`, which silently re-based this harness whenever a kit
 *  was added to or reordered in the catalogue. */
const PARTY: PartySpec = referenceParty();

declare const process: { env: Record<string, string | undefined> };

const ENEMY_ID = process.env.ENEMY ?? 'horned-devil';
const COUNTS = [3, 6];
const PVS = [10, 20, 30, 45];
const GAMES = games(2000);
/** The cell the per-card breakdown drills into: where the regression showed. */
const DRILL = { count: Number(process.env.COUNT ?? 3), pv: Number(process.env.EPV ?? 20) };
// One seed for the whole grid: common random numbers, so two levels differ by
// their cards rather than by their dice.
const SEED = 909000;

const def = getEnemy(ENEMY_ID)!;
const maxLevel = fullKitLevel(def);
const cards = def.skills.flatMap(s => s.actions).sort((a, b) => a.unlockLevel - b.unlockLevel);

console.log(`${def.displayName} (${def.id}) — nivell contra winrate, composició i PV FIXOS`);
console.log(`${GAMES} combats per cel·la · llavor ${SEED} · 4 herois equipats (Σ20 nivells)\n`);
console.log('  cartes per nivell:');
for (let l = 1; l <= maxLevel; l++) {
  const gained = cards.filter(a => a.unlockLevel === l)
    .map(a => `${a.name} (${a.actionType}, vel ${a.speed})`).join(', ');
  console.log(`    ${l} │ ${gained || '—'}`);
}

for (const count of COUNTS) {
  console.log(`\n${count}× ${def.displayName}   (winrate dels JUGADORS — més baix = criatura més perillosa)`);
  const header = PVS.map(pv => `${pv} PV`.padStart(13)).join('');
  console.log(`   nivell${header}`);
  const grid: number[][] = [];
  for (let level = 1; level <= maxLevel; level++) {
    const row: number[] = [];
    const cells: string[] = [];
    for (const pv of PVS) {
      const r = simulateEncounter(
        [{ enemyId: ENEMY_ID, count, level, pv }], PARTY, { games: GAMES, seed: SEED },
      );
      row.push(r.winrate);
      cells.push(pct(r.winrate, r.games).padStart(13));
    }
    grid.push(row);
    console.log(`   ${String(level).padStart(6)}${cells.join('')}`);
  }

  // A regression is a level whose winrate for the players goes UP — i.e. the
  // creature got weaker by learning a card. Flag it per PV column.
  console.log('   regressions (winrate dels jugadors puja en pujar de nivell):');
  let any = false;
  for (let i = 0; i < PVS.length; i++) {
    for (let l = 1; l < maxLevel; l++) {
      const delta = grid[l][i] - grid[l - 1][i];
      // 2000 games ≈ ±1.1pp each, so ±3pp is comfortably outside noise.
      if (delta > 0.03) {
        any = true;
        console.log(
          `     ${PVS[i]} PV · nivell ${l} → ${l + 1}: `
          + `${exact(grid[l - 1][i], 1)} → ${exact(grid[l][i], 1)} `
          + `(+${(delta * 100).toFixed(1)}pp)`,
        );
      }
    }
  }
  if (!any) console.log('     cap fora del soroll (±3pp)');
}

// --- Which card is the culprit ----------------------------------------------
// A regression names the level that added it, but not whether the card is BAD
// or merely OVERPLAYED. Per-card play rate plus the creature's winrate when it
// played the card separates the two: a card played often and correlating with
// losing is a trap; one never played is dead weight the level should not cost.
// The kit drill plays at the balancer's setting, so a drill and a solved
// encounter mean the same thing.
const AI_DEPTH = 1;

function drill(count: number, pv: number, level: number): { stats: CombatStats; enemyWinrate: number } {
  const stats = newCombatStats();
  let enemyWins = 0;
  withSeed(SEED, () => {
    for (let i = 0; i < GAMES; i++) {
      const players = buildReferenceParty(PARTY);
      setAIControlled(players);
      const enemies = buildComposition([{ enemyId: ENEMY_ID, count, level, pv }]);
      const res = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, aiDepth: AI_DEPTH,
      }).runCombat(stats);
      if (res.winner === 1) enemyWins++;
    }
  });
  return { stats, enemyWinrate: enemyWins / GAMES };
}

console.log(`\n\nDESGLOSSAMENT PER CARTA — ${DRILL.count}× ${def.displayName} a ${DRILL.pv} PV`);
console.log('  jugades = per combat i per cos · guanya = victòria de la CRIATURA quan la juga\n');
for (let level = 1; level <= maxLevel; level++) {
  const { stats, enemyWinrate } = drill(DRILL.count, DRILL.pv, level);
  console.log(`  nivell ${level}   criatura guanya ${pct(enemyWinrate, GAMES)}`);
  for (const a of cards) {
    if (a.unlockLevel > level) continue;
    const plays = stats.actionPlays[a.id] ?? 0;
    const perBody = plays / (GAMES * DRILL.count);
    const winPct = plays ? 100 * (stats.actionWinPlays[a.id] ?? 0) / plays : 0;
    console.log(
      `      ${a.name.padEnd(22)} ${perBody.toFixed(2).padStart(5)} jugades/combat`
      + `   guanya ${plays ? pct(winPct / 100, plays) : '—'}`,
    );
  }
}
