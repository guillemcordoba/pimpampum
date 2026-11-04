/**
 * HERO PV, DERIVED (playtest `derive-pv.ts`): per level, on vanilla kits, the
 * window of PV that meets every constraint — the best blow and the first
 * round from below, fights ending in time from above — and the derived PV, its
 * ceiling. Every level in its own process.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-pv.ts --set elements --aim 2
 *   … --levels 3,6,10 --fights 120
 */
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, lanesNow, useSet } from '@pimpampum/bench';
import { MAX_P90_ROUNDS, type PVDerivation } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const levels = (flag('--levels') ?? '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const opts = { aim: Number(flag('--aim') ?? 1), armour: Number(flag('--armour') ?? 1), fights: games(120) };
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

const out = new Map<number, PVDerivation>();
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), levels.length)) }, async () => {
  for (let i = next++; i < levels.length; i = next++) {
    const l = levels[i];
    out.set(l, await isolated<PVDerivation>(PLAYTEST, 'deriveLevel', [SET.ref, l, ATTACK_LADDER[l].toString(), DEFENSE_LADDER[l].toString(), opts]));
    process.stderr.write(`\rderived ${out.size}/${levels.length}   `);
  }
}));
process.stderr.write('\n');

console.log(`Hero PV derived on vanilla kits (Aim ×${opts.aim}, armour ${opts.armour}, ${opts.fights} fights a cell; fights within ${MAX_P90_ROUNDS} rounds)`);
console.log(`level  best blow  round 1  length   window       PV    median · p90 · stalls · round-1 KOs at that PV`);
for (const l of levels) {
  const d = out.get(l)!;
  const floor = Math.max(d.bestBlowPV, d.roundOnePV);
  const window = d.lengthPV === null ? 'none' : d.lengthPV < floor ? `empty` : `${floor}-${d.lengthPV}`;
  const at = d.pv !== null ? d.measured.find(m => m.pv === d.pv)?.summary : undefined;
  const shape = at ? `${at.median} · ${at.p90} · ${Math.round(100 * at.stalls)}% · ${Math.round(100 * at.firstRoundKOs)}%` : d.collides.join('; ');
  console.log(`L${String(l).padEnd(5)} ${String(d.bestBlowPV).padStart(9)} ${String(d.roundOnePV).padStart(8)} ${String(d.lengthPV ?? '—').padStart(7)}   ${window.padEnd(10)} ${String(d.pv ?? '—').padStart(4)}    ${shape}`);
}
