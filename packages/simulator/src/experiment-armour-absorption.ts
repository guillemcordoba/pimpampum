/**
 * Per-card armour absorption. Flat per-hit armour subtracts the SAME number
 * from every blow, so the fraction it removes is inversely proportional to hit
 * size: it deletes a 1d2 jab outright and barely dents a big swing. This
 * measures that unevenness on the real 6-goblin encounter by parsing combat
 * logs (no engine hooks needed).
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-armour-absorption.ts
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
const PLAYER_NAMES = new Set(PARTY.map(p => p.name));
const GAMES = 300;

/** «X «Card»: atac N — TARGET no es defensa (A armadura)» then «… colpeja TARGET: D dany.» */
const ROLL = /«([^»]+)»: atac (?:[\d+]+=)?(\d+) — ([^:]+?) no es defensa(?: \((\d+) armadura\))?/;
const HIT = /«([^»]+)» colpeja ([^:]+): (\d+) dany/;

interface Row { hits: number; raw: number; dealt: number }

function run(armour: string | null): Map<string, Row> {
  const byCard = new Map<string, Row>();
  for (let i = 0; i < GAMES; i++) {
    const players = PARTY.map(p => buildCharacter({
      ...p, equipment: ['escut', ...(armour ? [armour] : [])],
    }));
    const enemies = Array.from({ length: 6 }, (_, k) => {
      return createEnemy('goblin', { level: 4, name: `G${k}`, pv: 15 })!;
    });
    const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 });
    eng.runCombat();

    let pending: { card: string; raw: number; target: string } | null = null;
    for (const entry of eng.logEntries) {
      const r = ROLL.exec(entry.message);
      if (r) { pending = { card: r[1], raw: Number(r[2]), target: r[3].trim() }; continue; }
      const h = HIT.exec(entry.message);
      if (h && pending && h[1] === pending.card) {
        const target = h[2].trim();
        // Only count blows landing ON players (their armour is what varies).
        if (PLAYER_NAMES.has(target)) {
          const row = byCard.get(pending.card) ?? { hits: 0, raw: 0, dealt: 0 };
          row.hits++; row.raw += pending.raw; row.dealt += Number(h[3]);
          byCard.set(pending.card, row);
        }
        pending = null;
      }
    }
  }
  return byCard;
}

const CARDS = ['Punyalada ràpida', 'Punyalada traïdora', 'Allau de la horda'];
const results = [
  ['cap   (0)', run(null)],
  ['cuir  (+1)', run('armadura-de-cuir')],
  ['ferro (+2)', run('armadura-de-ferro')],
] as const;

console.log('Undefended goblin blows landing on players — how much armour eats.\n');
console.log('card                   armour       avg hit   avg dealt   absorbed');
for (const card of CARDS) {
  for (const [label, byCard] of results) {
    const r = byCard.get(card);
    if (!r || r.hits === 0) continue;
    const raw = r.raw / r.hits, dealt = r.dealt / r.hits;
    const pct = raw > 0 ? (1 - dealt / raw) * 100 : 0;
    console.log(
      `${card.padEnd(22)} ${label.padEnd(12)} ${raw.toFixed(2).padStart(6)}   ${dealt.toFixed(2).padStart(9)}   ${pct.toFixed(0).padStart(7)}%`,
    );
  }
  console.log('');
}

console.log('Whole-encounter totals (damage the horde actually lands on the party):\n');
console.log('armour        total raw   total dealt   absorbed');
for (const [label, byCard] of results) {
  let raw = 0, dealt = 0;
  for (const r of byCard.values()) { raw += r.raw; dealt += r.dealt; }
  console.log(`${label.padEnd(12)} ${(raw / GAMES).toFixed(1).padStart(9)}   ${(dealt / GAMES).toFixed(1).padStart(11)}   ${((1 - dealt / raw) * 100).toFixed(0).padStart(7)}%`);
}

// ---- Control: the SAME armour against big-hit enemies. Flat armour is worth
// a fraction inversely proportional to hit size, so the identical item should
// be worth far less here than against the horde above.
function runVs(armour: string | null, enemyId: string, count: number, pv: number): { raw: number; dealt: number } {
  let raw = 0, dealt = 0;
  for (let i = 0; i < GAMES; i++) {
    const players = PARTY.map(p => buildCharacter({
      ...p, equipment: ['escut', ...(armour ? [armour] : [])],
    }));
    const enemies = Array.from({ length: count }, (_, k) => {
      return createEnemy(enemyId, { name: `g${k}`, pv })!;
    });
    const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 });
    eng.runCombat();
    let pending: { card: string; raw: number } | null = null;
    for (const entry of eng.logEntries) {
      const r = ROLL.exec(entry.message);
      if (r) { pending = { card: r[1], raw: Number(r[2]) }; continue; }
      const h = HIT.exec(entry.message);
      if (h && pending && h[1] === pending.card) {
        if (PLAYER_NAMES.has(h[2].trim())) { raw += pending.raw; dealt += Number(h[3]); }
        pending = null;
      }
    }
  }
  return { raw, dealt };
}

console.log('\nCONTROL — the same armour vs different enemy shapes:\n');
console.log('encounter                     armour        avg hit   absorbed');
for (const [label, id, count, pv] of [
  ['6× goblin (horda)', 'goblin', 6, 15],
  ['1× horned-devil (solitari)', 'horned-devil', 1, 101],
  ['1× basilisk (solitari)', 'basilisk', 1, 50],
] as const) {
  for (const [alabel, item] of [['cap   (0)', null], ['ferro (+2)', 'armadura-de-ferro']] as const) {
    const { raw, dealt } = runVs(item, id, count, pv);
    const hits = raw > 0 ? raw : 1;
    console.log(`${label.padEnd(29)} ${alabel.padEnd(12)} ${(raw / GAMES).toFixed(1).padStart(6)}   ${((1 - dealt / hits) * 100).toFixed(0).padStart(7)}%`);
  }
}

// ---- The decision-relevant number: how many WINRATE POINTS the same armour is
// worth against each encounter shape (all at their solved "boss" comps).
console.log('\nWINRATE swing from the same armour, per encounter shape (boss solves):\n');
console.log('encounter                   cap      cuir     ferro    swing(0→+2)');
function wr(armour: string | null, id: string, count: number, pv: number): number {
  let w = 0;
  for (let i = 0; i < GAMES; i++) {
    const players = PARTY.map(p => buildCharacter({
      ...p, equipment: ['escut', ...(armour ? [armour] : [])],
    }));
    const enemies = Array.from({ length: count }, (_, k) => {
      return createEnemy(id, { name: `g${k}`, pv })!;
    });
    const r = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 }).runCombat();
    if (r.winner === 0) w++; else if (r.winner === null) w += 0.5;
  }
  return w / GAMES;
}
for (const [label, id, count, pv] of [
  ['6× goblin', 'goblin', 6, 17],
  ['7× wolf', 'wolf', 7, 15],
  ['6× spined-devil', 'spined-devil', 6, 34],
  ['3× bone-devil', 'bone-devil', 3, 22],
  ['3× stone-golem', 'stone-golem', 3, 19],
  ['1× horned-devil', 'horned-devil', 1, 125],
  ['1× basilisk', 'basilisk', 1, 62],
] as const) {
  const a = wr(null, id, count, pv);
  const b = wr('armadura-de-cuir', id, count, pv);
  const c = wr('armadura-de-ferro', id, count, pv);
  console.log(
    `${label.padEnd(27)} ${(a * 100).toFixed(0).padStart(4)}%   ${(b * 100).toFixed(0).padStart(4)}%   ${(c * 100).toFixed(0).padStart(4)}%   ${((c - a) * 100 >= 0 ? '+' : '') + ((c - a) * 100).toFixed(0)}pp`,
  );
}
