/**
 * Berserk attribution: which component drives the 59% win correlation?
 * Mutates card params in place per scenario and restores them.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-berserk.ts
 */
import { Character, newCombatStats } from '@pimpampum/engine';
import { PLAYER_SKILLS } from '@pimpampum/skills';
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 2500;

const berserk = PLAYER_SKILLS.find(s => s.id === 'berserk')!;
const temerari = berserk.actions.find(a => a.id === 'atac-temerari')!
  .effects.find(e => e.type === 'reckless')!.params as { attack: number };
const rage = berserk.actions.find(a => a.id === 'entrar-en-furia')!
  .effects.find(e => e.type === 'enter_rage')!.params as { value: number; pvCost?: number };
const implacable = berserk.actions.find(a => a.id === 'furia-implacable')!
  .effects.find(e => e.type === 'weapon_damage')!.params as { times: number };

function sweep(label: string): void {
  const stats = newCombatStats();
  let games = 0, wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const a = randomTeam('A', 2, 6);
    const b = randomTeam('B', 2, 6);
    const w = runMatch(a, b, stats);
    const count = (team: Character[], won: boolean) => {
      if (team.some(c => c.skills.has('berserk'))) { games++; if (won) wins++; }
    };
    count(a, w === 0);
    count(b, w === 1);
  }
  console.log(`${label.padEnd(44)} berserk win ${(100 * wins / games).toFixed(1)}% (${games} games)`);
}

sweep('baseline (rage 3, temerari +3, capstone ×2)');
rage.value = 2;
sweep('rage 3→2');
rage.value = 3; temerari.attack = 2;
sweep('temerari +3→+2');
temerari.attack = 3; implacable.times = 1;
sweep('capstone arma ×2→×1');
rage.value = 2; temerari.attack = 2; implacable.times = 2;
sweep('rage 2 + temerari +2 (capstone kept ×2)');
rage.value = 3; temerari.attack = 3;
rage.pvCost = 3;
sweep('rage costs 3 PV (blood price, values kept)');
rage.pvCost = 3; temerari.attack = 2;
sweep('blood price + temerari +2');
rage.pvCost = 0; temerari.attack = 3; implacable.times = 2;

rage.value = 2; rage.pvCost = 3; temerari.attack = 2; implacable.times = 1;
sweep('FULL STACK: rage 2 + blood 3 + temerari +2 + capstone ×1');
rage.value = 3; rage.pvCost = 0; temerari.attack = 3; implacable.times = 2;
