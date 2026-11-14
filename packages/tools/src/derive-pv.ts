/**
 * A HERO'S PV, DERIVED ON THE REAL KITS (intentions.md, the user 2026-11-06:
 * never fixed; a base plus what each level in each class adds, bulky classes
 * more and fragile ones less, in the designer's order). Playtest
 * `derive-class-pv.ts`, two stages:
 *  1. at each level, every hero on one PV: the floor (no card fells fresh
 *     heroes without an answer past the bar), the ceiling (fights end in
 *     time: the median within the round limit, almost none stalling) and the
 *     aim (the median fight ends a round sooner); the line base + middle
 *     slope × level fitted under the aims and over the floors;
 *  2. the fragile and bulky slopes moved off the middle one, the order kept,
 *     chosen by every class's field score at the checkpoints; no tier under
 *     a floor or past a ceiling.
 * Prints the numbers to pin in the set (`HERO_BASE_PV`, `PV_PER_LEVEL`).
 *
 * A PINNED TABLE IS KEPT WHILE IT STILL FITS: inside every level's window, and
 * no clearly less fair than the best tiers found around it. The table feeds
 * back into the fights it is derived from (a summoned body may take a hero's
 * PV) and a ceiling held by the stall bar is read inside its noise, so a fresh
 * fit of the same game lands on another line; the fresh fit is printed beside
 * the kept one.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-pv.ts --set elements
 */
import { fileURLToPath } from 'node:url';
import { games, inLanes, isolated, pct, useSet } from '@pimpampum/bench';
import { AIM_MEDIAN_ROUNDS, asFairAs, fitLine, fitsEveryWindow, MAX_UNANSWERABLE_KOS, PV_LEVELS, tierStaysInside, wholePV, type LevelWindow, type TierCandidate, type TierMeasure } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const TIERS = (SET.root as { PV_TIERS?: Readonly<Record<'bulky' | 'middle' | 'fragile', readonly string[]>> }).PV_TIERS;
if (!TIERS) throw new Error(`derive-pv: the ${SET.id} set orders no classes by bulk (PV_TIERS)`);
const PINNED = pinnedTable(SET.root as { HERO_BASE_PV?: number; PV_PER_LEVEL?: Readonly<Record<string, number>> }, TIERS);
const LEVELS = PV_LEVELS;
const CHECKPOINTS = [3, 6, 10];
const fights = games(120);
/** A tier candidate is judged on the rechecked sample: its imbalance sums 24 cells' noise. */
const tierFights = 4 * fights;
const log = (s: string) => process.stderr.write(`${s}\n`);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

const names = new Map(SET.gameSet.calibration.mainKits.flatMap(k => (SET.gameSet.kit(k)?.actions ?? []).map(a => [a.id, a.name] as const)));
const nameOf = (id: string) => names.get(id) ?? id;
const pc = (x: number) => `${Math.round(100 * x)}%`;
/** What sets a window, in a line each side. */
const behindFloor = (w: LevelWindow) => w.floorCards.map(k => `${nameOf(k.card)} ${pc(k.rate)} ±${pc(k.se)}${k.clearly ? '' : ' (within noise)'}`).join(', ')
  + (Object.keys(w.focusSetUps).length ? `  [answered, set up by: ${Object.entries(w.focusSetUps).map(([id, n]) => `${nameOf(id)} ×${n}`).join(', ')}]` : '');
const runs = (o: { median: number; p90: number; stallRate: number; fights: number }) => `${o.median}·${o.p90}${o.stallRate ? `, ${pct(o.stallRate, o.fights).trim()} stall` : ''}`;
const behindCeiling = (w: LevelWindow) => !w.overCeiling ? '' : `at ${w.overCeiling.pv} PV fights run ${runs(w.overCeiling)} (median·9 in 10), over the bar on the ${w.overCeiling.fails}; ${w.overCeiling.cards.length ? `they end without ${w.overCeiling.cards.map(c => `${nameOf(c.card)} (${runs(c)})`).join(', ')}` : 'no single card'}`;

// --- 1. pacing and interactivity --------------------------------------------------------
log('stage 1: each level\'s floor and ceiling on the real kits…');
const windows = await inLanes(LEVELS.map(level => async () => {
  const w = await isolated<LevelWindow>(PLAYTEST, 'realWindowJob', [SET.ref, level, fights]);
  log(`  L${level}: floor ${w.floor} (${behindFloor(w) || 'no card'}), aim ${w.aim ?? 'none'}, ceiling ${w.ceiling ?? 'none'} (${behindCeiling(w)})`);
  return w;
}));
const fresh = fitLine(windows);
const keepsLine = PINNED !== null && fitsEveryWindow(windows, PINNED.base, PINNED.tiers.middle)
  && tierStaysInside(windows, PINNED.base, PINNED.tiers.fragile) && tierStaysInside(windows, PINNED.base, PINNED.tiers.bulky);
const line = keepsLine ? { base: PINNED.base, slope: PINNED.tiers.middle, over: [] as number[] } : fresh;
console.log(`level  floor (interactivity)  aim (median within ${AIM_MEDIAN_ROUNDS})  ceiling (fights end)  →  base ${line.base} + ${line.slope} × level${keepsLine ? `   (the pinned line, kept: inside every window; a fresh fit gives base ${fresh.base} + ${fresh.slope} × level)` : ''}`);
for (const w of windows) {
  const pv = wholePV(line.base, line.slope, w.level);
  console.log(`L${String(w.level).padEnd(5)} ${String(w.floor).padStart(21)} ${String(w.aim ?? '—').padStart(21)} ${String(w.ceiling ?? '—').padStart(21)}  →  ${pv}${line.over.includes(w.level) ? '   over the aim: the median fight will run longer here' : ''}`);
  if (w.floorCards.length) console.log(`        floor set by: ${behindFloor(w)}`);
  if (w.overCeiling) console.log(`        ceiling: ${behindCeiling(w)}`);
}

// --- 2. balance: the tiers' slopes ------------------------------------------------------------
const OFFSETS = [0, 0.25, 0.5, 0.75, 1, 1.5];
const measure = (c: TierCandidate) => isolated<TierMeasure>(PLAYTEST, 'measureTiersJob', [SET.ref, line.base, c, TIERS, CHECKPOINTS, tierFights]);
log('stage 2: the fragile tier\'s slope…');
const fragileTried = await inLanes(OFFSETS.filter(d => d === 0 || tierStaysInside(windows, line.base, line.slope - d)).map(d => () => measure({ fragile: line.slope - d, middle: line.slope, bulky: line.slope })));
const fragile = [...fragileTried].sort((a, b) => a.imbalance - b.imbalance)[0].candidate.fragile;
log('stage 2: the bulky tier\'s slope…');
const bulkyTried = await inLanes(OFFSETS.filter(d => d === 0 || tierStaysInside(windows, line.base, line.slope + d)).map(d => () => measure({ fragile, middle: line.slope, bulky: line.slope + d })));
const fairest = [...bulkyTried].sort((a, b) => a.imbalance - b.imbalance)[0];
const pinnedTiers = keepsLine ? await measure(PINNED.tiers) : null;
const keepsTiers = pinnedTiers !== null && asFairAs(pinnedTiers, fairest);
const best = keepsTiers ? pinnedTiers : fairest;
console.log(`\ntiers (imbalance = Σ (field score − ½)² over every class × levels ${CHECKPOINTS.join('/')}; MAX_UNANSWERABLE_KOS ${MAX_UNANSWERABLE_KOS}):`);
const tierRow = (m: TierMeasure) => `  fragile ${m.candidate.fragile} · middle ${m.candidate.middle} · bulky ${m.candidate.bulky}  →  imbalance ${m.imbalance.toFixed(3)} ±${m.se.toFixed(3)}`;
for (const m of [...fragileTried, ...bulkyTried]) console.log(tierRow(m));
if (pinnedTiers) console.log(`${tierRow(pinnedTiers)}   (pinned: ${keepsTiers ? 'kept, no clearly less fair than the fairest above' : 'clearly less fair than the fairest above'})`);
console.log(`\nchosen: fragile ${best.candidate.fragile}, middle ${best.candidate.middle}, bulky ${best.candidate.bulky}`);
for (const kit of Object.values(TIERS).flat()) {
  const cells = best.cells.filter(c => c.kit === kit);
  console.log(`  ${kit.padEnd(14)} ${cells.map(c => `L${c.level} ${Math.round(100 * c.winrate)}% field, rounds ${c.median}·${c.p90}${c.ends ? '' : ' ✗'}`).join(' · ')}`);
}
const slopeOf: Record<string, number> = {};
for (const [tier, kits] of Object.entries(TIERS) as [keyof TierCandidate, readonly string[]][]) for (const k of kits) slopeOf[k] = best.candidate[tier];
console.log(`\nexport const HERO_BASE_PV = ${line.base};\nexport const PV_PER_LEVEL: Readonly<Record<string, number>> = {\n${Object.values(TIERS).map(kits => `  ${kits.map(k => `${k.includes('-') ? `'${k}'` : k}: ${slopeOf[k]}`).join(', ')},`).join('\n')}\n};`);

/** The table the set pins today, as a line and its tiers; null when it pins none, or one this tool could not have printed (a tier whose classes differ). */
function pinnedTable(
  root: { HERO_BASE_PV?: number; PV_PER_LEVEL?: Readonly<Record<string, number>> }, tiers: Readonly<Record<keyof TierCandidate, readonly string[]>>,
): { base: number; tiers: TierCandidate } | null {
  const perLevel = root.PV_PER_LEVEL;
  if (root.HERO_BASE_PV === undefined || !perLevel) return null;
  const slopeOfTier = (tier: keyof TierCandidate) => {
    const slopes = new Set(tiers[tier].map(k => perLevel[k]));
    return slopes.size === 1 ? [...slopes][0] : undefined;
  };
  const [fragile, middle, bulky] = [slopeOfTier('fragile'), slopeOfTier('middle'), slopeOfTier('bulky')];
  return fragile === undefined || middle === undefined || bulky === undefined ? null : { base: root.HERO_BASE_PV, tiers: { fragile, middle, bulky } };
}
