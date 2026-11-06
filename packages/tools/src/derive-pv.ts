/**
 * A HERO'S PV, DERIVED PER LEVEL (intentions.md, the user 2026-11-06: never
 * fixed, always derived). On the vanilla twins of the set's main kits
 * (playtest `deriveOnTwins`): at each level, the most PV with fights still
 * ending in time, floored by nobody falling in round 1 and by interactivity
 * (the strongest fast attack fells a fresh hero at most `MAX_FAST_KOS` of the
 * time). Where the floor sits above the ceiling the floor wins — nobody dies to
 * what they could not stop — and the level is flagged: its fights will run
 * long. A hero never loses PV by levelling up. Prints the table to pin in the
 * set (`HERO_PV`); levels 1-2 sit below play and take level 3's.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-pv.ts --set elements
 */
import { fileURLToPath } from 'node:url';
import { games, isolated, kitsDynamics, lanesNow, useSet } from '@pimpampum/bench';
import { census, MAX_FAST_KOS, TWIN_DEFAULTS, type PVDerivation } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const LEVELS = [3, 4, 5, 6, 7, 8, 9, 10];
const fights = games(120);
const log = (s: string) => process.stderr.write(`${s}\n`);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

log('what each card does (the twins are built from it)…');
const cards = census(LEVELS.map(level => kitsDynamics(level, fights).cards));
const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
const out = new Map<number, PVDerivation>();
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), LEVELS.length)) }, async () => {
  for (let i = next++; i < LEVELS.length; i = next++) {
    const level = LEVELS[i];
    out.set(level, await isolated<PVDerivation>(PLAYTEST, 'deriveTwinLevel', [SET.ref, level, cards, ladder, TWIN_DEFAULTS, { fights, armour: 1, burst: 'fast' }]));
    log(`derived L${level} (${out.size}/${LEVELS.length})`);
  }
}));

const table: Record<number, number> = {};
let carried = 0;
console.log(`level  round-1 floor  fast floor  length ceiling  →  PV   (MAX_FAST_KOS ${MAX_FAST_KOS})`);
for (const level of LEVELS) {
  const d = out.get(level)!;
  const floor = Math.max(d.roundOnePV, d.fastBlowPV ?? 1);
  const fits = d.lengthPV !== null && d.lengthPV >= floor;
  const derived = fits ? d.lengthPV! : floor;
  const pv = Math.max(derived, carried);
  carried = pv;
  table[level] = pv;
  const notes = [
    ...(fits ? [] : [`no window: fights end in time only up to ${d.lengthPV ?? 'no PV'}, the floor wins`]),
    ...(pv > derived ? [`raised from ${derived}: a hero never loses PV by levelling up`] : []),
  ];
  console.log(`L${String(level).padEnd(5)} ${String(d.roundOnePV).padStart(13)} ${String(d.fastBlowPV ?? '—').padStart(11)} ${String(d.lengthPV ?? '—').padStart(15)}  →  ${String(pv).padStart(3)}${notes.length ? `   ${notes.join('; ')}` : ''}`);
}
table[1] = table[2] = table[3];
console.log(`\nexport const HERO_PV: Readonly<Record<number, number>> = {\n  ${Array.from({ length: 10 }, (_, i) => `${i + 1}: ${table[i + 1]}`).join(', ')},\n};`);
