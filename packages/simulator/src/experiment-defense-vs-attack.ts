/**
 * DEFENSE PREMIUM — does a defense card actually beat an attack card of the
 * same level?
 *
 * `intentions.md` now states the premium as a number: at the same skill level
 * a defense should win the contest ~80% of the time (defense total ≥ attack
 * total, ties held by the defense). This harness measures the contest itself,
 * exactly — no simulation, just the convolved dice distributions — so the
 * answer is a probability, not a sample.
 *
 * Every attack card is priced ARMED with the standard party axe (+2) when it
 * carries `weapon_damage`, since that is what the cards see at the table.
 * Armour, speed, riders and the block payoff are all deliberately out of
 * scope: this is the raw dice question.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-defense-vs-attack.ts
 */
import { ActionType, ActionDefinition, DiceRoll } from '@pimpampum/engine';
import { ALL_SKILLS, ALL_EQUIPMENT } from '@pimpampum/skills';
import { ENEMY_DEFINITIONS } from '@pimpampum/enemies';

/** Flat bonus the standard party weapon lends a weapon-tagged attack. */
const WEAPON_BONUS = 2;

/** Probability mass function of a card's total, as total → probability. */
function pmf(dice: DiceRoll | undefined, bonus: number): Map<number, number> {
  let dist = new Map<number, number>([[bonus, 1]]);
  if (!dice) return dist;
  for (let i = 0; i < dice.numDice; i++) {
    const next = new Map<number, number>();
    for (const [total, p] of dist) {
      for (let face = 1; face <= dice.sides; face++) {
        const t = total + face;
        next.set(t, (next.get(t) ?? 0) + p / dice.sides);
      }
    }
    dist = next;
  }
  if (dice.modifier) {
    const shifted = new Map<number, number>();
    for (const [t, p] of dist) shifted.set(Math.max(0, t + dice.modifier), (shifted.get(Math.max(0, t + dice.modifier)) ?? 0) + p);
    dist = shifted;
  }
  return dist;
}

/** P(defense holds) = P(defense total ≥ attack total) — ties hold. */
function defenseHolds(def: ActionDefinition, atk: ActionDefinition): number {
  const dDist = pmf(def.dice, def.rollBonus ?? 0);
  const aBonus = (atk.rollBonus ?? 0) + (atk.effects.some(e => e.type === 'weapon_damage') ? WEAPON_BONUS : 0);
  const aDist = pmf(atk.dice, aBonus);
  let p = 0;
  for (const [dTotal, dp] of dDist) {
    for (const [aTotal, ap] of aDist) {
      if (dTotal >= aTotal) p += dp * ap;
    }
  }
  return p;
}

interface Card { def: ActionDefinition; skill: string; player: boolean }

const cards: Card[] = [];
for (const s of ALL_SKILLS) {
  for (const a of s.actions) cards.push({ def: a, skill: s.displayName, player: s.category === 'player' });
}
for (const eq of ALL_EQUIPMENT) {
  for (const a of eq.grantsActions ?? []) cards.push({ def: a, skill: eq.name, player: true });
}
for (const e of ENEMY_DEFINITIONS) {
  for (const s of e.skills) for (const a of s.actions) cards.push({ def: a, skill: s.displayName, player: false });
}

const attacks = cards.filter(c => c.def.actionType === ActionType.Atac && c.def.dice);
const defenses = cards.filter(c => c.def.actionType === ActionType.Defensa && c.def.dice);

const pct = (p: number) => `${(p * 100).toFixed(0)}%`.padStart(4);

console.log('\n=== Defense vs attack at the SAME level (P defense holds) ===\n');
console.log('Target: ~80%. Attacks armed with +2 where weapon-tagged.\n');

const rows: { label: string; level: number; each: { name: string; p: number }[]; mean: number }[] = [];
for (const d of defenses) {
  // The shield unlocks at 0 (no skill needed); its peers are the level-1 cards.
  const level = Math.max(1, d.def.unlockLevel);
  const peers = attacks.filter(a => a.def.unlockLevel === level);
  const each = peers.map(a => ({ name: `${a.def.name} (${a.skill})`, p: defenseHolds(d.def, a.def) }))
    .sort((x, y) => x.p - y.p);
  const mean = each.reduce((s, e) => s + e.p, 0) / (each.length || 1);
  rows.push({ label: `${d.def.name} (${d.skill}) ${d.def.dice}`, level, each, mean });
}
rows.sort((a, b) => a.mean - b.mean);

for (const r of rows) {
  console.log(`${r.label} — nivell ${r.level}: mitjana ${pct(r.mean)} sobre ${r.each.length} atacs del mateix nivell`);
  console.log(`   pitjor: ${r.each.slice(0, 3).map(e => `${e.name} ${pct(e.p)}`).join(' · ')}`);
  console.log(`   millor: ${r.each.slice(-2).map(e => `${e.name} ${pct(e.p)}`).join(' · ')}`);
}

// --- Every defense vs every attack, ignoring level: the global picture -------
let all = 0, n = 0, below = 0;
for (const d of defenses) for (const a of attacks) {
  const p = defenseHolds(d.def, a.def); all += p; n++; if (p < 0.8) below++;
}
console.log(`\nGlobal: mitjana ${pct(all / n)} sobre ${n} parells; ${below} (${((below / n) * 100).toFixed(0)}%) per sota del 80%.`);

// --- Solve each defense card's dice for the 80% target ----------------------
// Candidates are ordered by average, and among equal averages the flatter pool
// comes first (intentions.md: prefer many smaller dice).
console.log('\n=== Dau que cada carta de defensa necessita ===\n');
const LADDER: [number, number][] = [[2, 4], [3, 4], [2, 6], [4, 4], [3, 6], [2, 8], [5, 4], [4, 6], [3, 8], [2, 12], [5, 6], [4, 8], [6, 6], [5, 8], [4, 10]];
LADDER.sort((a, b) => (a[0] * (a[1] + 1)) / 2 - (b[0] * (b[1] + 1)) / 2);
for (const d of defenses) {
  const level = Math.max(1, d.def.unlockLevel);
  const peers = attacks.filter(a => a.def.unlockLevel === level);
  const meanFor = (dice: DiceRoll) => {
    const fake = { ...d.def, dice } as ActionDefinition;
    return peers.reduce((s, a) => s + defenseHolds(fake, a.def), 0) / peers.length;
  };
  const now = meanFor(d.def.dice!);
  const pick = LADDER.map(([n2, s]) => new DiceRoll(n2, s)).find(dice => meanFor(dice) >= 0.8);
  const worst = pick ? Math.min(...peers.map(a => defenseHolds({ ...d.def, dice: pick } as ActionDefinition, a.def))) : 0;
  console.log(`  ${d.def.name} (${d.skill}) L${level}: ${d.def.dice} ${pct(now)} → ${pick ?? '>4d10'} ${pick ? `${pct(meanFor(pick))} (pitjor cas ${pct(worst)})` : ''}`);
}

// --- What dice would a defense need to hit 80% vs each attack? --------------
console.log('\n=== Dau de defensa mínim per arribar al 80% ===\n');
const CANDIDATES = [[2, 4], [2, 6], [3, 4], [2, 8], [3, 6], [2, 10], [4, 6], [3, 8], [2, 12], [4, 8]];
for (const a of attacks.slice().sort((x, y) => x.def.unlockLevel - y.def.unlockLevel)) {
  const need = CANDIDATES.find(([n2, s]) => {
    const fake = { ...a.def, dice: new DiceRoll(n2, s), rollBonus: 0, effects: [] } as ActionDefinition;
    return defenseHolds(fake, a.def) >= 0.8;
  });
  const bonus = (a.def.rollBonus ?? 0) + (a.def.effects.some(e => e.type === 'weapon_damage') ? WEAPON_BONUS : 0);
  console.log(`  L${a.def.unlockLevel} ${a.def.name} (${a.skill}) ${a.def.dice}${bonus ? `+${bonus}` : ''} → cal ${need ? `${need[0]}d${need[1]}` : '>4d8'}`);
}
console.log('');
