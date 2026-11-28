/**
 * SCRATCH, EXPERIMENT 7: the doc's other two ways to hold counters, and its
 * tier read-out, on the kits experiment's fights.
 *
 *  mElo     the team form of the doc's section 10: a rating and a 2-vector per
 *           kit; a kit counters what sits a quarter turn ahead of it.
 *  Elo-RCC  Lin and Wu's online version: Elo ratings for whole sides, each
 *           side in one of M categories, an M×M table of corrections, all
 *           updated fight by fight.
 *  Top-D    how many sides can stand up to the best one, within a tolerance.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-counters.ts [--games 6000] [--only controls|elements]
 *
 * bench-exempt(seeded): the kits experiment's matchups by the same seeds; weights from `mulberry`.
 */
import { flag } from '@pimpampum/bench';
import { counterGain, ELO, fit, membersOf, mulberry, shuffled, type Game } from './fit.js';
import { heldOut, sideKey } from './neural.js';
import { play } from './play.js';
import { asGames, baneKit, check, controlHero, failures, ladderKit, matchups, N } from './common.js';

const only = flag('--only');
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

// --- mElo, summed over a team -------------------------------------------------------

interface MElo { rating: Record<string, number>; vec: Record<string, [number, number]>; predict(g: Pick<Game, 'a' | 'b'>): number }

/** logit = Σr(a) − Σr(b) + Σ over pairs (a, b) of c(a)ᵀ Ω c(b), Ω a quarter turn. Ratings start from the plain fit; Adam on the log loss. */
function mElo(games: readonly Game[], members: readonly string[], seed = 1, epochs = 400, decay = 2e-3): MElo {
  const n = members.length, idx = new Map(members.map((m, i) => [m, i]));
  const rand = mulberry(seed);
  const plain = fit(games, {}, members);
  // Parameters: r (n), then c (2 each).
  const p = [...members.map(m => plain.rating[m] / ELO), ...Array.from({ length: 2 * n }, () => (rand() - 0.5) * 0.2)];
  const m1 = new Array<number>(3 * n).fill(0), m2 = new Array<number>(3 * n).fill(0);
  const data = games.map(g => ({ a: g.a.map(m => idx.get(m)!), b: g.b.map(m => idx.get(m)!), s: g.s }));
  const z = (a: number[], b: number[]): number => {
    let t = 0;
    for (const i of a) t += p[i];
    for (const j of b) t -= p[j];
    for (const i of a) for (const j of b) t += p[n + 2 * i] * p[n + 2 * j + 1] - p[n + 2 * i + 1] * p[n + 2 * j];
    return t;
  };
  for (let e = 1; e <= epochs; e++) {
    const grad = new Array<number>(3 * n).fill(0);
    for (const d of data) {
      const err = sigmoid(z(d.a, d.b)) - d.s;
      for (const i of d.a) grad[i] += err;
      for (const j of d.b) grad[j] -= err;
      for (const i of d.a) for (const j of d.b) {
        grad[n + 2 * i] += err * p[n + 2 * j + 1]; grad[n + 2 * i + 1] -= err * p[n + 2 * j];
        grad[n + 2 * j + 1] += err * p[n + 2 * i]; grad[n + 2 * j] -= err * p[n + 2 * i + 1];
      }
    }
    for (let k = 0; k < 3 * n; k++) {
      const g = grad[k] / data.length + (k >= n ? decay * p[k] : 0);
      m1[k] = 0.9 * m1[k] + 0.1 * g; m2[k] = 0.999 * m2[k] + 0.001 * g * g;
      p[k] -= 0.03 * (m1[k] / (1 - 0.9 ** e)) / (Math.sqrt(m2[k] / (1 - 0.999 ** e)) + 1e-8);
    }
  }
  return {
    rating: Object.fromEntries(members.map((m, i) => [m, p[i] * ELO])),
    vec: Object.fromEntries(members.map((m, i) => [m, [p[n + 2 * i], p[n + 2 * i + 1]] as [number, number]])),
    predict: g => sigmoid(z(g.a.map(m => idx.get(m)!), g.b.map(m => idx.get(m)!))),
  };
}

const polar = (v: [number, number]) => ({ length: Math.hypot(v[0], v[1]), angle: (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360 });
function showVectors(m: MElo): string {
  return Object.entries(m.vec).map(([k, v]) => ({ k, ...polar(v) })).sort((x, y) => x.angle - y.angle).map(x => `${x.k} ${x.length.toFixed(2)} at ${x.angle.toFixed(0)}°`).join('; ');
}

// --- Elo-RCC, online ------------------------------------------------------------------

interface Rcc { category: Map<string, number>; table: number[][]; predict(g: Pick<Game, 'a' | 'b'>): number }

/** Whole sides are the competitors. `passes` runs over the games in a shuffled order; the table corrects the win chance itself, as in the paper. */
function eloRcc(games: readonly Game[], M: number, seed = 1, passes = 3, k = 16, rate = 0.05): Rcc {
  const rand = mulberry(seed);
  const elo = new Map<string, number>(), cat = new Map<string, number>(), resid = new Map<string, { sum: number[]; n: number[] }>();
  const T = Array.from({ length: M }, () => new Array<number>(M).fill(0));
  const of = (s: string) => { if (!elo.has(s)) { elo.set(s, 0); cat.set(s, Math.floor(rand() * M)); resid.set(s, { sum: new Array<number>(M).fill(0), n: new Array<number>(M).fill(0) }); } return s; };
  const base = (a: string, b: string) => sigmoid((elo.get(a)! - elo.get(b)!) / ELO);
  for (let pass = 0; pass < passes; pass++) {
    for (const g of shuffled(games, rand)) {
      const a = of(sideKey(g.a)), b = of(sideKey(g.b));
      const e = base(a, b), r = g.s - e;
      elo.set(a, elo.get(a)! + k * r); elo.set(b, elo.get(b)! - k * r);
      const ca = cat.get(a)!, cb = cat.get(b)!;
      if (ca !== cb) { T[ca][cb] += rate * (r - T[ca][cb]); T[cb][ca] = -T[ca][cb]; }
      const ra = resid.get(a)!, rb = resid.get(b)!;
      ra.sum[cb] += r; ra.n[cb]++; rb.sum[ca] -= r; rb.n[ca]++;
      // Each side moves to the category whose row of the table is nearest its own leftovers.
      for (const [s, rs] of [[a, ra], [b, rb]] as const) {
        let best = cat.get(s)!, bestD = Infinity;
        for (let c = 0; c < M; c++) {
          let d = 0;
          for (let m = 0; m < M; m++) if (rs.n[m]) d += rs.n[m] * (rs.sum[m] / rs.n[m] - T[c][m]) ** 2;
          if (d < bestD - 1e-12) { bestD = d; best = c; }
        }
        cat.set(s, best);
      }
    }
  }
  return {
    category: cat, table: T,
    predict: g => {
      const a = sideKey(g.a), b = sideKey(g.b);
      if (!elo.has(a) || !elo.has(b)) return 0.5;
      return clamp(base(a, b) + T[cat.get(a)!][cat.get(b)!]);
    },
  };
}

// --- reading the models -----------------------------------------------------------------

function compare(gs: readonly Game[], ms: readonly number[] = [3, 6]): { sum: number; pair: number; melo: number; rcc: Record<number, number>; sideElo: number } {
  const members = membersOf(gs);
  const gain = (loss: number, base: number) => (base - loss) * 1000;
  const sum = heldOut(gs, train => fit(train, {}, members).predict);
  const cg = counterGain(gs, undefined, 1);
  const pair = gain(heldOut(gs, train => fit(train, { counterRidge: cg.ridge }, members).predict), sum);
  const melo = gain(heldOut(gs, train => mElo(train, members).predict), sum);
  // Elo on whole sides with no table: what the online ratings alone give, so the table's part can be read.
  const sideElo = gain(heldOut(gs, train => eloRcc(train, 1).predict), sum);
  const rcc: Record<number, number> = {};
  for (const m of ms) rcc[m] = gain(heldOut(gs, train => eloRcc(train, m).predict), sum);
  return { sum, pair, melo, rcc, sideElo };
}

function show(c: ReturnType<typeof compare>): void {
  console.log(`  held-out loss of the sum of kit ratings: ${c.sum.toFixed(4)}. Gain over it, thousandths of a nat a game (noise about ±1):`);
  console.log(`    sum + pair counter table (batch)   ${c.pair.toFixed(1).padStart(7)}`);
  console.log(`    mElo, 2 dimensions, summed teams   ${c.melo.toFixed(1).padStart(7)}`);
  console.log(`    online Elo on whole sides, no table${c.sideElo.toFixed(1).padStart(7)}`);
  for (const [m, g] of Object.entries(c.rcc)) console.log(`    Elo-RCC online, ${m} categories        ${g.toFixed(1).padStart(7)}`);
}

/** Top-D: the sides that hold at least 50% − `tolerance` against the best-rated side, by one rating per side. */
function topD(gs: readonly Game[], tolerance = 0.04): { viable: string[]; all: number; best: string } {
  const sides = gs.map(g => ({ a: [sideKey(g.a)], b: [sideKey(g.b)], s: g.s }));
  const f = fit(sides, { ridge: 0.05 });
  const best = [...f.members].sort((x, y) => f.rating[y] - f.rating[x])[0];
  const viable = f.members.filter(m => f.predict({ a: [m], b: [best] }) >= 0.5 - tolerance).sort((x, y) => f.rating[y] - f.rating[x]);
  return { viable, all: f.members.length, best };
}

async function controls(): Promise<void> {
  const n = N(4000);
  console.log('=== CONTROLS (vanilla kits on the real engine, PV 15) ===');
  const kitsA = [...[4, 5, 6, 7, 8].map(r => ladderKit(`rung${r}`, r)), ladderKit('rung6-twin', 6), ladderKit('rung6-hard', 6)];
  const mA = matchups(n, 11, controlHero, kitsA.map(k => k.id), k => (k === 'rung6-hard' ? ['rung7', 'rung8'] : undefined));
  const gA = asGames(mA, await play(mA, kitsA));
  console.log('\nA. a ladder of kits');
  const cA = compare(gA);
  show(cA);
  check('on a ladder neither mElo nor Elo-RCC beats the sum', Math.max(cA.melo, ...Object.values(cA.rcc)) < 3, `mElo ${cA.melo.toFixed(1)}, Elo-RCC ${Object.values(cA.rcc).map(x => x.toFixed(1)).join(' / ')}`);
  const dA = topD(gA);
  check('Top-D on a ladder: only sides of the top rung stand up to the best', dA.viable.every(s => s.includes('rung8')) , `${dA.viable.length} of ${dA.all}: ${dA.viable.join('; ')}`);

  const rps = [baneKit('rock', 6, 'scissors', '2d6'), baneKit('scissors', 6, 'paper', '2d6'), baneKit('paper', 6, 'rock', '2d6'), ladderKit('plain', 6)];
  const mB = matchups(n, 12, controlHero, rps.map(k => k.id));
  const gB = asGames(mB, await play(mB, rps));
  console.log('\nB. rock-paper-scissors and a plain kit');
  const cB = compare(gB);
  show(cB);
  const mB2 = mElo(gB, membersOf(gB));
  console.log(`  mElo's vectors: ${showVectors(mB2)}`);
  const ang = (k: string) => polar(mB2.vec[k]).angle, turn = (x: string, y: string) => ((ang(y) - ang(x)) % 360 + 360) % 360;
  const turns = [turn('rock', 'scissors'), turn('scissors', 'paper'), turn('paper', 'rock')];
  check('mElo finds the cycle: most of the pair table\'s gain, the three kits a third of a turn apart, the plain kit at the centre', cB.melo > 0.8 * cB.pair && turns.every(t => Math.abs(t - turns[0]) < 30 && Math.abs(Math.min(t, 360 - t) - 120) < 30) && polar(mB2.vec.plain).length < 0.3 * polar(mB2.vec.rock).length,
    `gain ${cB.melo.toFixed(1)} of ${cB.pair.toFixed(1)}; turns ${turns.map(t => t.toFixed(0)).join('°, ')}°; plain ${polar(mB2.vec.plain).length.toFixed(2)} against rock's ${polar(mB2.vec.rock).length.toFixed(2)}`);
  check('Elo-RCC online finds some of it', cB.rcc[3] > cB.sideElo + 10 || cB.rcc[6] > cB.sideElo + 10, `3 categories ${cB.rcc[3].toFixed(1)}, 6 categories ${cB.rcc[6].toFixed(1)}, no table ${cB.sideElo.toFixed(1)}, the batch pair table ${cB.pair.toFixed(1)}`);
}

async function elements(): Promise<void> {
  const n = N(6000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  console.log('\n=== THE ELEMENTS SET (the kits experiment\'s fights) ===');
  for (const level of [3, 6, 10]) {
    const m = matchups(n, 20 + level, kit => ({ kit, level }), kits);
    const g = asGames(m, await play(m));
    console.log(`\nlevel ${level}`);
    show(compare(g));
    console.log(`  mElo's vectors: ${showVectors(mElo(g, membersOf(g)))}`);
    const d = topD(g);
    console.log(`  Top-D (tolerance 4 points): ${d.viable.length} of ${d.all} sides stand up to the best (${d.best}): ${d.viable.slice(0, 10).join('; ')}${d.viable.length > 10 ? '; …' : ''}`);
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
