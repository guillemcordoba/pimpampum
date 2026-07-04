import { newCombatStats, Character, CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { getAction } from '@pimpampum/skills';
import { ALL_ENCOUNTERS } from '@pimpampum/enemies';
import {
  REGISTRY, randomTeam, randomSizedTeam, runMatch, buildEncounter,
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

// --- Size balance: random sizes on both teams should each win ~50% ----------
function sizeBalance(size: number, budget: number, games: number): void {
  const stats = newCombatStats();
  const bySize = new Map<string, { games: number; wins: number }>();
  let draws = 0;

  for (let i = 0; i < games; i++) {
    const a = randomSizedTeam('A', size, budget);
    const b = randomSizedTeam('B', size, budget);
    const winner = runMatch(a, b, stats);
    if (winner === null) { draws++; continue; }
    for (const c of a) { const e = bySize.get(c.size) ?? { games: 0, wins: 0 }; e.games++; if (winner === 0) e.wins++; bySize.set(c.size, e); }
    for (const c of b) { const e = bySize.get(c.size) ?? { games: 0, wins: 0 }; e.games++; if (winner === 1) e.wins++; bySize.set(c.size, e); }
  }

  console.log(`\n=== Sizes ${size}v${size} @ budget ${budget} (${games} games, random sizes) ===`);
  console.log(`Avg rounds: ${(stats.rounds / stats.combats).toFixed(2)}  draws: ${(100 * draws / games).toFixed(1)}%`);
  console.log(`\n  Size win correlation:`);
  [...bySize.entries()]
    .map(([id, e]) => ({ id, pct: 100 * e.wins / e.games, games: e.games }))
    .sort((x, y) => y.pct - x.pct)
    .forEach(s => console.log(`   ${s.id.padEnd(22)} ${bar(s.pct)} ${s.pct.toFixed(1)}% (${s.games})`));
}

// --- Encounter analysis: a generic player party vs each encounter -----------
function encounterAnalysis(playerCount: number, perPlayerBudget: number, games: number): void {
  console.log(`\n=== Encounters (${playerCount} players @ budget ${perPlayerBudget}, ${games} games each) ===`);
  for (const enc of ALL_ENCOUNTERS) {
    let wins = 0, rounds = 0, draws = 0;
    for (let i = 0; i < games; i++) {
      const players = randomTeam('P', playerCount, perPlayerBudget);
      const enemies = buildEncounter(enc, playerCount);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      assignStrategies(enemies, [AIStrategy.Aggro]);
      const engine = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 });
      const res = engine.runCombat();
      if (res.winner === 0) wins++; else if (res.winner === null) draws++;
      rounds += res.rounds;
    }
    console.log(`   ${enc.name.padEnd(22)} [${enc.difficulty.padEnd(6)}] players win ${bar(100 * wins / games)} ${(100 * wins / games).toFixed(0)}%  avg ${(rounds / games).toFixed(1)} rounds  draws ${(100 * draws / games).toFixed(0)}%`);
  }
}

console.log('Pim Pam Pum — skill-based balance simulation');
mirrorBalance(2, 40, 3000);
mirrorBalance(3, 40, 2000);
sizeBalance(3, 40, 2000);
encounterAnalysis(4, 45, 600);
