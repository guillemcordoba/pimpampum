/**
 * SCRATCH, EXPERIMENT 4: rating CREATURES, as Lichess rates puzzles. A party
 * is the sum of its kits' ratings (one per kit and level). An encounter of
 * one species has a rating that grows with the log of its bodies' PV and the
 * log of their number, each on the species' own slope. One fit over every
 * fight; then the rating is asked what the balancer asks the simulator:
 * which PV makes this fight a 60% one?
 *
 * Fights are drawn in two waves, as a rating system pairs: a first wave
 * anywhere, and a second near the PV the first wave's fit calls even, where
 * a fight says most.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-creatures.ts [--games 24000] [--only controls|elements]
 *
 * bench-exempt(seeded): matchups from `mulberry`; each fight on its own seed.
 */
import { flag } from '@pimpampum/bench';
import { ELEMENTS } from '@pimpampum/set-elements/bench';
import { ELO, fit, logLoss, mulberry, type Fit, type FitOptions, type Game } from './fit.js';
import { play, type ControlKitSpec, type Match, type SideSpec } from './play.js';
import { check, CONTROL_PV, failures, fightLength, ladderKit, N } from './common.js';

const only = flag('--only');
const PV0 = 10;
const logit = (p: number) => Math.log(p / (1 - p));

interface Enc { species: string; count: number; pv: number }
type EncGame = Game & { enc: Enc };

function options(species: readonly string[], anchor: readonly string[] = []): FitOptions {
  const features: Record<string, (g: Game) => number> = {};
  for (const s of species) {
    features[`pv:${s}`] = g => ((g as EncGame).enc.species === s ? -Math.log((g as EncGame).enc.pv / PV0) : 0);
    features[`count:${s}`] = g => ((g as EncGame).enc.species === s ? -Math.log((g as EncGame).enc.count) : 0);
  }
  return { centre: false, ridge: 1e-3, features, anchor };
}

const encGame = (party: string[], enc: Enc, s: number): EncGame => ({ a: party, b: [enc.species], s, enc });

/** The PV per body at which `party` beats `count` bodies of `species` with odds `target`. */
function pvFor(f: Fit, party: string[], species: string, count: number, target: number): number {
  const strength = party.reduce((t, k) => t + f.rating[k], 0) / ELO;
  const lc = Math.log(count), ft = (k: string) => (f.feature[`${k}:${species}`]?.value ?? 0) / ELO;
  const slope = ft("pv") + ft("pvcount") * lc, crowd = ft("count") * lc + ft("count2") * lc * lc;
  // strength − (u + slope × ln(pv/PV0) + crowd × ln count) = logit(target)
  return PV0 * Math.exp((strength - logit(target) - f.rating[species] / ELO - crowd) / Math.max(0.05, slope));
}

function describe(f: Fit, species: readonly string[]): void {
  for (const s of species) {
    const slope = f.feature[`pv:${s}`], crowd = f.feature[`count:${s}`];
    console.log(`  ${s.padEnd(18)} one body at PV ${PV0}: ${f.rating[s].toFixed(0).padStart(5)} ±${(2 * f.se[s]).toFixed(0).padStart(3)} Elo; doubling the PV adds ${(slope.value * Math.LN2).toFixed(0)} ±${(2 * slope.se * Math.LN2).toFixed(0)}; doubling the bodies adds ${(crowd.value * Math.LN2).toFixed(0)} ±${(2 * crowd.se * Math.LN2).toFixed(0)}`);
  }
}

/** Held-out loss on (species, count) cells the fit never saw, beside a constant's. */
function unseenCells(gs: readonly EncGame[], species: readonly string[], members: readonly string[]): { loss: number; coin: number } {
  const cell = (g: EncGame) => `${g.enc.species}×${g.enc.count}`;
  const cells = [...new Set(gs.map(cell))].sort();
  let total = 0, n = 0;
  for (let fold = 0; fold < 4; fold++) {
    const out = new Set(cells.filter((_, i) => i % 4 === fold));
    const test = gs.filter(g => out.has(cell(g))), train = gs.filter(g => !out.has(cell(g)));
    total += logLoss(test, fit(train, options(species, members.filter(m => !species.includes(m))), members).predict) * test.length;
    n += test.length;
  }
  const mean = gs.reduce((t, g) => t + g.s, 0) / gs.length;
  return { loss: total / n, coin: logLoss(gs, () => mean) };
}

interface World {
  species: string[]; members: string[]; controls: ControlKitSpec[];
  /** A party, drawn: its members as the fit names them, and the side to play. */
  party(rand: () => number): { members: string[]; side: SideSpec };
  counts(species: string): number[];
  foes(enc: Enc): SideSpec;
  pvRange: [number, number];
  chunk: number;
}

/** Two waves of fights and the fit over both. */
async function measure(w: World, n: number, seed: number): Promise<{ f: Fit; gs: EncGame[]; rounds: string }> {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const [lo, hi] = w.pvRange;
  const wave = async (size: number, offset: number, pvOf: (party: string[], s: string, count: number) => number) => {
    const drawn = Array.from({ length: size }, () => {
      const party = w.party(rand), species = pick(w.species), count = pick(w.counts(species));
      const enc: Enc = { species, count, pv: Math.max(1, Math.min(hi * 2, Math.round(pvOf(party.members, species, count)))) };
      return { party, enc };
    });
    const matches: Match[] = drawn.map((d, i) => ({ a: d.party.side, b: w.foes(d.enc), seed: seed * 1_000_000 + offset + i }));
    const p = await play(matches, w.controls, undefined, w.chunk);
    return { gs: drawn.map((d, i) => encGame(d.party.members, d.enc, p[i].s)), p };
  };
  const first = await wave(Math.floor(n / 3), 0, () => lo * Math.exp(rand() * Math.log(hi / lo)));
  const rough = fit(first.gs, options(w.species, w.members.filter(m => !w.species.includes(m))), w.members);
  // Around the PV the first fit calls even, a factor of 1.7 either way.
  const second = await wave(n - Math.floor(n / 3), 500_000, (party, s, count) => pvFor(rough, party, s, count, 0.5) * Math.exp((rand() * 2 - 1) * Math.log(1.7)));
  const gs = [...first.gs, ...second.gs];
  return { f: fit(gs, options(w.species, w.members.filter(m => !w.species.includes(m))), w.members), gs, rounds: fightLength([...first.p, ...second.p]) };
}

/** Ask the rating for the PV of a `target` fight, play it, and return predicted against played. */
/**
 * Ask the rating for the PV of a `target` fight, then find that PV by playing:
 * the fight at the PV named and at PVs around it, the crossing read off the
 * played win rates. The miss is in PV, the unit the balancer answers in (one
 * PV point is worth many points of win rate where a fight is this steep).
 */
async function asBalancer(w: World, f: Fit, asks: { label: string; party: { members: string[]; side: SideSpec }; species: string; count: number }[], target: number, games: number, seed: number): Promise<{ rows: string[]; meanMiss: number; worst: number }> {
  const probes: Match[] = [];
  const asked = asks.map(a => {
    const named = Math.max(1, Math.round(pvFor(f, a.party.members, a.species, a.count, target)));
    const pvs = [...new Set([0.6, 0.75, 0.9, 1, 1.1, 1.3, 1.6].map(k => Math.max(1, Math.round(named * k))).concat(Math.max(1, named - 1), named + 1))].sort((x, y) => x - y);
    const from = probes.length;
    for (const pv of pvs) for (let i = 0; i < games; i++) probes.push({ a: a.party.side, b: w.foes({ species: a.species, count: a.count, pv }), seed: seed * 1_000_000 + probes.length });
    return { ...a, named, pvs, from };
  });
  const p = await play(probes, w.controls, undefined, w.chunk);
  let meanMiss = 0, worst = 0;
  const rows = asked.map(a => {
    const rate = a.pvs.map((_, k) => p.slice(a.from + k * games, a.from + (k + 1) * games).reduce((t, x) => t + x.s, 0) / games);
    // The party's win rate falls as PV grows: the first step that crosses the target, interpolated.
    let truth = rate[0] < target ? a.pvs[0] : a.pvs[a.pvs.length - 1];
    for (let k = 0; k + 1 < a.pvs.length; k++) if (rate[k] >= target && rate[k + 1] < target) { truth = a.pvs[k] + (a.pvs[k + 1] - a.pvs[k]) * (rate[k] - target) / (rate[k] - rate[k + 1]); break; }
    const miss = Math.abs(a.named - truth) / truth;
    meanMiss += miss / asked.length;
    worst = Math.max(worst, miss);
    return `${a.label.padEnd(30)} the rating says PV ${String(a.named).padStart(3)} (played: ${(100 * rate[a.pvs.indexOf(a.named)]).toFixed(0)}%); the ${(100 * target).toFixed(0)}% fight is at PV ${truth.toFixed(1)}; one PV point moves the win rate about ${(100 * Math.abs(rate[0] - rate[rate.length - 1]) / Math.max(1, a.pvs[a.pvs.length - 1] - a.pvs[0])).toFixed(0)} points`;
  });
  return { rows, meanMiss, worst };
}

async function controls(): Promise<void> {
  const n = N(12000);
  console.log('=== CONTROLS (vanilla heroes as the party; vanilla bodies as the creatures) ===');
  const partyKits = [5, 6, 7].map(r => ladderKit(`hero${r}`, r));
  const mobs: Record<string, number> = { 'mob-rung4': 4, 'mob-rung6': 6, 'mob-rung6-twin': 6, 'mob-rung8': 8 };
  const heroSide = (ks: string[]): SideSpec => ({ heroes: ks.map(kit => ({ kit, level: 3, pv: CONTROL_PV })) });
  const w: World = {
    species: Object.keys(mobs), members: [...partyKits.map(k => k.id), ...Object.keys(mobs)],
    controls: [...partyKits, ...Object.entries(mobs).map(([id, r]) => ladderKit(id, r))],
    party: rand => { const ks = Array.from({ length: 3 }, () => partyKits[Math.floor(rand() * partyKits.length)].id); return { members: ks, side: heroSide(ks) }; },
    counts: () => [1, 2, 3, 5, 6],
    foes: enc => ({ heroes: Array.from({ length: enc.count }, () => ({ kit: enc.species, level: 3, pv: enc.pv })) }),
    pvRange: [3, 40], chunk: 60,
  };
  const { f, gs, rounds } = await measure(w, n, 71);
  console.log(`\n${n} fights (${rounds}), the party wins ${(100 * gs.reduce((t, g) => t + g.s, 0) / n).toFixed(0)}%`);
  describe(f, w.species);
  const r = f.rating, se = f.se, ft = f.feature;
  check('a higher rung is a harder body, every step clear', r['mob-rung6'] - r['mob-rung4'] > 2 * Math.hypot(se['mob-rung6'], se['mob-rung4']) && r['mob-rung8'] - r['mob-rung6'] > 2 * Math.hypot(se['mob-rung8'], se['mob-rung6']), w.species.map(s => `${s} ${r[s].toFixed(0)}`).join(', '));
  check('twin species rate the same', Math.abs(r['mob-rung6'] - r['mob-rung6-twin']) < 3 * Math.hypot(se['mob-rung6'], se['mob-rung6-twin']) && Math.abs(ft['pv:mob-rung6'].value - ft['pv:mob-rung6-twin'].value) < 3 * Math.hypot(ft['pv:mob-rung6'].se, ft['pv:mob-rung6-twin'].se), `${r['mob-rung6'].toFixed(0)} and ${r['mob-rung6-twin'].toFixed(0)}; PV slopes ${ft['pv:mob-rung6'].value.toFixed(0)} and ${ft['pv:mob-rung6-twin'].value.toFixed(0)}`);
  check('more PV and more bodies are harder', w.species.every(s => ft[`pv:${s}`].value > 3 * ft[`pv:${s}`].se && ft[`count:${s}`].value > 3 * ft[`count:${s}`].se), w.species.map(s => `${ft[`pv:${s}`].value.toFixed(0)} / ${ft[`count:${s}`].value.toFixed(0)}`).join(', '));
  const u = unseenCells(gs, w.species, w.members);
  console.log(`  on (species, count) cells never fitted: loss ${u.loss.toFixed(3)} against ${u.coin.toFixed(3)} for a constant`);
  const party = { members: ['hero5', 'hero6', 'hero7'], side: heroSide(['hero5', 'hero6', 'hero7']) };
  const b = await asBalancer(w, f, w.species.map(s => ({ label: `${s} ×4`, party, species: s, count: 4 })), 0.6, 300, 72);
  for (const row of b.rows) console.log(`    ${row}`);
  console.log(`  (a finding, not a control: at a count it never saw the rating names the PV within ${(100 * b.worst).toFixed(0)}% at worst, ${(100 * b.meanMiss).toFixed(0)}% on average)`);
}

async function elements(): Promise<void> {
  const n = N(24000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  const counts: Record<string, number[]> = { 'soldat-del-foc': [3, 4, 5, 7, 9], shirshu: [1, 2, 3], unagi: [1, 2, 3, 4], 'arquer-yuyan': [1, 2, 3] };
  const levels = [3, 6, 10];
  const member = (kit: string, level: number) => `${kit}@${level}`;
  const partyOf = (ks: string[], level: number) => ({ members: ks.map(k => member(k, level)), side: { heroes: ks.map(kit => ({ kit, level })) } as SideSpec });
  const w: World = {
    species: Object.keys(counts), members: [...levels.flatMap(l => kits.map(k => member(k, l))), ...Object.keys(counts)], controls: [],
    party: rand => partyOf(Array.from({ length: 4 }, () => kits[Math.floor(rand() * kits.length)]), levels[Math.floor(rand() * levels.length)]),
    counts: s => counts[s],
    foes: enc => ({ creatures: [{ enemyId: enc.species, count: enc.count, pv: enc.pv }] }),
    pvRange: [3, 80], chunk: 40,
  };
  console.log('\n=== THE ELEMENTS SET (four heroes of drawn kits at level 3, 6 or 10 against one species) ===');
  const { f, gs, rounds } = await measure(w, n, 81);
  console.log(`\n${n} fights (${rounds}), the party wins ${(100 * gs.reduce((t, g) => t + g.s, 0) / n).toFixed(0)}%`);
  describe(f, w.species);
  for (const l of levels) console.log(`  heroes at level ${l}: ${kits.map(k => `${k} ${f.rating[member(k, l)].toFixed(0)}`).join(', ')} (±${(2 * f.se[member(kits[0], l)]).toFixed(0)})`);
  const u = unseenCells(gs, w.species, w.members);
  console.log(`  on (species, count) cells never fitted: loss ${u.loss.toFixed(3)} against ${u.coin.toFixed(3)} for a constant`);

  const reference = ['waterbender', 'earthbender', 'firebender', 'airbender'];
  const shapes: [string, number][] = [['soldat-del-foc', 7], ['shirshu', 2], ['unagi', 3], ['arquer-yuyan', 2]];
  const asks = levels.flatMap(level => shapes.map(([species, count]) => ({ label: `level ${level}, ${species} ×${count}`, party: partyOf(reference, level), species, count })));
  const b = await asBalancer(w, f, asks, 0.6, 300, 82);
  console.log('\n  the rating as a balancer (the reference party; the PV it names for a 60% fight, against the PV found by playing 300 fights at each PV around it):');
  for (const row of b.rows) console.log(`    ${row}`);
  console.log(`    mean miss ${(100 * b.meanMiss).toFixed(0)}% of the PV, worst ${(100 * b.worst).toFixed(0)}%`);

  console.log('\n  against the encounter solver (level 10, target 60%):');
  for (const [s, count] of shapes) {
    const started = Date.now();
    const solved = ELEMENTS.solveEncounter([{ enemyId: s, count }], { characters: reference.map((k, i) => ELEMENTS.hero(`Heroi ${i + 1}`, k, 10)) }, 0.6);
    const pv = Math.max(1, Math.round(pvFor(f, reference.map(k => member(k, 10)), s, count, 0.6)));
    console.log(`    ${s} ×${count}: the solver says PV ${solved?.groups[0]?.pv ?? 'none'}${solved?.clamped ? ' (clamped)' : ''} in ${((Date.now() - started) / 1000).toFixed(0)}s, the rating says ${pv}`);
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
