/**
 * The standing balance report: mirror matches, and a replay check on the
 * balancer's own answers.
 *
 * Run: pnpm --filter @pimpampum/simulator start
 */
import { newCombatStats, Character, CombatEngine, setAIControlled, withSeed } from '@pimpampum/engine';
import { getAction, buildReferenceParty } from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, TARGET_WINRATES, generateEncounter,
  createEnemyFrom, getEnemy,
} from '@pimpampum/enemies';
import { MIRROR_DEPTH, REGISTRY, randomTeam, runMatch } from './bench/arena.js';
import { bodiesFor } from './bench/shapes.js';
import { deltaPP, exact, pct, pctCoarse } from './bench/report.js';
import { games, searchGames } from './bench/games.js';

/** One seed for the whole report, so two runs of this script are comparable
 *  and a change in a printed number means a change in the GAME. Teams are drawn
 *  through the engine's rng (bench/arena.ts), so this actually binds now — it
 *  used to draw from `Math.random` and every run was a different experiment. */
const SEED = 20260920;

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

  withSeed(SEED + size, () => {
    for (let i = 0; i < games; i++) {
      const a = randomTeam('A', size, budget);
      const b = randomTeam('B', size, budget);
      const winner = runMatch(a, b, stats);
      recordSkills(skillStat, a, winner === 0);
      recordSkills(skillStat, b, winner === 1);
      if (winner === 0) aWins++; else if (winner === 1) bWins++; else draws++;
    }
  });

  console.log(`\n=== Mirror ${size}v${size} @ budget ${budget} (${games} games, depth ${MIRROR_DEPTH}, seed ${SEED + size}) ===`);
  console.log(`Team A: ${pct(aWins / games, games)}  Team B: ${pct(bWins / games, games)}  draws: ${pct(draws / games, games)}`);
  console.log(`Avg rounds: ${(stats.rounds / stats.combats).toFixed(2)}`);

  console.log(`\n  Skill win correlation (sorted; ± is this skill's own sample):`);
  [...skillStat.entries()]
    .map(([id, e]) => ({ id, rate: e.wins / e.games, games: e.games }))
    .sort((x, y) => y.rate - x.rate)
    .forEach(s => console.log(`   ${s.id.padEnd(22)} ${bar(s.rate * 100)} ${pct(s.rate, s.games)} (${s.games})`));

  console.log(`\n  Action type plays:`);
  for (const [t, n] of Object.entries(stats.actionTypePlays)) console.log(`   ${t.padEnd(10)} ${n}`);

  console.log(`\n  Action win correlation (top by plays):`);
  [...Object.entries(stats.actionPlays)]
    .map(([id, plays]) => ({ id, plays, rate: (stats.actionWinPlays[id] ?? 0) / plays }))
    .sort((x, y) => y.plays - x.plays)
    .slice(0, 18)
    .forEach(a => console.log(`   ${(getAction(a.id)?.name ?? a.id).padEnd(24)} plays ${String(a.plays).padStart(5)}  win ${pct(a.rate, a.plays)}`));
}


/**
 * THE REPLAY MUST THINK AS HARD AS THE SOLVE.
 *
 * The balancer prices at `aiDepth` 1. This replay used to construct its engine
 * without an `aiDepth` at all, which the engine defaults to 0 — so every cell
 * in this table graded a depth-1 solve with depth-0 play, and the gap it
 * printed was the gap between two AI settings rather than anything about the
 * solver. `enemy-threat.test.ts` has documented and honoured this invariant
 * since the AI rebuild; this was the one place it was never applied.
 */
const REPLAY_DEPTH = 1;

// --- Parametric balancer check: solved encounters vs their promised winrate --
function parametricAnalysis(playerCount: number, perPlayerBudget: number, games: number): void {
  console.log(
    `\n=== Balancer v3 — simulated (${playerCount} players @ budget ${perPlayerBudget},`
    + ` ${games} games/cell, replay depth ${REPLAY_DEPTH}) ===`,
  );
  console.log('   cada cel·la: composició · promesa → repetició (± de la diferència)');
  for (const [label, target] of Object.entries(TARGET_WINRATES)) {
    const cells: string[] = [];
    for (const template of ENEMY_DEFINITIONS) {
      // Grade against the SAME party spec the solver targeted — verifying
      // against a differently-built party measures the party gap, not the
      // solver — but with an independent seed, so this is a real replay.
      const party = { count: playerCount, levels: perPlayerBudget, armor: 1 };
      const gen = generateEncounter(template, bodiesFor(template.id), party, target, { games: searchGames(120), searchGames: searchGames(80) });
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
          setAIControlled(players);
          const engine = new CombatEngine(players, enemies, {
            registry: REGISTRY, maxRounds: 40, aiDepth: REPLAY_DEPTH,
          });
          const w = engine.runCombat().winner;
          if (w === 0) wins++; else if (w === null) wins += 0.5;
        }
        return wins;
      });
      const replay = wins / games;
      const flag = gen.clamped ? '!' : gen.durationCapped ? '⏱' : '';
      cells.push(
        `${template.id.slice(0, 10)} ${g.count}×pv${g.pv} `
        + `${pctCoarse(gen.predictedWinrate, gen.games)}→${pctCoarse(replay, games)}`
        + ` (${deltaPP(replay, games, gen.predictedWinrate, gen.games)})${flag}`,
      );
    }
    console.log(`   [${label.padEnd(6)} → ${exact(target)}] ${cells.join(' | ')}`);
  }
  console.log('   ! = topall de PV · ⏱ = topall de durada (la dificultat demanada era inabastable)');
}

console.log('Pim Pam Pum — skill-based balance simulation (dice-contest system)');
mirrorBalance(2, 6, games(3000));
mirrorBalance(3, 6, games(2000));
parametricAnalysis(4, 7, games(300));
