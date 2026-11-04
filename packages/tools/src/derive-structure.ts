/**
 * WHICH STRUCTURE LETS EVERY CONSTRAINT HOLD? (the user, 2026-11-04: derive,
 * don't choose — one level up from PV.) For every combination of the
 * structural knobs — how strong a Focus is (the vanilla Aim), how far below the
 * ladder the defenses sit, how much of a held blow still lands (the engine's
 * chip damage) — and both readings of the burst constraint (survive the aimed
 * blow, or the plain one), `derivePV` at the checkpoints: is there a PV window
 * at every one, and what is the curve?
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-structure.ts --set elements
 *   … --aims 1,2,3 --shifts 0,-1,-2,-3 --chips 0,0.25,0.5 --levels 3,6,10
 */
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, lanesNow, useSet } from '@pimpampum/bench';
import type { PVDerivation } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const list = (f: string, d: string) => (flag(f) ?? d).split(',').map(Number);
const aims = list('--aims', '1,2,3');
const shifts = list('--shifts', '0,-1,-2,-3');
const chips = list('--chips', '0,0.25,0.5');
const levels = list('--levels', '3,6,10');
const fights = games(60);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

interface Structure { aim: number; shift: number; chip: number }
const structures: Structure[] = aims.flatMap(aim => shifts.flatMap(shift => chips.map(chip => ({ aim, shift, chip }))));
const jobs = structures.flatMap(s => levels.map(level => ({ s, level })));
const results = new Map<string, PVDerivation>();
const keyOf = (s: Structure, level: number) => `${s.aim}/${s.shift}/${s.chip}/${level}`;

let next = 0, done = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), jobs.length)) }, async () => {
  for (let i = next++; i < jobs.length; i = next++) {
    const { s, level } = jobs[i];
    const defense = DEFENSE_LADDER[Math.max(1, Math.min(10, level + s.shift))];
    results.set(keyOf(s, level), await isolated<PVDerivation>(PLAYTEST, 'deriveLevel',
      [SET.ref, level, ATTACK_LADDER[level].toString(), defense.toString(), { aim: s.aim, armour: 1, fights, chip: s.chip }]));
    process.stderr.write(`\rderived ${++done}/${jobs.length}   `);
  }
}));
process.stderr.write('\n');

type Burst = 'aimed' | 'plain';
const window = (d: PVDerivation, burst: Burst): [number, number | null] =>
  [Math.max(burst === 'aimed' ? d.bestBlowPV : d.plainBlowPV, d.roundOnePV), d.lengthPV];
const feasible = (s: Structure, burst: Burst) => levels.every(l => {
  const [lo, hi] = window(results.get(keyOf(s, l))!, burst);
  return hi !== null && hi >= lo;
});
const describe = (s: Structure) => `Focus ×${s.aim + 1} blow · defense ${s.shift ? `${s.shift} rungs` : 'on its rung'} · chip ${Math.round(100 * s.chip)}%`;
const cells = (s: Structure, burst: Burst) => levels.map(l => {
  const [lo, hi] = window(results.get(keyOf(s, l))!, burst);
  return `L${l} ${lo}-${hi ?? '—'}${hi !== null && hi >= lo ? ` → ${hi}` : ' ✗'}`;
}).join('   ');

console.log(`Structures searched: ${structures.length}, at levels ${levels.join(', ')}, ${fights} vanilla fights a cell. Window = floor-ceiling of hero PV; → the derived PV.`);
for (const burst of ['aimed', 'plain'] as const) {
  const ok = structures.filter(s => feasible(s, burst));
  console.log(`\nBURST: survive the ${burst} blow — ${ok.length} of ${structures.length} structures give every checkpoint a PV`);
  for (const s of ok) console.log(`  ✓ ${describe(s).padEnd(52)} ${cells(s, burst)}`);
  const closest = structures.filter(s => !feasible(s, burst))
    .map(s => ({ s, gap: levels.reduce((t, l) => { const [lo, hi] = window(results.get(keyOf(s, l))!, burst); return t + Math.max(0, lo - (hi ?? 0)); }, 0) }))
    .sort((a, b) => a.gap - b.gap).slice(0, 5);
  if (closest.length) console.log(`  closest that fail (total PV gap):`);
  for (const { s, gap } of closest) console.log(`  ✗ ${describe(s).padEnd(52)} ${cells(s, burst)}   gap ${gap}`);
}
