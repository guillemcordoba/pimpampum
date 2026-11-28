/**
 * SCRATCH, EXPERIMENT 2: ranking PLAY STRATEGIES. Both sides field the same
 * drawn pair of kits; one member plays each side. A roster of strategies is
 * rated from randomly paired fights, in place of growing a pool with the
 * double oracle; "does dumb play lose" is then a rating gap.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-strategies.ts [--games 16000] [--only controls|elements]
 *
 * bench-exempt(seeded): matchups from `mulberry`; each fight on its own seed.
 */
import { always, counterPlan, flag, PLANS, type Plan, type ResponseTable, type Strategy } from '@pimpampum/bench';
import { awarenessOf, describeStrategy, gridOf } from '@pimpampum/playtest';
import { alphaRank, counterGain, fit, ladderShare, mulberry, nashAverage, pairLogits, type Fit, type Game } from './fit.js';
import { play, type ControlKitSpec, type HeroSpec, type Match } from './play.js';
import { check, controlHero, counters, failures, fightLength, ladderKit, N, table } from './common.js';

const only = flag('--only');
const sig = (x: number) => 1 / (1 + Math.exp(-x));

type Kind = 'search' | 'reads' | 'state' | 'dumb';
interface Member { name: string; style: string; kind: Kind }

const S = (name: string, m: Strategy): Member => ({ name, style: `S:${JSON.stringify(m)}`, kind: awarenessOf(m) });
const table6 = (first: Plan, after: (shown: Plan) => Plan): ResponseTable => ({ kind: 'table', first, after: Object.fromEntries(PLANS.map(p => [p, after(p)])) as Record<Plan, Plan> });

/** `n` fights: two members drawn (never the same), both sides on the same drawn kit pair. */
function pairings(n: number, seed: number, roster: readonly Member[], kits: readonly string[], hero: (kit: string) => HeroSpec): Match[] {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    const x = pick(roster);
    let y = pick(roster);
    while (y === x) y = pick(roster);
    const heroes = [pick(kits), pick(kits)].map(hero);
    return { a: { heroes, style: x.style }, b: { heroes, style: y.style }, seed: seed * 1000 + i };
  });
}

function games(matches: readonly Match[], played: readonly { s: number }[], roster: readonly Member[]): Game[] {
  const nameOf = new Map(roster.map(m => [m.style, m.name]));
  return matches.map((m, i) => ({ a: [nameOf.get(m.a.style!)!], b: [nameOf.get(m.b.style!)!], s: played[i].s }));
}

interface Verdict { bestDumb: string; bestAware: string; gap: number; se: number; awareMix: number; red: boolean }

/**
 * Is the best strategy a dumb one? The best dumb member and the best aware
 * one are picked on half the games and their gap read on the other half (a
 * maximum over noisy ratings is biased on the sample it was taken on). Red
 * when the aware one is not clearly ahead. `awareMix` is the share of the
 * Nash mix over the roster that aware members hold.
 */
function verdict(gs: readonly Game[], roster: readonly Member[]): Verdict {
  const half = gs.filter((_, i) => i % 2 === 0), other = gs.filter((_, i) => i % 2 === 1);
  const names = roster.map(m => m.name);
  const pickOn = fit(half, {}, names), readOn = fit(other, {}, names);
  const best = (pred: (m: Member) => boolean) => roster.filter(pred).sort((x, y) => pickOn.rating[y.name] - pickOn.rating[x.name])[0].name;
  const bestDumb = best(m => m.kind === 'dumb'), bestAware = best(m => m.kind !== 'dumb');
  const gap = readOn.rating[bestAware] - readOn.rating[bestDumb], se = Math.hypot(readOn.se[bestAware], readOn.se[bestDumb]);
  const cg = counterGain(gs, [300, 30, 3, 0.3], 1);
  const full = fit(gs, { counterRidge: cg.ridge }, names);
  const mix = nashAverage(pairLogits(full)).mix;
  const awareMix = roster.reduce((t, m) => t + (m.kind !== 'dumb' ? mix[full.members.indexOf(m.name)] : 0), 0);
  return { bestDumb, bestAware, gap, se, awareMix, red: gap < 2 * se };
}

function report(gs: readonly Game[], roster: readonly Member[], label: string, top = 99): { plain: Fit; v: Verdict } {
  const plain = fit(gs, {}, roster.map(m => m.name));
  const cg = counterGain(gs, [300, 100, 30, 10, 3, 1, 0.3], 2);
  const withTable = fit(gs, { counterRidge: cg.ridge }, plain.members);
  const logits = pairLogits(withTable);
  const na = nashAverage(logits), ar = alphaRank(logits.map(r => r.map(sig)));
  const kindOf = new Map(roster.map(m => [m.name, m.kind]));
  console.log(`\n${label}: ${gs.length} fights, ${roster.length} members`);
  const lines = table(plain, gs, {
    Nash: Object.fromEntries(plain.members.map((m, i) => [m, na.rating[i]])),
    'Nash mix%': Object.fromEntries(plain.members.map((m, i) => [m, 100 * na.mix[i]])),
    'α-rank%': Object.fromEntries(plain.members.map((m, i) => [m, 100 * ar[i]])),
  }).split('\n');
  const shown = lines.slice(0, 1 + top);
  console.log(shown.map((l, i) => (i === 0 ? `${l}  kind` : `${l}  ${kindOf.get(l.trim().split(/\s{2,}/)[0]) ?? ''}`)).join('\n'));
  if (lines.length > shown.length) console.log(`  … ${lines.length - shown.length} more below`);
  console.log(`  counter table: held-out gain ${cg.gain.toFixed(2)} ±${cg.gainSd.toFixed(2)} thousandths of a nat a game (ridge ${cg.ridge}); ladder share ${ladderShare(logits).toFixed(2)}`);
  const cs = counters(withTable, 3.5);
  console.log(cs.length ? `  counters past 3.5 SE (${cs.length}):\n    ${cs.slice(0, 12).join('\n    ')}` : '  no counter past 3.5 SE');
  const v = verdict(gs, roster);
  console.log(`  best aware (${v.bestAware}) − best dumb (${v.bestDumb}), read on the other half: ${v.gap.toFixed(0)} ±${(2 * v.se).toFixed(0)} Elo → ${v.red ? 'RED: a dumb strategy plays as well as the best' : 'green: dumb play loses'}; aware share of the Nash mix ${(100 * v.awareMix).toFixed(0)}%`);
  return { plain, v };
}

const DUMB: Member[] = [
  { name: 'spam', style: 'spam', kind: 'dumb' }, { name: 'feeble', style: 'feeble', kind: 'dumb' },
  { name: 'random', style: 'random', kind: 'dumb' }, { name: 'first-legal', style: 'first', kind: 'dumb' },
  // The search, held to part of the hand: no reading, but well chosen.
  { name: 'turtle', style: 'turtle', kind: 'dumb' }, { name: 'attacks-only', style: 'attacks', kind: 'dumb' },
];
const READERS: Member[] = [
  S('counter (opens AD)', table6('AD', counterPlan)), S('counter (opens AA)', table6('AA', counterPlan)), S('counter (opens AF)', table6('AF', counterPlan)),
  S('copycat', table6('AD', p => p)),
  S('counter-the-counter', table6('AD', p => counterPlan(counterPlan(p)))),
  // Answers an attack with one guard, anything else with attacks.
  S('guard-if-attacked', table6('AA', p => (p.includes('A') ? 'AD' : 'AA'))),
  S('punish-focus', table6('AD', p => (p.includes('F') ? 'AA' : 'AD'))),
];
const FIXED: Member[] = PLANS.map(p => S(`always ${p}`, always(p)));

async function controls(): Promise<void> {
  const n = N(6000);
  console.log('=== CONTROLS ===');

  // A. A ladder of play by construction: the AI with more and more of its cards drawn at random.
  const noise: Member[] = [0, 0.25, 0.5, 0.75, 1].map(p => ({ name: `noisy ${p}`, style: `noisy:${p}`, kind: p < 1 ? 'search' : 'dumb' }));
  const rosterA: Member[] = [...noise, { name: 'noisy 0 (twin)', style: 'noisy:0#twin', kind: 'search' }, { name: 'random (clone 1)', style: 'random#1', kind: 'dumb' }, { name: 'random (clone 2)', style: 'random#2', kind: 'dumb' }];
  const kitsA = [5, 6, 7].map(r => ladderKit(`rung${r}`, r));
  const mA = pairings(n, 31, rosterA, kitsA.map(k => k.id), controlHero);
  const pA = await play(mA, kitsA);
  const gA = games(mA, pA, rosterA);
  const { plain: fA, v: vA } = report(gA, rosterA, 'A. the AI with random cards mixed in, on vanilla kits');
  const order = noise.map(m => m.name).reverse();
  check('more random cards, lower rating, every step clear', order.slice(1).every((k, i) => fA.rating[k] - fA.rating[order[i]] > 2 * Math.hypot(fA.se[k], fA.se[order[i]])), order.map(k => `${k}: ${fA.rating[k].toFixed(0)}`).join(' < '));
  check('twins tie', Math.abs(fA.rating['noisy 0'] - fA.rating['noisy 0 (twin)']) < 3 * Math.hypot(fA.se['noisy 0'], fA.se['noisy 0 (twin)']), `${fA.rating['noisy 0'].toFixed(0)} and ${fA.rating['noisy 0 (twin)'].toFixed(0)}`);
  check('the requirement is green when thinking wins', !vA.red, `gap ${vA.gap.toFixed(0)} ±${(2 * vA.se).toFixed(0)}`);

  // B. Attacking simply wins: the guard is 1d4 and the Focus does nothing.
  const brawl: ControlKitSpec = { id: 'brawl', cards: [{ type: 'A', dice: '3d4' }, { type: 'D', dice: '1d4' }, { type: 'F', fx: 'noop' }] };
  const rosterB: Member[] = [{ name: 'ai', style: 'ai', kind: 'search' }, ...DUMB, ...FIXED, ...READERS.slice(0, 4), S('state 0.4/0.4/1', { kind: 'state', guardBelow: 0.4, strikeBelow: 0.4, focusRounds: 1 })];
  const mB = pairings(n, 32, rosterB, ['brawl'], controlHero);
  const pB = await play(mB, [brawl]);
  const { plain: fB, v: vB } = report(games(mB, pB, rosterB), rosterB, `B. a kit where attacking simply wins (${fightLength(pB)})`);
  check('red when attacking simply wins', vB.red, `best aware ${vB.bestAware}, best dumb ${vB.bestDumb}, gap ${vB.gap.toFixed(0)} ±${(2 * vB.se).toFixed(0)}`);
  check('always-attack at the top with the AI, the turtle far below', fB.rating['always AA'] > fB.rating.ai - 3 * Math.hypot(fB.se.ai, fB.se['always AA']) && fB.rating.turtle < fB.rating['always AA'] - 200,
    `always AA ${fB.rating['always AA'].toFixed(0)}, ai ${fB.rating.ai.toFixed(0)}, turtle ${fB.rating.turtle.toFixed(0)}`);

  // C. A triangle by construction: a guard that holds and hits back, a Focus that goes through any guard, an attack that interrupts a Focus.
  const tri: ControlKitSpec = { id: 'tri', cards: [{ type: 'A', dice: '2d6' }, { type: 'D', dice: '6d6', fx: 'riposte', fxDice: '2d6' }, { type: 'F', dice: '2d6', fx: 'blast' }] };
  const rosterC: Member[] = [{ name: 'ai', style: 'ai', kind: 'search' }, ...DUMB, ...FIXED, ...READERS,
    S('mixer thirds', { kind: 'mixer', attack: 0.33, defense: 0.33 }), S('state 0.4/0.4/1', { kind: 'state', guardBelow: 0.4, strikeBelow: 0.4, focusRounds: 1 })];
  const mC = pairings(n, 33, rosterC, ['tri'], controlHero);
  const pC = await play(mC, [tri]);
  const gC = games(mC, pC, rosterC);
  const { plain: fC, v: vC } = report(gC, rosterC, `C. a kit built as a triangle (${fightLength(pC)})`);
  // What the construction guarantees: each one-type strategy loses to the next
  // (so none of the three can lead), and the table must show those three edges.
  // It does NOT guarantee that a reader leads: a fixed split plan may, and does.
  const cgC = counterGain(gC, [30, 3, 1, 0.3], 1);
  const tC = fit(gC, { counterRidge: cgC.ridge }, rosterC.map(m => m.name));
  const edges: [string, string][] = [['always DD', 'always AA'], ['always FF', 'always DD'], ['always AA', 'always FF']];
  // Read on the size of the term and on the fights themselves: a pair that always
  // ends one way has no error bar a fit can state (the likelihood is flat past it).
  const direct = (x: string, y: string) => { const gs = gC.filter(g => (g.a[0] === x && g.b[0] === y) || (g.a[0] === y && g.b[0] === x)); return gs.reduce((t, g) => t + (g.a[0] === x ? g.s : 1 - g.s), 0) / Math.max(1, gs.length); };
  check('the table shows the three edges', edges.every(([x, y]) => tC.counter![x][y] > 150 && direct(x, y) > 0.9), edges.map(([x, y]) => `${x} > ${y} +${tC.counter![x][y].toFixed(0)} (won ${(100 * direct(x, y)).toFixed(0)}% of their fights)`).join(', '));
  const top = Math.max(...rosterC.map(m => fC.rating[m.name]));
  check('no one-type strategy leads', ['always AA', 'always DD', 'always FF'].every(k => fC.rating[k] < top - 100), ['always AA', 'always DD', 'always FF'].map(k => `${k} ${fC.rating[k].toFixed(0)}`).join(', ') + `; the top is ${top.toFixed(0)}`);
  console.log(`  (not a control: the verdict here is ${vC.red ? 'RED' : 'green'}: ${vC.bestAware} − ${vC.bestDumb} = ${vC.gap.toFixed(0)} ±${(2 * vC.se).toFixed(0)})`);
}

async function elements(): Promise<void> {
  const n = N(16000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  const rand = mulberry(5);
  const sample = <T>(xs: T[], k: number): T[] => { const pool = [...xs]; const out: T[] = []; while (out.length < k && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]); return out; };
  const roster: Member[] = [
    { name: 'ai', style: 'ai', kind: 'search' }, { name: 'ai (twice the budget)', style: 'ai2x', kind: 'search' }, { name: 'heuristic (depth 0)', style: 'heuristic', kind: 'search' },
    { name: 'attacks+focus', style: 'attacks+focus', kind: 'search' }, { name: 'attacks+defense', style: 'attacks+defense', kind: 'search' },
    { name: 'lean Power', style: 'Power', kind: 'search' }, { name: 'lean Protect', style: 'Protect', kind: 'search' }, { name: 'lean Aggro', style: 'Aggro', kind: 'search' },
    ...DUMB, ...FIXED, ...READERS,
    ...sample(gridOf('mixer'), 6).map(m => S(describeStrategy(m).replace('each hero: ', 'mix '), m)),
    ...sample(gridOf('state'), 8).map(m => S(`state ${JSON.stringify([(m as { guardBelow: number }).guardBelow, (m as { strikeBelow: number }).strikeBelow, (m as { focusRounds: number }).focusRounds])}`, m)),
    ...sample(gridOf('script'), 6).map(m => S(describeStrategy(m), m)),
  ];
  console.log(`\n=== THE ELEMENTS SET: ${roster.length} strategies, randomly paired, the same drawn kit pair both sides ===`);
  for (const level of [3, 6, 10]) {
    const m = pairings(n, 40 + level, roster, kits, kit => ({ kit, level }));
    const p = await play(m, [], undefined, 40);
    report(games(m, p, roster), roster, `level ${level} (${fightLength(p)})`);
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
