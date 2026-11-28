/**
 * SCRATCH, EXPERIMENT 6: three more ways to rank the CARDS of a kit, the ones
 * the doc's section 12 names.
 *
 *  jumps    UNLOCK JUMPS: every `kit@level` rated in one pool (heroes at
 *           neighbouring levels fight); a card's value is the jump in its
 *           kit's rating at the level that unlocks it. A level also brings PV,
 *           so the newest card is left out of half the hands (PV kept) and the
 *           jump is split into the card and the rest.
 *  vor      VALUE OVER REPLACEMENT: a card swapped for the vanilla card of its
 *           type at its ladder rung; what the side loses.
 *  shapley  SHAPLEY VALUES with pair terms: hands thinned by half, a rating
 *           for each card and each pair of cards in a hand; a card's Shapley
 *           value is its own rating plus half of each pair's.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-cards2.ts --which jumps|vor|shapley [--games N] [--only controls|elements]
 *
 * bench-exempt(seeded): matchups from `mulberry`; each fight on its own seed.
 */
import { flag } from '@pimpampum/bench';
import { ELEMENTS } from '@pimpampum/set-elements/bench';
import { fit, mulberry, type Fit, type Game } from './fit.js';
import { play, type ControlKitSpec, type HeroSpec, type Match, type SideSpec } from './play.js';
import { ATTACK_LADDER, check, CONTROL_PV, DEFENSE_LADDER, failures, fightLength, N, VANILLA, vanillaCard } from './common.js';

const only = flag('--only'), which = flag('--which') ?? 'jumps';
const KITS = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
const OPTS = { centre: false, ridge: 1e-2 } as const;
const pm = (f: Fit, id: string) => `${f.rating[id].toFixed(0).padStart(5)} ±${(2 * f.se[id]).toFixed(0).padStart(3)}`;
const flagOf = (v: number, se: number) => (v < -2 * se ? '  below zero' : Math.abs(v) <= 2 * se ? '  not shown' : '');

interface Card { id: string; name: string; type: 'A' | 'D' | 'F'; unlock: number }
/** What a world of kits offers: each kit's cards in unlock order, and how to field a hero. */
interface World { kits: string[]; cards(kit: string): Card[]; hero(kit: string, level: number): HeroSpec; controls: ControlKitSpec[] }

const elementsWorld: World = {
  kits: KITS,
  cards: kit => ELEMENTS.unlockedActions(kit, 10).map(a => ({ id: a.id, name: a.name, type: (a.actionType === 'attack' || String(a.actionType).startsWith('A') ? 'A' : String(a.actionType).startsWith('D') ? 'D' : 'F') as Card['type'], unlock: a.unlockLevel })),
  hero: (kit, level) => ({ kit, level }),
  controls: [],
};

const controlWorld = (spec: ControlKitSpec, names: string[], pv: (level: number) => number): World => ({
  kits: [spec.id],
  cards: () => spec.cards.map((c, i) => ({ id: `${spec.id}-${i + 1}`, name: names[i], type: c.type, unlock: i + 1 })),
  hero: (kit, level) => ({ kit, level, pv: pv(level) }),
  controls: [spec],
});

// --- 1. unlock jumps ----------------------------------------------------------------

async function jumps(w: World, n: number, seed: number, maxLevel: number): Promise<{ f: Fit; card: Record<string, { value: number; se: number }>; rest: Record<string, { value: number; se: number }>; rounds: string }> {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const drawn = Array.from({ length: n }, () => {
    // Four heroes at one level or the next: neighbours meet, so the chain of levels holds together.
    const low = 1 + Math.floor(rand() * maxLevel);
    const one = () => {
      const kit = pick(w.kits), level = Math.min(maxLevel, low + (rand() < 0.5 ? 1 : 0));
      const newest = w.cards(kit).filter(c => c.unlock <= level).at(-1)!;
      const held = rand() < 0.5;
      return { spec: { ...w.hero(kit, level), ...(held ? {} : { drop: [newest.id] }) } as HeroSpec, members: [`base:${kit}@${level}`, ...(held ? [`card:${newest.id}`] : [])] };
    };
    const a = [one(), one()], b = [one(), one()];
    return { a, b };
  });
  const matches: Match[] = drawn.map((d, i) => ({ a: { heroes: d.a.map(h => h.spec) }, b: { heroes: d.b.map(h => h.spec) }, seed: seed * 1_000_000 + i }));
  const p = await play(matches, w.controls);
  const games: Game[] = drawn.map((d, i) => ({ a: d.a.flatMap(h => h.members), b: d.b.flatMap(h => h.members), s: p[i].s }));
  // Every side holds two bases, so the bases share a free constant: held to a zero sum, their differences keep their own error bars.
  const f = fit(games, { ...OPTS, anchor: [...new Set(games.flatMap(g => [...g.a, ...g.b]))].filter(m => m.startsWith('base:')) });
  const card: Record<string, { value: number; se: number }> = {}, rest: Record<string, { value: number; se: number }> = {};
  for (const kit of w.kits) for (const c of w.cards(kit).filter(x => x.unlock <= maxLevel)) {
    const L = c.unlock, cid = `card:${c.id}`, base = `base:${kit}@${L}`;
    if (!(cid in f.rating)) continue;
    card[c.id] = { value: f.rating[cid], se: f.se[cid] };
    // What the level brings beside the card: this level's hero without its newest card, against the level below with all of its own.
    const prev = w.cards(kit).filter(x => x.unlock < L).at(-1);
    if (prev && `base:${kit}@${L - 1}` in f.rating) {
      const below = f.rating[`base:${kit}@${L - 1}`] + f.rating[`card:${prev.id}`];
      rest[c.id] = { value: f.rating[base] - below, se: Math.hypot(f.se[base], f.se[`base:${kit}@${L - 1}`], f.se[`card:${prev.id}`]) };
    }
  }
  return { f, card, rest, rounds: fightLength(p) };
}

function showJumps(w: World, r: Awaited<ReturnType<typeof jumps>>, maxLevel: number): void {
  for (const kit of w.kits) {
    console.log(`  ${kit}`);
    for (const c of w.cards(kit).filter(x => x.unlock <= maxLevel)) {
      const v = r.card[c.id], o = r.rest[c.id];
      if (!v) continue;
      console.log(`    L${String(c.unlock).padEnd(2)} ${`${c.name} (${c.type})`.padEnd(30)} the card ${v.value.toFixed(0).padStart(5)} ±${(2 * v.se).toFixed(0).padStart(3)}${o ? `   the rest of the level ${o.value.toFixed(0).padStart(5)} ±${(2 * o.se).toFixed(0).padStart(3)}   the jump ${(v.value + o.value).toFixed(0).padStart(5)}` : ''}${flagOf(v.value, v.se)}`);
    }
  }
}

async function jumpsControls(): Promise<void> {
  const n = N(24000);
  const spec: ControlKitSpec = { id: 'steps', cards: [
    { type: 'A', dice: '2d4' }, { type: 'D', dice: '2d6' }, { type: 'F', fx: 'noop' }, { type: 'A', dice: '3d6' }, { type: 'A', dice: '1d6' }, { type: 'D', dice: '3d4+2' },
  ] };
  const names = ['attack 2d4', 'guard 2d6', 'a Focus that does nothing', 'big attack 3d6', 'a weaker attack than those held (1d6)', 'better guard 3d4+2'];
  // PV grows by 2.5 a level, as a real hero's does.
  const w = controlWorld(spec, names, level => Math.round(5 + 2.5 * level));
  const r = await jumps(w, n, 91, 6);
  console.log(`=== CONTROL: unlock jumps on one vanilla kit whose PV grows 2.5 a level (${n} fights, ${r.rounds}) ===`);
  showJumps(w, r, 6);
  const c = (i: number) => r.card[`steps-${i}`];
  check('a card that does nothing unlocks nothing', Math.abs(c(3).value) < 3 * c(3).se, `${c(3).value.toFixed(0)} ±${(2 * c(3).se).toFixed(0)}`);
  check('a weaker copy of what is held unlocks nothing', Math.abs(c(5).value) < 3 * c(5).se, `${c(5).value.toFixed(0)} ±${(2 * c(5).se).toFixed(0)}`);
  check('the big attack is the big card', c(4).value > 3 * c(4).se && c(4).value > c(6).value && c(4).value > c(2).value, `${c(4).value.toFixed(0)} against ${c(2).value.toFixed(0)} and ${c(6).value.toFixed(0)}`);
  const rests = [2, 3, 4, 5, 6].map(i => r.rest[`steps-${i}`]);
  check('the rest of every level (its PV) is worth something', rests.every(x => x.value > 2 * x.se), rests.map(x => x.value.toFixed(0)).join(', '));
  check('a level that unlocks a dead card still jumps, by its PV alone', r.rest['steps-3'].value + c(3).value > 2 * r.rest['steps-3'].se, `jump ${(r.rest['steps-3'].value + c(3).value).toFixed(0)}`);
}

// --- 2. value over replacement --------------------------------------------------------

async function vor(w: World, n: number, seed: number, level: number): Promise<{ f: Fit; rounds: string }> {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const drawn = Array.from({ length: n }, () => {
    const one = () => {
      const kit = pick(w.kits), cards = w.cards(kit).filter(c => c.unlock <= level);
      // Three hands in four swap one card for the vanilla card of its type at its rung.
      const out = rand() < 0.75 ? pick(cards) : null;
      return { spec: { ...w.hero(kit, level), ...(out ? { drop: [out.id], add: [vanillaCard(out.type, out.unlock)] } : {}) } as HeroSpec, members: [`kit:${kit}`, ...(out ? [`swap:${out.id}`] : [])] };
    };
    return { a: [one(), one()], b: [one(), one()] };
  });
  const matches: Match[] = drawn.map((d, i) => ({ a: { heroes: d.a.map(h => h.spec) }, b: { heroes: d.b.map(h => h.spec) }, seed: seed * 1_000_000 + i }));
  const p = await play(matches, [...w.controls, VANILLA]);
  return { f: fit(drawn.map((d, i) => ({ a: d.a.flatMap(h => h.members), b: d.b.flatMap(h => h.members), s: p[i].s })), OPTS), rounds: fightLength(p) };
}

function showVor(w: World, f: Fit, level: number): void {
  for (const kit of w.kits) {
    console.log(`  ${kit}`);
    const cards = w.cards(kit).filter(c => c.unlock <= level && `swap:${c.id}` in f.rating);
    for (const c of cards.sort((x, y) => f.rating[`swap:${x.id}`] - f.rating[`swap:${y.id}`])) {
      const v = -f.rating[`swap:${c.id}`], se = f.se[`swap:${c.id}`];
      console.log(`    L${String(c.unlock).padEnd(2)} ${`${c.name} (${c.type})`.padEnd(30)} ${v.toFixed(0).padStart(5)} ±${(2 * se).toFixed(0).padStart(3)}${v < -2 * se ? '  worse than vanilla' : Math.abs(v) <= 2 * se ? '  no better than vanilla' : ''}`);
    }
  }
}

async function vorControls(): Promise<void> {
  const n = N(24000);
  const spec: ControlKitSpec = { id: 'swaps', cards: [
    { type: 'A', dice: ATTACK_LADDER[1] }, { type: 'D', dice: DEFENSE_LADDER[2] }, { type: 'A', dice: '2d4+4' }, { type: 'D', dice: '1d4' }, { type: 'A', dice: ATTACK_LADDER[5] }, { type: 'F', fx: 'noop' },
  ] };
  const names = ['attack on its rung', 'guard on its rung', 'attack 4 over its rung', 'guard far under its rung (1d4)', 'the best attack, on its rung', 'a Focus that does nothing'];
  const w = controlWorld(spec, names, () => CONTROL_PV);
  const { f, rounds } = await vor(w, n, 92, 6);
  console.log(`\n=== CONTROL: value over replacement on one vanilla kit (${n} fights, ${rounds}) ===`);
  showVor(w, f, 6);
  const v = (i: number) => -f.rating[`swap:swaps-${i}`], se = (i: number) => f.se[`swap:swaps-${i}`];
  check('a card on its rung is worth what its replacement is', [1, 2, 5].every(i => Math.abs(v(i)) < 3 * se(i)), [1, 2, 5].map(i => `${v(i).toFixed(0)} ±${(2 * se(i)).toFixed(0)}`).join(', '));
  check('a card over its rung is worth more', v(3) > 3 * se(3), `${v(3).toFixed(0)} ±${(2 * se(3)).toFixed(0)}`);
  check('a card under its rung, or one that does nothing, is not worth more', v(4) < 2 * se(4) && v(6) < 2 * se(6), `weak guard ${v(4).toFixed(0)} ±${(2 * se(4)).toFixed(0)}, dead Focus ${v(6).toFixed(0)} ±${(2 * se(6)).toFixed(0)}`);
}

// --- 3. Shapley values, with pair terms ---------------------------------------------------

async function shapley(w: World, n: number, seed: number, level: number): Promise<{ f: Fit; value: Record<string, number>; rounds: string }> {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const pair = (x: string, y: string) => (x < y ? `${x} & ${y}` : `${y} & ${x}`);
  const drawn = Array.from({ length: n }, () => {
    const one = () => {
      const kit = pick(w.kits), cards = w.cards(kit).filter(c => c.unlock <= level).map(c => c.id);
      const held = cards.filter(() => rand() < 0.5);
      const pairs = held.flatMap((x, i) => held.slice(i + 1).map(y => pair(x, y)));
      return { spec: { ...w.hero(kit, level), drop: cards.filter(c => !held.includes(c)) } as HeroSpec, members: [`kit:${kit}`, ...held, ...pairs] };
    };
    return { a: [one(), one()], b: [one(), one()] };
  });
  const matches: Match[] = drawn.map((d, i) => ({ a: { heroes: d.a.map(h => h.spec) }, b: { heroes: d.b.map(h => h.spec) }, seed: seed * 1_000_000 + i }));
  const p = await play(matches, w.controls);
  // The pair terms are shrunk a little: fifteen of them a kit, each seen in a quarter of its hands.
  const f = fit(drawn.map((d, i) => ({ a: d.a.flatMap(h => h.members), b: d.b.flatMap(h => h.members), s: p[i].s })), { centre: false, ridge: 0.05 });
  const value: Record<string, number> = {};
  for (const kit of w.kits) {
    const cards = w.cards(kit).filter(c => c.unlock <= level).map(c => c.id);
    for (const c of cards) value[c] = f.rating[c] + cards.filter(o => o !== c).reduce((t, o) => t + (f.rating[pair(c, o)] ?? 0) / 2, 0);
  }
  return { f, value, rounds: fightLength(p) };
}

function showShapley(w: World, r: Awaited<ReturnType<typeof shapley>>, level: number): void {
  for (const kit of w.kits) {
    console.log(`  ${kit}`);
    const cards = w.cards(kit).filter(c => c.unlock <= level);
    const nameOf = new Map(cards.map(c => [c.id, c.name]));
    for (const c of [...cards].sort((x, y) => r.value[y.id] - r.value[x.id])) console.log(`    L${String(c.unlock).padEnd(2)} ${`${c.name} (${c.type})`.padEnd(30)} Shapley ${r.value[c.id].toFixed(0).padStart(5)}   alone in a hand ${pm(r.f, c.id)}`);
    const pairs = Object.keys(r.f.rating).filter(m => m.includes(' & ') && cards.some(c => m.startsWith(`${c.id} & `)) && Math.abs(r.f.rating[m]) > 3 * r.f.se[m]).sort((x, y) => Math.abs(r.f.rating[y]) - Math.abs(r.f.rating[x]));
    for (const m of pairs.slice(0, 5)) { const [x, y] = m.split(' & '); console.log(`      ${r.f.rating[m] > 0 ? 'better together' : 'step on each other'}: ${nameOf.get(x)} + ${nameOf.get(y)} ${r.f.rating[m].toFixed(0)} ±${(2 * r.f.se[m]).toFixed(0)}`); }
  }
}

async function shapleyControls(): Promise<void> {
  const n = N(30000);
  const spec: ControlKitSpec = { id: 'combo', cards: [
    { type: 'A', dice: '3d6' }, { type: 'A', dice: '2d6' }, { type: 'A', dice: '2d6' }, { type: 'D', dice: '3d4+2' }, { type: 'F', fx: 'aim', fxDice: '3d6' }, { type: 'F', fx: 'noop' },
  ] };
  const names = ['big attack 3d6', 'twin attack 2d6', 'twin attack 2d6, the other', 'guard', 'Aim: the next attack of this kit adds 3d6', 'a Focus that does nothing'];
  const w = controlWorld(spec, names, () => CONTROL_PV);
  const r = await shapley(w, n, 93, 6);
  console.log(`\n=== CONTROL: Shapley values on one vanilla kit, half of each hand left out (${n} fights, ${r.rounds}) ===`);
  showShapley(w, r, 6);
  const id = (i: number) => `combo-${i}`, pairOf = (i: number, j: number) => `${id(i)} & ${id(j)}`;
  const f = r.f;
  check('twins have the same Shapley value', Math.abs(r.value[id(2)] - r.value[id(3)]) < 25, `${r.value[id(2)].toFixed(0)} and ${r.value[id(3)].toFixed(0)}`);
  check('the twins step on each other', f.rating[pairOf(2, 3)] < -2 * f.se[pairOf(2, 3)], `pair term ${pm(f, pairOf(2, 3))}`);
  check('Aim alone is worth nothing; with an attack of its kit it is', Math.abs(f.rating[id(5)]) < 3 * f.se[id(5)] && [1, 2, 3].some(i => f.rating[pairOf(i, 5)] > 2 * f.se[pairOf(i, 5)]), `alone ${pm(f, id(5))}; with the big attack ${pm(f, pairOf(1, 5))}`);
  check('the dead card has no Shapley value', Math.abs(r.value[id(6)]) < 25, r.value[id(6)].toFixed(0));
}

// --- the elements set ---------------------------------------------------------------------

async function elements(): Promise<void> {
  const w = elementsWorld;
  if (which === 'jumps') {
    const n = N(40000);
    const r = await jumps(w, n, 94, 10);
    console.log(`\n=== THE ELEMENTS SET: unlock jumps, every kit at every level in one pool (${n} fights, ${r.rounds}) ===`);
    console.log('  "the card": what a hero of that level gains by holding its newest card. "the rest of the level": that hero without the card against the level below with all its cards (the PV the level brings).');
    showJumps(w, r, 10);
  }
  if (which === 'vor') for (const level of [6, 10]) {
    const n = N(level === 6 ? 24000 : 40000);
    const { f, rounds } = await vor(w, n, 95 + level, level);
    console.log(`\n=== THE ELEMENTS SET: value over replacement at level ${level} (${n} fights, ${rounds}) ===`);
    showVor(w, f, level);
  }
  if (which === 'shapley') {
    const n = N(40000);
    const r = await shapley(w, n, 96, 6);
    console.log(`\n=== THE ELEMENTS SET: Shapley values at level 6, half of each hand left out (${n} fights, ${r.rounds}) ===`);
    showShapley(w, r, 6);
  }
}

if (only !== 'elements') await ({ jumps: jumpsControls, vor: vorControls, shapley: shapleyControls }[which] ?? jumpsControls)();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
