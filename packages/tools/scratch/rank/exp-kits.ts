/**
 * SCRATCH, EXPERIMENT 1: ranking KITS. A party's strength is the sum of its
 * kits' ratings, fitted on mixed 2v2 hero fights, the production AI both sides.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-kits.ts [--games 4000] [--only controls|elements]
 *
 * bench-exempt(seeded): matchups from `mulberry`; each fight on its own seed.
 */
import { flag } from '@pimpampum/bench';
import { alphaRank, counterGain, fit, ladderShare, mulberry, nashAverage, onlineElo, pairLogits, rmsGap, shuffled, spearman, trueSkill, type Game } from './fit.js';
import { play, type ControlKitSpec, type HeroSpec, type Match } from './play.js';
import { asGames, baneKit, check, controlHero, counters, failures, fightLength, ladderKit, N, table } from './common.js';

const only = flag('--only');
const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** `n` 2v2 fights with each seat drawn by `drawSide`; `against(side)` may redraw the other side. */
function matchups(n: number, seed: number, hero: (kit: string) => HeroSpec, pool: readonly string[], forced?: (kit: string) => readonly string[] | undefined): Match[] {
  const rand = mulberry(seed);
  const pick = (xs: readonly string[]) => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    let a = [pick(pool), pick(pool)], b = [pick(pool), pick(pool)];
    // A kit with a forced schedule: whoever faces it comes from its list, and it never faces itself.
    const fa = a.map(k => forced?.(k)).find(Boolean), fb = b.map(k => forced?.(k)).find(Boolean);
    if (fa) b = [pick(fa), pick(fa)]; else if (fb) a = [pick(fb), pick(fb)];
    return { a: { heroes: a.map(hero) }, b: { heroes: b.map(hero) }, seed: seed * 1000 + i };
  });
}

function methods(games: readonly Game[], label: string): void {
  const plain = fit(games);
  const cg = counterGain(games);
  const withTable = fit(games, { counterRidge: cg.ridge });
  const logits = pairLogits(withTable);
  const na = nashAverage(logits);
  const ar = alphaRank(logits.map(r => r.map(sig)));
  const elo = Array.from({ length: 10 }, (_, i) => onlineElo(shuffled(games, mulberry(50 + i)), 16));
  const eloMean = Object.fromEntries(plain.members.map(m => [m, elo.reduce((t, r) => t + (r[m] ?? 0), 0) / elo.length]));
  const eloSd = Math.sqrt(plain.members.reduce((t, m) => t + elo.reduce((u, r) => u + ((r[m] ?? 0) - eloMean[m]) ** 2, 0) / elo.length, 0) / plain.members.length);
  const ts = trueSkill(shuffled(games, mulberry(9)));
  console.log(`\n${label}: ${games.length} fights`);
  console.log(table(plain, games, {
    'Elo K16': elo[0], TrueSkill: ts.elo,
    Nash: Object.fromEntries(plain.members.map((m, i) => [m, na.rating[i]])),
    'Nash mix%': Object.fromEntries(plain.members.map((m, i) => [m, 100 * na.mix[i]])),
    'α-rank%': Object.fromEntries(plain.members.map((m, i) => [m, 100 * ar[i]])),
  }));
  console.log(`  online Elo (K=16, one pass): rank agreement with the batch fit ${spearman(elo[0], plain.rating).toFixed(2)}, gap ${rmsGap(elo[0], plain.rating).toFixed(0)} Elo, a rating moves ±${eloSd.toFixed(0)} with the order of the games`);
  console.log(`  TrueSkill: rank agreement ${spearman(ts.elo, plain.rating).toFixed(2)}, gap ${rmsGap(ts.elo, plain.rating).toFixed(0)} Elo`);
  console.log(`  counter table: held-out gain ${cg.gain.toFixed(2)} ±${cg.gainSd.toFixed(2)} thousandths of a nat a game (ridge ${cg.ridge}); ladder share ${ladderShare(logits).toFixed(2)}`);
  const cs = counters(withTable);
  console.log(cs.length ? `  counters past 3 SE:\n    ${cs.join('\n    ')}` : '  no counter past 3 SE');
}

async function controls(): Promise<void> {
  const n = N(4000);
  console.log('=== CONTROLS (vanilla kits on the real engine, PV 15) ===');

  // A. The ladder, a twin, and a kit with a hard schedule.
  const ladder: ControlKitSpec[] = [4, 5, 6, 7, 8].map(r => ladderKit(`rung${r}`, r));
  const kitsA = [...ladder, ladderKit('rung6-twin', 6), ladderKit('rung6-hard', 6)];
  const poolA = kitsA.map(k => k.id);
  const mA = matchups(n, 11, controlHero, poolA, k => (k === 'rung6-hard' ? ['rung7', 'rung8'] : undefined));
  const pA = await play(mA, kitsA);
  const gA = asGames(mA, pA);
  console.log(`\nA. ladder: ${fightLength(pA)}`);
  const fA = fit(gA);
  const raw = Object.fromEntries(poolA.map(k => { const gs = gA.filter(g => g.a.includes(k) || g.b.includes(k)); return [k, gs.reduce((t, g) => t + (g.a.includes(k) ? g.s : 1 - g.s), 0) / gs.length]; }));
  methods(gA, 'A. ladder, twin, hard schedule');
  const order = ['rung4', 'rung5', 'rung6', 'rung7', 'rung8'];
  check('ladder in order, every step clear', order.slice(1).every((k, i) => fA.rating[k] - fA.rating[order[i]] > 2 * Math.hypot(fA.se[k], fA.se[order[i]])), order.map(k => `${k} ${fA.rating[k].toFixed(0)}`).join(' < '));
  const tie = (x: string, y: string) => Math.abs(fA.rating[x] - fA.rating[y]) < 3 * Math.hypot(fA.se[x], fA.se[y]);
  check('twins tie', tie('rung6', 'rung6-twin'), `rung6 ${fA.rating.rung6.toFixed(0)}, twin ${fA.rating['rung6-twin'].toFixed(0)} (±${(2 * fA.se.rung6).toFixed(0)})`);
  check('a hard schedule is not held against a kit', tie('rung6', 'rung6-hard') && raw['rung6-hard'] < raw.rung6 - 0.08,
    `rung6-hard rates ${fA.rating['rung6-hard'].toFixed(0)} ±${(2 * fA.se['rung6-hard']).toFixed(0)} against rung6's ${fA.rating.rung6.toFixed(0)}, while its raw score is ${(100 * raw['rung6-hard']).toFixed(0)}% against ${(100 * raw.rung6).toFixed(0)}%`);
  const cgA = counterGain(gA);
  check('no counter table on a ladder', cgA.gain < 2 * Math.max(cgA.gainSd, 0.3), `held-out gain ${cgA.gain.toFixed(2)} ±${cgA.gainSd.toFixed(2)}`);

  // B. Rock, paper, scissors (each kit's Strike adds 2d6 against its prey), beside a plain kit.
  const rps = [baneKit('rock', 6, 'scissors', '2d6'), baneKit('scissors', 6, 'paper', '2d6'), baneKit('paper', 6, 'rock', '2d6'), ladderKit('plain', 6)];
  const mB = matchups(n, 12, controlHero, rps.map(k => k.id));
  const pB = await play(mB, rps);
  const gB = asGames(mB, pB);
  methods(gB, 'B. rock-paper-scissors and a plain kit');
  const fB = fit(gB), cgB = counterGain(gB), tB = fit(gB, { counterRidge: cgB.ridge });
  check('the cycle kits rate the same', ['rock', 'paper', 'scissors'].every(x => ['rock', 'paper', 'scissors'].every(y => Math.abs(fB.rating[x] - fB.rating[y]) < 3 * Math.hypot(fB.se[x], fB.se[y]))), ['rock', 'paper', 'scissors'].map(k => `${k} ${fB.rating[k].toFixed(0)}`).join(', '));
  const edges: [string, string][] = [['rock', 'scissors'], ['scissors', 'paper'], ['paper', 'rock']];
  check('the table shows the cycle', edges.every(([x, y]) => tB.counter![x][y] > 3 * tB.counterSe![x][y]) && cgB.gain > 3 * Math.max(cgB.gainSd, 0.3),
    `${edges.map(([x, y]) => `${x}>${y} +${tB.counter![x][y].toFixed(0)}`).join(', ')}; held-out gain ${cgB.gain.toFixed(1)} ±${cgB.gainSd.toFixed(1)}`);

  // C. Clones: rock fielded under three names. Mean-of-the-field scores bend; Nash averaging must not.
  const clones = [baneKit('rock', 6, 'scissors', '2d6'), baneKit('rock2', 6, 'scissors', '2d6'), baneKit('rock3', 6, 'scissors', '2d6'), baneKit('scissors', 6, 'paper', '2d6'), baneKit('paper', 6, 'rock,rock2,rock3', '2d6')];
  const poolC = clones.map(k => k.id);
  const mC = matchups(n, 13, controlHero, poolC);
  const pC = await play(mC, clones);
  const gC = asGames(mC, pC);
  methods(gC, 'C. rock under three names');
  const fC = fit(gC), cgC = counterGain(gC), tC = fit(gC, { counterRidge: cgC.ridge });
  const naC = nashAverage(pairLogits(tC));
  const naOf = Object.fromEntries(tC.members.map((m, i) => [m, naC.rating[i]]));
  check('clones bend the plain rating', fC.rating.paper - fC.rating.scissors > 3 * Math.hypot(fC.se.scissors, fC.se.paper), `rock ${fC.rating.rock.toFixed(0)}, paper ${fC.rating.paper.toFixed(0)}, scissors ${fC.rating.scissors.toFixed(0)}`);
  check('Nash averaging does not', Math.max(...['rock', 'paper', 'scissors'].map(k => Math.abs(naOf[k]))) < 40, ['rock', 'paper', 'scissors'].map(k => `${k} ${naOf[k].toFixed(0)}`).join(', '));
}

async function elements(): Promise<void> {
  const n = N(6000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  console.log('\n=== THE ELEMENTS SET (2v2, kits drawn at random, the set\'s own PV) ===');
  for (const level of [3, 6, 10]) {
    const m = matchups(n, 20 + level, kit => ({ kit, level }), kits);
    const p = await play(m);
    const g = asGames(m, p);
    console.log(`\nlevel ${level}: ${fightLength(p)}`);
    methods(g, `level ${level}`);
    const seat = fit(g, { features: { seat: () => 1 } }).feature.seat;
    console.log(`  the first seat is worth ${seat.value.toFixed(0)} ±${(2 * seat.se).toFixed(0)} Elo`);
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
