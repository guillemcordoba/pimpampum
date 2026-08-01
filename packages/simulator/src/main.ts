import { newCombatStats, Character, CombatEngine, assignStrategies, AIStrategy, withSeed } from '@pimpampum/engine';
import { getAction, buildReferenceParty } from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, TARGET_WINRATES, generateEncounter,
  createEnemyFrom, getEnemy,
} from '@pimpampum/enemies';
import {
  REGISTRY, randomTeam, runMatch,
} from './tests/helpers.js';

function recordSkills(map: Map<string, { games: number; wins: number }>, team: Character[], won: boolean): void {
  for (const c of team) {
    for (const skillId of c.skills.keys()) {
      const e = map.get(skillId) ?? { games: 0, wins: 0 };
      e.games++;
      if (won) e.wins++;
      map.set(skillId, e);
    }
  }
}

function bar(pct: number): string {
  const n = Math.round(pct / 5);
  return '█'.repeat(n).padEnd(20, '·');
}

// --- Mirror-match balance: equal-budget random teams should be ~50/50 -------
function mirrorBalance(size: number, budget: number, games: number): void {
  const stats = newCombatStats();
  const skillStat = new Map<string, { games: number; wins: number }>();
  let aWins = 0, bWins = 0, draws = 0;

  for (let i = 0; i < games; i++) {
    const a = randomTeam('A', size, budget);
    const b = randomTeam('B', size, budget);
    const winner = runMatch(a, b, stats);
    recordSkills(skillStat, a, winner === 0);
    recordSkills(skillStat, b, winner === 1);
    if (winner === 0) aWins++; else if (winner === 1) bWins++; else draws++;
  }

  console.log(`\n=== Mirror ${size}v${size} @ budget ${budget} (${games} games) ===`);
  console.log(`Team A: ${(100 * aWins / games).toFixed(1)}%  Team B: ${(100 * bWins / games).toFixed(1)}%  draws: ${(100 * draws / games).toFixed(1)}%`);
  console.log(`Avg rounds: ${(stats.rounds / stats.combats).toFixed(2)}`);

  console.log(`\n  Skill win correlation (sorted):`);
  [...skillStat.entries()]
    .map(([id, e]) => ({ id, pct: 100 * e.wins / e.games, games: e.games }))
    .sort((x, y) => y.pct - x.pct)
    .forEach(s => console.log(`   ${s.id.padEnd(22)} ${bar(s.pct)} ${s.pct.toFixed(1)}% (${s.games})`));

  console.log(`\n  Action type plays:`);
  for (const [t, n] of Object.entries(stats.actionTypePlays)) console.log(`   ${t.padEnd(10)} ${n}`);

  console.log(`\n  Action win correlation (top by plays):`);
  [...Object.entries(stats.actionPlays)]
    .map(([id, plays]) => ({ id, plays, pct: 100 * (stats.actionWinPlays[id] ?? 0) / plays }))
    .sort((x, y) => y.plays - x.plays)
    .slice(0, 18)
    .forEach(a => console.log(`   ${(getAction(a.id)?.name ?? a.id).padEnd(24)} plays ${String(a.plays).padStart(5)}  win ${a.pct.toFixed(1)}%`));
}

/** Bodies fielded per template in the parametric check — this script's choice
 *  of a natural-looking fight, not data the content carries. */
const FIELDED: Record<string, number> = {
  goblin: 6, 'spined-devil': 6, wolf: 6,
  'goblin-shaman': 3, 'bone-devil': 3, 'stone-golem': 3,
  basilisk: 1, 'horned-devil': 1,
};

// --- Parametric balancer check: solved encounters vs their promised winrate --
function parametricAnalysis(playerCount: number, perPlayerBudget: number, games: number): void {
  console.log(`\n=== Balancer v3 — simulated (${playerCount} players @ budget ${perPlayerBudget}, ${games} games/cell) ===`);
  for (const [label, target] of Object.entries(TARGET_WINRATES)) {
    const cells: string[] = [];
    for (const template of ENEMY_DEFINITIONS) {
      // Grade against the SAME party spec the solver targeted — verifying
      // against a differently-built party measures the party gap, not the
      // solver — but with an independent seed, so this is a real replay.
      const party = { count: playerCount, levels: perPlayerBudget, armor: 1 };
      const gen = generateEncounter(template, FIELDED[template.id] ?? 3, party, target, { games: 120, searchGames: 80 });
      if (!gen) continue;
      const g = gen.groups[0];
      const wins = withSeed(31337, () => {
        let wins = 0;
        for (let i = 0; i < games; i++) {
          const players = buildReferenceParty(party);
          const enemies = Array.from({ length: g.count }, (_, k) =>
            createEnemyFrom(getEnemy(g.enemyId)!, {
              pv: g.pv, level: g.level, name: `${template.displayName} ${k + 1}`,
            }));
          assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
          const engine = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 });
          const w = engine.runCombat().winner;
          if (w === 0) wins++; else if (w === null) wins += 0.5;
        }
        return wins;
      });
      const flag = gen.clamped ? '!' : '';
      cells.push(`${template.id.slice(0, 10)} ${g.count}×pv${g.pv} ${(100 * wins / games).toFixed(0)}%${flag}`);
    }
    console.log(`   [${label.padEnd(6)} → ${(100 * target).toFixed(0)}%] ${cells.join(' | ')}`);
  }
}

console.log('Pim Pam Pum — skill-based balance simulation (dice-contest system)');
mirrorBalance(2, 6, 3000);
mirrorBalance(3, 6, 2000);
parametricAnalysis(4, 7, 120);
