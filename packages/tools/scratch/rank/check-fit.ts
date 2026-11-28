/**
 * SCRATCH: the rating maths on games drawn from a known model, before any
 * fight is played. Each line states what must come out and whether it did.
 *
 * bench-exempt(seeded): seeded by `mulberry`.
 */
import { alphaRank, counterGain, ELO, fit, ladderShare, mulberry, nashAverage, onlineElo, pairLogits, rmsGap, shuffled, spearman, trueSkill, type Game } from './fit.js';

const rand = mulberry(7);
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
let failed = 0;
const check = (name: string, ok: boolean, detail: string) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); };

/** 2v2 games from true ratings (Elo) and an optional pair counter (Elo, antisymmetric). */
function draw(truth: Record<string, number>, n: number, counter: (x: string, y: string) => number = () => 0): Game[] {
  const ms = Object.keys(truth);
  return Array.from({ length: n }, () => {
    const a = [pick(ms), pick(ms)], b = [pick(ms), pick(ms)];
    let z = a.reduce((t, m) => t + truth[m], 0) - b.reduce((t, m) => t + truth[m], 0);
    for (const x of a) for (const y of b) z += counter(x, y);
    return { a, b, s: rand() < sig(z / ELO) ? 1 : 0 };
  });
}

// 1. A ladder is recovered, with honest error bars.
const ladder = { k1: -200, k2: -100, k3: 0, k4: 100, k5: 200, k6: 0 };
const g1 = draw(ladder, 6000);
const f1 = fit(g1);
const worstZ = Math.max(...f1.members.map(m => Math.abs(f1.rating[m] - ladder[m as keyof typeof ladder]) / f1.se[m]));
check('ladder recovered', worstZ < 3 && rmsGap(f1.rating, ladder) < 20, `rms gap ${rmsGap(f1.rating, ladder).toFixed(1)} Elo, worst miss ${worstZ.toFixed(1)} SE, SE about ${f1.se.k3.toFixed(1)}`);
check('twins tie', Math.abs(f1.rating.k3 - f1.rating.k6) < 3 * Math.hypot(f1.se.k3, f1.se.k6), `k3 − k6 = ${(f1.rating.k3 - f1.rating.k6).toFixed(1)}`);

// 2. On a pure ladder a counter table predicts nothing more.
const cg1 = counterGain(g1);
check('no counters on a ladder', cg1.gain < 2 * Math.max(cg1.gainSd, 0.3), `held-out gain ${cg1.gain.toFixed(2)} ±${cg1.gainSd.toFixed(2)} (thousandths of a nat a game)`);

// 3. Rock-paper-scissors on top of equal ratings: ratings tie, the table shows the cycle.
const rps = { R: 0, P: 0, S: 0, N: 0 };
const beats: Record<string, string> = { R: 'S', S: 'P', P: 'R' };
const cyc = (x: string, y: string) => (beats[x] === y ? 150 : beats[y] === x ? -150 : 0);
const g3 = draw(rps, 6000, cyc);
const plain3 = fit(g3), f3 = fit(g3, { counterRidge: 10 });
const cg3 = counterGain(g3);
check('rps ratings tie', Math.max(...plain3.members.map(m => Math.abs(plain3.rating[m]) / plain3.se[m])) < 3, plain3.members.map(m => `${m} ${plain3.rating[m].toFixed(0)}`).join(', '));
check('rps table shows the cycle', ['R', 'S', 'P'].every(x => f3.counter![x][beats[x]] > 3 * f3.counterSe![x][beats[x]]) && cg3.gain > 5 * Math.max(cg3.gainSd, 0.3),
  `R>S ${f3.counter!.R.S.toFixed(0)}, S>P ${f3.counter!.S.P.toFixed(0)}, P>R ${f3.counter!.P.R.toFixed(0)} (true 150), SE ${f3.counterSe!.R.S.toFixed(0)}; held-out gain ${cg3.gain.toFixed(1)} ±${cg3.gainSd.toFixed(1)}`);
check('ladder share', ladderShare(pairLogits(fit(g1, { counterRidge: 10 }))) > 0.9 && ladderShare(pairLogits(f3)) < 0.2,
  `ladder ${ladderShare(pairLogits(fit(g1, { counterRidge: 10 }))).toFixed(2)}, rps ${ladderShare(pairLogits(f3)).toFixed(2)}`);

// 4. Online Elo and TrueSkill land where the batch fit does; how much the order moves them.
const runs = Array.from({ length: 20 }, (_, i) => onlineElo(shuffled(g1, mulberry(100 + i)), 16));
const orderSd = Math.sqrt(runs.reduce((t, r) => t + (r.k5 - runs.reduce((u, q) => u + q.k5, 0) / runs.length) ** 2, 0) / runs.length);
check('online Elo near batch', rmsGap(runs[0], f1.rating) < 40 && spearman(runs[0], f1.rating) > 0.9, `rms gap ${rmsGap(runs[0], f1.rating).toFixed(1)}, one member's spread over 20 orders ${orderSd.toFixed(1)} (batch SE ${f1.se.k5.toFixed(1)})`);
const ts = trueSkill(g1);
check('TrueSkill near batch', rmsGap(ts.elo, f1.rating) < 25 && spearman(ts.elo, f1.rating) > 0.9, `rms gap ${rmsGap(ts.elo, f1.rating).toFixed(1)}, its SE ${ts.eloSe.k3.toFixed(1)} against the batch's ${f1.se.k3.toFixed(1)}`);

// 5. Clones: rock twice more. The plain rating now favours paper; Nash averaging must not.
const withClones = { ...rps, R2: 0, R3: 0 };
const cyc2 = (x: string, y: string) => cyc(x[0], y[0]);
const g5 = draw(withClones, 12000, cyc2);
const f5 = fit(g5, { counterRidge: 10 }), plain5 = fit(g5);
const na = nashAverage(pairLogits(f5));
const naOf = Object.fromEntries(f5.members.map((m, i) => [m, na.rating[i]]));
check('clones bend the plain rating', plain5.rating.P - plain5.rating.S > 3 * Math.hypot(plain5.se.P, plain5.se.S), `P ${plain5.rating.P.toFixed(0)}, S ${plain5.rating.S.toFixed(0)}, R ${plain5.rating.R.toFixed(0)}`);
check('Nash averaging is clone-proof', Math.max(...['R', 'P', 'S'].map(m => Math.abs(naOf[m]))) < 20, `R ${naOf.R.toFixed(0)}, P ${naOf.P.toFixed(0)}, S ${naOf.S.toFixed(0)}; rock's mass over its clones ${(na.mix[f5.members.indexOf('R')] + na.mix[f5.members.indexOf('R2')] + na.mix[f5.members.indexOf('R3')]).toFixed(2)}`);
const win = pairLogits(f1).map(row => row.map(sig));
const ar = alphaRank(win);
check('α-rank puts the top of a ladder first', ar.indexOf(Math.max(...ar)) === f1.members.indexOf('k5'), f1.members.map((m, i) => `${m} ${ar[i].toFixed(2)}`).join(', '));
const ar5 = alphaRank(pairLogits(f5).map(row => row.map(sig)));
console.log(`     α-rank with clones: ${f5.members.map((m, i) => `${m} ${ar5[i].toFixed(2)}`).join(', ')}`);

console.log(failed ? `\n${failed} FAILED` : '\nall held');
process.exitCode = failed ? 1 : 0;
