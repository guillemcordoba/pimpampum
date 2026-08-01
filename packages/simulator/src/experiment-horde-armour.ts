/**
 * Quantifies a hypothesis formed by hand-playing the 6-goblin encounter: flat
 * per-hit armour is not a small lever against a MANY-SMALL-HITS horde, it is
 * the dominant variable. Same encounter, same party, only the armour changes.
 */
import { CombatEngine } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemy, registerEnemySkills } from '@pimpampum/enemies';

const reg = createRegistry();
registerEnemySkills(reg);

const PARTY: { name: string; classCss: string; pv: number; skills: Record<string, number> }[] = [
  { name: 'Vera', classCss: 'mestre-armes', pv: 12, skills: { 'mestre-armes': 4 } },
  { name: 'Bran', classCss: 'terra', pv: 12, skills: { earthbender: 4 } },
  { name: 'Cira', classCss: 'metge', pv: 12, skills: { metge: 3, gel: 3 } },
  { name: 'Dell', classCss: 'enginyer', pv: 12, skills: { 'enginyer-explosius': 4 } },
];

const GAMES = 500;

function run(armour: string | null, goblins: number, gobPv: number): { win: number; rounds: number } {
  let win = 0, rounds = 0;
  for (let i = 0; i < GAMES; i++) {
    const players = PARTY.map(p => buildCharacter({
      ...p,
      equipment: [...(p.name === 'Vera' ? ['destral'] : []), 'escut', ...(armour ? [armour] : [])],
    }));
    const enemies = Array.from({ length: goblins }, (_, k) => {
      return createEnemy('goblin', { level: 4, name: `G${k}`, pv: gobPv })!;
    });
    const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 });
    const r = eng.runCombat();
    if (r.winner === 0) win++; else if (r.winner === null) win += 0.5;
    rounds += r.rounds;
  }
  return { win: win / GAMES, rounds: rounds / GAMES };
}

console.log('6 goblins @ pv15 (the balancer\'s "hard" solve, promises 65% player winrate)\n');
console.log('armour              winrate   avg rounds');
for (const [label, item] of [['cap (0)', null], ['cuir (+1)', 'armadura-de-cuir'], ['ferro (+2)', 'armadura-de-ferro']] as const) {
  const r = run(item, 6, 15);
  console.log(`${label.padEnd(18)} ${(r.win * 100).toFixed(1).padStart(6)}%   ${r.rounds.toFixed(1)}`);
}

console.log('\nSame party (no armour), varying horde size @ pv15:\n');
console.log('goblins             winrate   avg rounds');
for (const n of [3, 4, 5, 6, 8]) {
  const r = run(null, n, 15);
  console.log(`${String(n).padEnd(18)} ${(r.win * 100).toFixed(1).padStart(6)}%   ${r.rounds.toFixed(1)}`);
}

console.log('\nFerro (+2) party, varying horde size @ pv15:\n');
console.log('goblins             winrate   avg rounds');
for (const n of [3, 4, 5, 6, 8]) {
  const r = run('armadura-de-ferro', n, 15);
  console.log(`${String(n).padEnd(18)} ${(r.win * 100).toFixed(1).padStart(6)}%   ${r.rounds.toFixed(1)}`);
}
