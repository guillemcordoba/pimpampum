/**
 * SCRATCH, EXPERIMENT 3: ranking CARDS. A hero's strength is its kit's base
 * plus the sum of the cards in its hand; hands are thinned at random (each
 * card left out with fixed odds), so a card's rating is what a side gains by
 * holding it. Zero means the card adds nothing.
 *
 *   pnpm --filter @pimpampum/tools exec tsx scratch/rank/exp-cards.ts [--games 20000] [--only controls|elements]
 *
 * bench-exempt(seeded): matchups from `mulberry`; each fight on its own seed.
 */
import { flag } from '@pimpampum/bench';
import { ELEMENTS } from '@pimpampum/set-elements/bench';
import { fit, heldOutLoss, mulberry, type Fit, type Game } from './fit.js';
import { play, type ControlKitSpec, type HeroSpec, type Match, type SideSpec } from './play.js';
import { check, CONTROL_PV, failures, fightLength, N } from './common.js';

const only = flag('--only');
const kitMember = (kit: string) => `kit:${kit}`;

/** `n` 2v2 fights; each hero's kit is drawn and each of its cards left out with odds `drop` (never all of them). */
function thinned(n: number, seed: number, kits: readonly string[], cardsOf: (kit: string) => string[], hero: (kit: string) => HeroSpec, drop: number): Match[] {
  const rand = mulberry(seed);
  const one = (): HeroSpec => {
    const kit = kits[Math.floor(rand() * kits.length)], cards = cardsOf(kit);
    let out = cards.filter(() => rand() < drop);
    if (out.length === cards.length) out = out.slice(1);
    return { ...hero(kit), drop: out };
  };
  return Array.from({ length: n }, (_, i) => ({ a: { heroes: [one(), one()] }, b: { heroes: [one(), one()] }, seed: seed * 1000 + i }));
}

/** A side's members: each hero's kit and the cards it holds; `extra` adds members read off a hero's hand. */
function asGames(matches: readonly Match[], played: readonly { s: number }[], cardsOf: (kit: string) => string[], extra: (held: string[]) => string[] = () => []): Game[] {
  const side = (s: SideSpec): string[] => s.heroes!.flatMap(h => {
    const held = cardsOf(h.kit).filter(c => !h.drop?.includes(c));
    return [kitMember(h.kit), ...held, ...extra(held)];
  });
  return matches.map((m, i) => ({ a: side(m.a), b: side(m.b), s: played[i].s }));
}

const OPTS = { centre: false, ridge: 1e-2 } as const;
const line = (f: Fit, id: string, label = id) => `${label.padEnd(34)}${f.rating[id].toFixed(0).padStart(6)} ±${(2 * f.se[id]).toFixed(0).padStart(3)}${f.rating[id] < -2 * f.se[id] ? '  hurts' : Math.abs(f.rating[id]) <= 2 * f.se[id] ? '  no worth shown' : ''}`;

/** How alike two halves of the games rate the same cards: the correlation of the two sets of ratings. */
function splitHalf(games: readonly Game[], cards: readonly string[]): number {
  const a = fit(games.filter((_, i) => i % 2 === 0), OPTS), b = fit(games.filter((_, i) => i % 2 === 1), OPTS);
  const xs = cards.map(c => a.rating[c] ?? 0), ys = cards.map(c => b.rating[c] ?? 0);
  const mean = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0);
  return cov / Math.sqrt(xs.reduce((t, x) => t + (x - mx) ** 2, 0) * ys.reduce((t, y) => t + (y - my) ** 2, 0));
}

async function controls(): Promise<void> {
  const n = N(24000);
  console.log('=== CONTROLS (one vanilla kit, PV 15, each card left out of a hand 4 times in 10) ===');
  const deck: ControlKitSpec = { id: 'deck', cards: [
    { type: 'A', dice: '3d6' }, { type: 'A', dice: '2d6' }, { type: 'A', dice: '2d6' }, { type: 'A', dice: '1d4' },
    { type: 'D', dice: '3d4+2' }, { type: 'F', fx: 'noop' },
  ] };
  const name: Record<string, string> = { 'deck-1': 'big attack (3d6)', 'deck-2': 'twin attack (2d6)', 'deck-3': 'twin attack (2d6), the other', 'deck-4': 'small attack (1d4)', 'deck-5': 'guard (3d4+2)', 'deck-6': 'a Focus that does nothing' };
  const cards = Object.keys(name);
  const m = thinned(n, 51, ['deck'], () => cards, kit => ({ kit, level: 6, pv: CONTROL_PV }), 0.4);
  const p = await play(m, [deck]);
  const g = asGames(m, p, () => cards);
  const f = fit(g, OPTS);
  console.log(`\n${n} fights, ${fightLength(p)}`);
  for (const c of [...cards].sort((x, y) => f.rating[y] - f.rating[x])) console.log(`  ${line(f, c, name[c])}`);
  const clear = (x: string, y: string) => f.rating[x] - f.rating[y] > 2 * Math.hypot(f.se[x], f.se[y]);
  check('the bigger attack is worth more', clear('deck-1', 'deck-2') && clear('deck-1', 'deck-3') && clear('deck-2', 'deck-4') && clear('deck-3', 'deck-4'), `3d6 ${f.rating['deck-1'].toFixed(0)}, 2d6 ${f.rating['deck-2'].toFixed(0)} and ${f.rating['deck-3'].toFixed(0)}, 1d4 ${f.rating['deck-4'].toFixed(0)}`);
  check('twin cards tie', Math.abs(f.rating['deck-2'] - f.rating['deck-3']) < 3 * Math.hypot(f.se['deck-2'], f.se['deck-3']), `${f.rating['deck-2'].toFixed(0)} and ${f.rating['deck-3'].toFixed(0)}`);
  check('a card that does nothing is worth nothing', Math.abs(f.rating['deck-6']) < 3 * f.se['deck-6'], `${f.rating['deck-6'].toFixed(0)} ±${(2 * f.se['deck-6']).toFixed(0)}`);
  check('the ratings repeat on the other half of the games', splitHalf(g, cards) > 0.9, `correlation ${splitHalf(g, cards).toFixed(2)}`);
  // What a rating hides: a card's worth depends on the rest of the hand.
  const g2 = asGames(m, p, () => cards, held => [
    ...(held.includes('deck-2') && held.includes('deck-3') ? ['both twins held'] : []),
    ...(held.includes('deck-1') && held.includes('deck-4') ? ['small beside big'] : []),
  ]);
  const f2 = fit(g2, OPTS);
  console.log(`  with the hand read too: one twin alone ${f2.rating['deck-2'].toFixed(0)}, the second on top of it ${(f2.rating['deck-3'] + f2.rating['both twins held']).toFixed(0)}; the small attack alone ${f2.rating['deck-4'].toFixed(0)}, beside the big one ${(f2.rating['deck-4'] + f2.rating['small beside big']).toFixed(0)}`);
  check('a second copy adds less than the first', f2.rating['both twins held'] < -2 * f2.se['both twins held'], `the pair term is ${f2.rating['both twins held'].toFixed(0)} ±${(2 * f2.se['both twins held']).toFixed(0)}`);
}

async function elements(): Promise<void> {
  const n = N(20000);
  const kits = ['waterbender', 'earthbender', 'firebender', 'airbender', 'mestre-armes', 'acrobacia', 'artifex', 'mestre-del-xi'];
  console.log('\n=== THE ELEMENTS SET (2v2, kits drawn, each card left out of a hand 1 time in 4) ===');
  for (const level of [3, 6, 10]) {
    const cardsOf = (kit: string) => ELEMENTS.unlockedActions(kit, level).map(a => a.id);
    const nameOf = new Map(kits.flatMap(k => ELEMENTS.unlockedActions(k, level).map(a => [a.id, `L${a.unlockLevel} ${a.name} (${a.actionType[0]})`] as const)));
    const m = thinned(n, 60 + level, kits, cardsOf, kit => ({ kit, level }), 0.25);
    const p = await play(m);
    const g = asGames(m, p, cardsOf);
    const f = fit(g, OPTS);
    const all = kits.flatMap(cardsOf);
    console.log(`\nlevel ${level}: ${n} fights, ${fightLength(p)}; the ratings repeat on the other half with correlation ${splitHalf(g, all).toFixed(2)}`);
    const kitOnly = g.map(x => ({ ...x, a: x.a.filter(z => z.startsWith('kit:')), b: x.b.filter(z => z.startsWith('kit:')) }));
    console.log(`  held-out loss: ${heldOutLoss(g, OPTS).toFixed(4)} knowing the hands, ${heldOutLoss(kitOnly, OPTS).toFixed(4)} knowing only the kits`);
    for (const kit of kits) {
      console.log(`  ${kit}`);
      for (const c of [...cardsOf(kit)].sort((x, y) => f.rating[y] - f.rating[x])) console.log(`    ${line(f, c, nameOf.get(c))}`);
    }
  }
}

if (only !== 'elements') await controls();
if (only !== 'controls') await elements();
console.log(failures() ? `\n${failures()} CONTROL(S) FAILED` : '\nevery control held');
