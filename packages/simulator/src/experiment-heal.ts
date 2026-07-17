/**
 * Heal-stall analysis: how much of the mirror draw-tail is driven by healing
 * (and other sustain kits), and what do candidate cures-de-camp nerfs buy.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-heal.ts
 */
import { Character, DiceRoll, newCombatStats } from '@pimpampum/engine';
import { PLAYER_SKILLS } from '@pimpampum/skills';
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 3000;

const SUSTAIN = ['metge', 'ombres', 'earthbender', 'runes'];

function hasSkill(team: Character[], id: string): boolean {
  return team.some(c => c.skills.has(id));
}

function sweep(label: string): void {
  const stats = newCombatStats();
  const bySkill = new Map<string, { games: number; draws: number }>();
  let draws = 0, rounds = 0;
  for (let i = 0; i < GAMES; i++) {
    const a = randomTeam('A', 2, 6);
    const b = randomTeam('B', 2, 6);
    const w = runMatch(a, b, stats);
    const isDraw = w === null;
    if (isDraw) draws++;
    for (const id of SUSTAIN) {
      if (hasSkill(a, id) || hasSkill(b, id)) {
        const e = bySkill.get(id) ?? { games: 0, draws: 0 };
        e.games++;
        if (isDraw) e.draws++;
        bySkill.set(id, e);
      }
    }
  }
  rounds = stats.rounds / stats.combats;
  console.log(`\n${label}: draws ${(100 * draws / GAMES).toFixed(1)}%  avgRounds ${rounds.toFixed(1)}`);
  for (const [id, e] of bySkill) {
    console.log(`   matches with ${id.padEnd(12)} draw ${(100 * e.draws / e.games).toFixed(1)}% (${e.games} games)`);
  }
}

const cures = PLAYER_SKILLS.find(s => s.id === 'metge')!.actions.find(a => a.id === 'cures-de-camp')! as { dice?: DiceRoll };
const originalDice = cures.dice;

// (The 2026-07-17 fatigue-penalty attribution block was removed with the
// penalty system itself — roll penalties are permanently gone.)
sweep('baseline (cures 2d4)');
cures.dice = new DiceRoll(1, 4);
sweep('cures 1d4');
cures.dice = new DiceRoll(0, 0, 0);
sweep('cures heals 0 (upper bound of any nerf)');
cures.dice = originalDice;
