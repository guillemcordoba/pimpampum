/**
 * SCRATCH, EXPERIMENT 5: Lin and Wu's NEURAL RATING TABLE and COUNTER TABLE
 * on kit pairs. Does rating a whole side (not a sum of its kits) predict
 * fights better, and do a few counter categories hold what a rating misses?
 * Everything is judged on games the model did not see.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-neural.ts [--games 6000] [--only controls|elements]
 *
 * bench-exempt(seeded): the kits experiment's matchups, by the same seeds (so the same cached fights).
 */
import { flag } from '@pimpampum/bench';
import { counterGain, fit, membersOf, type Game } from './fit.js';
import { counterCategories, heldOut, sideKey, trainRatingNet } from './neural.js';
import { play, type ControlKitSpec } from './play.js';
import { asGames, baneKit, check, controlHero, failures, ladderKit, matchups, N } from './common.js';

const only = flag('--only');
const asSides = (gs: readonly Game[]): Game[] => gs.map(g => ({ a: [sideKey(g.a)], b: [sideKey(g.b)], s: g.s }));

interface Compared { sum: number; pairTable: number; sideTable: number; net: number; cats: Record<number, number>; bestM: number }

/** Held-out loss of each model, as thousandths of a nat a game BELOW the sum of kit ratings (more is better). */
function compare(gs: readonly Game[], ms: readonly number[] = [2, 3, 4, 6]): Compared {
  const members = membersOf(gs);
  const gain = (loss: number, base: number) => (base - loss) * 1000;
  const sum = heldOut(gs, train => fit(train, {}, members).predict);
  const cg = counterGain(gs, undefined, 1);
  const pairTable = heldOut(gs, train => fit(train, { counterRidge: cg.ridge }, members).predict);
  // One rating per side seen: the rating table with nothing shared between sides.
  const sideTable = heldOut(gs, train => { const f = fit(asSides(train), { ridge: 0.05 }); const known = new Set(f.members); const back = fit(train, {}, members);
    return g => (known.has(sideKey(g.a)) && known.has(sideKey(g.b)) ? f.predict({ a: [sideKey(g.a)], b: [sideKey(g.b)] }) : back.predict(g)); });
  const net = heldOut(gs, train => trainRatingNet(train, members).predict);
  const cats: Record<number, number> = {};
  for (const m of ms) cats[m] = gain(heldOut(gs, train => counterCategories(train, trainRatingNet(train, members).predict, m).predict), sum);
  const bestM = ms.reduce((b, m) => (cats[m] > cats[b] ? m : b), ms[0]);
  return { sum, pairTable: gain(pairTable, sum), sideTable: gain(sideTable, sum), net: gain(net, sum), cats, bestM };
}

function show(c: Compared): void {
  console.log(`  held-out loss of the sum of kit ratings: ${c.sum.toFixed(4)} nats a game. Gain over it, in thousandths (noise is about ±1):`);
  console.log(`    sum + pair counter table      ${c.pairTable.toFixed(1).padStart(7)}`);
  console.log(`    one rating per side           ${c.sideTable.toFixed(1).padStart(7)}`);
  console.log(`    neural rating table           ${c.net.toFixed(1).padStart(7)}`);
  for (const [m, g] of Object.entries(c.cats)) console.log(`    … + ${m} counter categories     ${g.toFixed(1).padStart(7)}`);
}

/** The pairs worth most beyond the sum of their kits, read off the trained net. */
function synergies(gs: readonly Game[], top = 6): string[] {
  const members = membersOf(gs);
  const sum = fit(gs, {}, members), net = trainRatingNet(gs, members);
  const sides = [...new Set(gs.flatMap(g => [sideKey(g.a), sideKey(g.b)]))].map(k => k.split(' + '));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const netMean = mean(sides.map(s => net.rate(s))), sumMean = mean(sides.map(s => s.reduce((t, k) => t + sum.rating[k], 0)));
  const extra = sides.map(s => ({ s, x: (net.rate(s) - netMean) - (s.reduce((t, k) => t + sum.rating[k], 0) - sumMean) })).sort((p, q) => Math.abs(q.x) - Math.abs(p.x));
  return extra.slice(0, top).map(e => `${e.s.join(' + ')}: ${e.x >= 0 ? '+' : ''}${e.x.toFixed(0)}`);
}

function categoriesOf(gs: readonly Game[], m: number): string[] {
  const members = membersOf(gs);
  const cc = counterCategories(gs, trainRatingNet(gs, members).predict, m);
  const groups = Array.from({ length: m }, (_, c) => [...cc.category].filter(([, k]) => k === c).map(([s]) => s));
  const lines = groups.map((g, c) => `    category ${c + 1} (${g.length} sides): ${g.slice(0, 14).join('; ')}${g.length > 14 ? '; …' : ''}`);
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) if (Math.abs(cc.table[i][j]) > 25) lines.push(`    category ${cc.table[i][j] > 0 ? i + 1 : j + 1} beats category ${cc.table[i][j] > 0 ? j + 1 : i + 1} by ${Math.abs(cc.table[i][j]).toFixed(0)} Elo beyond the ratings`);
  return lines;
}

async function controls(): Promise<void> {
  const n = N(4000);
  console.log('=== CONTROLS (vanilla kits on the real engine, PV 15) ===');

  // A. The ladder: nothing but a sum is there to find.
  const kitsA = [...[4, 5, 6, 7, 8].map(r => ladderKit(`rung${r}`, r)), ladderKit('rung6-twin', 6), ladderKit('rung6-hard', 6)];
  const mA = matchups(n, 11, controlHero, kitsA.map(k => k.id), k => (k === 'rung6-hard' ? ['rung7', 'rung8'] : undefined));
  const gA = asGames(mA, await play(mA, kitsA));
  console.log('\nA. a ladder of kits');
  const cA = compare(gA);
  show(cA);
  check('on a ladder nothing beats the sum', Math.max(cA.pairTable, cA.sideTable, cA.net, ...Object.values(cA.cats)) < 3, `best gain ${Math.max(cA.pairTable, cA.sideTable, cA.net, ...Object.values(cA.cats)).toFixed(1)}`);

  // B. Two kits whose Strikes add 2d6 while the other stands beside them, among plain kits.
  const duo: ControlKitSpec[] = ['duoX', 'duoY'].map((id, i) => { const k = ladderKit(id, 5); k.cards[0] = { ...k.cards[0], fx: 'duo', fxDice: '2d6', prey: i ? 'duoX' : 'duoY' }; return k; });
  const kitsB = [...duo, ladderKit('rung5', 5), ladderKit('rung6', 6), ladderKit('rung7', 7)];
  const mB = matchups(n, 14, controlHero, kitsB.map(k => k.id));
  const gB = asGames(mB, await play(mB, kitsB));
  console.log('\nB. two kits that are strong only together');
  const cB = compare(gB, [2, 3]);
  show(cB);
  const netB = trainRatingNet(gB, membersOf(gB));
  const together = netB.rate(['duoX', 'duoY']), apart = (netB.rate(['duoX', 'duoX']) + netB.rate(['duoY', 'duoY'])) / 2, plain = netB.rate(['rung5', 'rung5']);
  console.log(`  the net rates duoX + duoY ${(together - plain).toFixed(0)} above two plain kits of their rung; duoX + duoX and duoY + duoY ${(apart - plain).toFixed(0)} above`);
  console.log(`  largest gaps from the sum: ${synergies(gB, 4).join('; ')}`);
  check('the rating of a whole side finds the pair', cB.net > 5 && cB.sideTable > 5 && together - apart > 100, `net gain ${cB.net.toFixed(1)}, side table ${cB.sideTable.toFixed(1)}, together − apart ${(together - apart).toFixed(0)} Elo`);

  // C. Rock under three names, paper, scissors: three categories must hold what fifteen sides do.
  const kitsC = [baneKit('rock', 6, 'scissors', '2d6'), baneKit('rock2', 6, 'scissors', '2d6'), baneKit('rock3', 6, 'scissors', '2d6'), baneKit('scissors', 6, 'paper', '2d6'), baneKit('paper', 6, 'rock,rock2,rock3', '2d6')];
  const mC = matchups(n, 13, controlHero, kitsC.map(k => k.id));
  const gC = asGames(mC, await play(mC, kitsC));
  console.log('\nC. rock under three names, paper, scissors');
  const cC = compare(gC, [2, 3, 4, 6]);
  show(cC);
  const cc = counterCategories(gC, trainRatingNet(gC, membersOf(gC)).predict, 3);
  const rocks = ['rock', 'rock2', 'rock3'];
  const rockSides = rocks.flatMap((x, i) => rocks.slice(i).map(y => sideKey([x, y])));
  const rockCats = new Set(rockSides.map(s => cc.category.get(s)));
  const three = new Set([cc.category.get(rockSides[0]), cc.category.get(sideKey(['paper', 'paper'])), cc.category.get(sideKey(['scissors', 'scissors']))]);
  console.log(categoriesOf(gC, 3).join('\n'));
  check('three categories recover most of the pair table', cC.cats[3] > 0.6 * cC.pairTable, `3 categories ${cC.cats[3].toFixed(1)}, pair table ${cC.pairTable.toFixed(1)}`);
  check('the rock clones share a category; rock, paper and scissors do not', rockCats.size === 1 && three.size === 3, `all-rock sides in ${rockCats.size} categor${rockCats.size === 1 ? 'y' : 'ies'}; pure rock, paper, scissors sides in ${three.size}`);
}

async function elements(): Promise<void> {
  const n = N(6000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  console.log('\n=== THE ELEMENTS SET (the kits experiment\'s fights) ===');
  for (const level of [3, 6, 10]) {
    const m = matchups(n, 20 + level, kit => ({ kit, level }), kits);
    const g = asGames(m, await play(m));
    console.log(`\nlevel ${level}: ${g.length} fights, 36 possible sides`);
    const c = compare(g);
    show(c);
    console.log(`  largest gaps from the sum of the two kits (Elo): ${synergies(g).join('; ')}`);
    if (c.cats[c.bestM] > 2) console.log(`  the ${c.bestM} categories:\n${categoriesOf(g, c.bestM).join('\n')}`);
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
