/**
 * A HERO'S PV, DERIVED ON THE REAL KITS (intentions.md, the user 2026-11-06:
 * never fixed; a base plus what each level in each class adds, bulky classes
 * more and fragile ones less, in the designer's order). Playtest
 * `derive-class-pv.ts`, two stages:
 *  1. at each level, every hero on one PV: the floor (no card fells fresh
 *     heroes without an answer past the bar) and the ceiling (fights end in
 *     time); the line base + middle slope × level fitted under the ceilings
 *     and over the floors;
 *  2. the fragile and bulky slopes moved off the middle one, the order kept,
 *     chosen by every class's field score at the checkpoints.
 * Prints the numbers to pin in the set (`HERO_BASE_PV`, `PV_PER_LEVEL`).
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-pv.ts --set elements
 */
import { fileURLToPath } from 'node:url';
import { games, isolated, lanesNow, useSet } from '@pimpampum/bench';
import { fitLine, MAX_UNANSWERABLE_KOS, type LevelWindow, type TierCandidate, type TierMeasure } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const TIERS = (SET.root as { PV_TIERS?: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>> }).PV_TIERS;
if (!TIERS) throw new Error(`derive-pv: the ${SET.id} set orders no classes by bulk (PV_TIERS)`);
const LEVELS = [3, 4, 5, 6, 7, 8, 9, 10];
const CHECKPOINTS = [3, 6, 10];
const fights = games(120);
const tierFights = games(60);
const log = (s: string) => process.stderr.write(`${s}\n`);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

/** `jobs` across bench's lanes, each in its own process. */
async function inParallel<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), jobs.length)) }, async () => {
    for (let i = next++; i < jobs.length; i = next++) out[i] = await jobs[i]();
  }));
  return out;
}

// --- 1. pacing and interactivity --------------------------------------------------------
log('stage 1: each level\'s floor and ceiling on the real kits…');
const windows = await inParallel(LEVELS.map(level => async () => {
  const w = await isolated<LevelWindow>(PLAYTEST, 'realWindowJob', [SET.ref, level, fights]);
  log(`  L${level}: floor ${w.floor}, ceiling ${w.ceiling ?? 'none'}`);
  return w;
}));
const line = fitLine(windows);
console.log(`level  floor (interactivity)  ceiling (fights end)  →  base ${line.base} + ${line.slope} × level`);
for (const w of windows) {
  const pv = line.base + line.slope * w.level;
  console.log(`L${String(w.level).padEnd(5)} ${String(w.floor).padStart(21)} ${String(w.ceiling ?? '—').padStart(21)}  →  ${pv.toFixed(1)}${line.over.includes(w.level) ? '   over the ceiling: fights will run long here' : ''}`);
}

// --- 2. balance: the tiers' slopes ------------------------------------------------------------
const floorOk = (slope: number) => windows.every(w => line.base + slope * w.level >= w.floor);
const OFFSETS = [0, 0.25, 0.5, 0.75, 1, 1.5];
const measure = (c: TierCandidate) => isolated<TierMeasure>(PLAYTEST, 'measureTiersJob', [SET.ref, line.base, c, TIERS, CHECKPOINTS, tierFights]);
log('stage 2: the fragile tier\'s slope…');
const fragileTried = await inParallel(OFFSETS.filter(d => floorOk(line.slope - d)).map(d => () => measure({ fragile: line.slope - d, middle: line.slope, bulky: line.slope })));
const fragile = [...fragileTried].sort((a, b) => a.imbalance - b.imbalance)[0].candidate.fragile;
log('stage 2: the bulky tier\'s slope…');
const bulkyTried = await inParallel(OFFSETS.map(d => () => measure({ fragile, middle: line.slope, bulky: line.slope + d })));
const best = [...bulkyTried].sort((a, b) => a.imbalance - b.imbalance)[0];
console.log(`\ntiers (imbalance = Σ (field score − ½)² over every class × levels ${CHECKPOINTS.join('/')}; MAX_UNANSWERABLE_KOS ${MAX_UNANSWERABLE_KOS}):`);
for (const m of [...fragileTried, ...bulkyTried]) console.log(`  fragile ${m.candidate.fragile} · middle ${m.candidate.middle} · bulky ${m.candidate.bulky}  →  imbalance ${m.imbalance.toFixed(3)}`);
console.log(`\nchosen: fragile ${best.candidate.fragile}, middle ${best.candidate.middle}, bulky ${best.candidate.bulky}`);
for (const kit of Object.values(TIERS).flat()) {
  const cells = best.cells.filter(c => c.kit === kit);
  console.log(`  ${kit.padEnd(14)} ${cells.map(c => `L${c.level} ${Math.round(100 * c.winrate)}% field, 9 in 10 within ${c.p90}`).join(' · ')}`);
}
const slopeOf: Record<string, number> = {};
for (const [tier, kits] of Object.entries(TIERS) as [keyof TierCandidate, readonly string[]][]) for (const k of kits) slopeOf[k] = best.candidate[tier];
console.log(`\nexport const HERO_BASE_PV = ${line.base};\nexport const PV_PER_LEVEL: Readonly<Record<string, number>> = {\n${Object.values(TIERS).map(kits => `  ${kits.map(k => `${k.includes('-') ? `'${k}'` : k}: ${slopeOf[k]}`).join(', ')},`).join('\n')}\n};`);
