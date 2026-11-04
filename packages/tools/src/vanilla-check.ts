/**
 * IS THE VANILLA SET REASONABLE? (the user, 2026-11-04: before vanilla derives
 * anything, it must play like today's real game.) The census reads each real
 * card's role from the fights; the vanilla set is a generic twin of every main
 * kit (playtest `vanillaTwin`); both are played 2v2 at the checkpoints and
 * compared metric by metric (`vanillaMatches`).
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/vanilla-check.ts --set elements
 *   … --params '{"burn":3,"blastBoost":4}'    the twins' numbers (TWIN_DEFAULTS otherwise)
 *   … --calibrate                              search the twins' numbers for the closest match
 */
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, kitsDynamics, lanesNow, useSet } from '@pimpampum/bench';
import {
  census, summarise, TWIN_DEFAULTS, vanillaMatches, type CensusCard, type DynamicsSummary, type TwinParams,
} from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const LEVELS = (flag('--levels') ?? '3,6,10').split(',').map(Number);
const fights = games(120);
const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const kits = SET.gameSet.calibration.mainKits;

process.stderr.write('the real game…\n');
const realRuns = LEVELS.map(level => ({ level, d: kitsDynamics(level, fights) }));
const real = new Map(realRuns.map(r => [r.level, summarise(r.d)]));
const cards: CensusCard[] = census(realRuns.map(r => r.d.cards));

/** The twins at `p`, in a child process. */
async function twinsAt(p: TwinParams): Promise<Map<number, DynamicsSummary>> {
  const r = await isolated<Record<number, DynamicsSummary>>(PLAYTEST, 'twinDynamics', [SET.ref, cards, ladder, p, LEVELS, fights]);
  return new Map(LEVELS.map(l => [l, r[l]]));
}

/** Many trials at once, as many as the lanes allow. */
async function allAt(trials: TwinParams[]): Promise<Map<number, DynamicsSummary>[]> {
  const out: Map<number, DynamicsSummary>[] = new Array(trials.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), trials.length)) }, async () => {
    for (let i = next++; i < trials.length; i = next++) out[i] = await twinsAt(trials[i]);
  }));
  return out;
}

const misses = (v: Map<number, DynamicsSummary>) => LEVELS.reduce((t, l) => t + vanillaMatches(real.get(l)!, v.get(l)!).checks.filter(c => !c.ok).length, 0);

let params: TwinParams = { ...TWIN_DEFAULTS, ...(flag('--params') ? JSON.parse(flag('--params')!) : {}) };
let vanilla = await twinsAt(params);

if (process.argv.includes('--calibrate')) {
  // Every single-number move from the current numbers, measured at once; keep
  // the one that misses least; again, until nothing helps.
  const grid: Partial<Record<keyof TwinParams, number[]>> = {
    blastBoost: [-3, 0, 3, 6], burn: [1, 2, 3, 4], riposteDrop: [0, 2, 4], aim: [1, 2, 3], healBoost: [-2, 0, 3], hexTurns: [1, 2],
  };
  let best = misses(vanilla);
  for (let pass = 0; pass < 4; pass++) {
    const trials = (Object.entries(grid) as [keyof TwinParams, number[]][]).flatMap(([k, values]) =>
      values.filter(v => params[k] !== v).map(v => ({ ...params, [k]: v })));
    const res = await allAt(trials);
    const scored = res.map((r, i) => ({ p: trials[i], r, m: misses(r) })).sort((a, b) => a.m - b.m);
    process.stderr.write(`pass ${pass + 1}: best ${scored[0].m} misses (was ${best}) at ${JSON.stringify(scored[0].p)}\n`);
    if (scored[0].m >= best) break;
    best = scored[0].m; params = scored[0].p; vanilla = scored[0].r;
  }
}

console.log(`THE CENSUS (role per card, from what each did in ${fights} real fights a level)`);
for (const k of kits) console.log(`  ${k.padEnd(14)} ${cards.filter(c => c.kit === k).sort((a, b) => a.unlock - b.unlock).map(c => `${c.unlock}:${c.role}${c.fast ? '*' : ''}`).join(' ')}`);
console.log(`\nTwins' numbers: ${JSON.stringify(params)}`);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const show = (m: string, x: number) => (/rounds/.test(m) ? String(x) : /PV/.test(m) ? x.toFixed(1) : pct(x));
let all = true;
for (const level of LEVELS) {
  const r = vanillaMatches(real.get(level)!, vanilla.get(level)!);
  all &&= r.ok;
  console.log(`\nLevel ${level}: ${r.ok ? '✓ vanilla matches today' : `❌ ${r.checks.filter(c => !c.ok).length} metrics off`}`);
  for (const c of r.checks) console.log(`  ${c.ok ? '✓' : '❌'} ${c.metric.padEnd(24)} real ${show(c.metric, c.real).padStart(5)} · vanilla ${show(c.metric, c.vanilla).padStart(5)}`);
}
console.log(`\n${all ? 'The vanilla set is reasonable: it plays like today\'s game at every checkpoint.' : 'The vanilla set does not yet play like today\'s game.'}`);
