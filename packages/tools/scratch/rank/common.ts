/**
 * SCRATCH (2026-11-28, the ranking experiments): what the experiments share:
 * the ladder control kits, drawing matchups, and printing a rating table.
 *
 * bench-exempt(seeded): matchups are drawn from `mulberry`, seeded per experiment.
 */
import { flag } from '@pimpampum/bench';
import { mulberry, rawScore, type Fit, type Game } from './fit.js';
import type { ControlKitSpec, HeroSpec, Match, Played, SideSpec } from './play.js';

export const N = (fallback: number): number => Math.max(8, Math.floor(Number(flag('--games') ?? process.env.GAMES ?? fallback)));

/** The dice ladder's rungs 3 to 9 (`sets/common/src/ladder.ts`), copied: tools does not depend on set-common. */
export const ATTACK_LADDER: Record<number, string> = { 1: '1d4', 2: '1d6', 3: '2d4', 4: '2d4+1', 5: '2d6', 6: '3d4', 7: '3d4+1', 8: '4d4', 9: '3d6', 10: '3d6+1' };
export const DEFENSE_LADDER: Record<number, string> = { 1: '1d6', 2: '2d4', 3: '2d6', 4: '3d4', 5: '2d6+2', 6: '3d4+2', 7: '2d8+2', 8: '5d4', 9: '4d6', 10: '4d6+1' };

/**
 * The replacement cards: at each rung an attack and a defense on the ladder's
 * dice, and a Focus after which the holder's attack rolls add the rung's mean
 * blow for two rounds. `vanillaCard('A', 4)` is the id to put in a hand.
 */
export const VANILLA: ControlKitSpec = {
  id: 'vanilla',
  cards: Array.from({ length: 10 }, (_, i) => i + 1).flatMap((r): ControlKitSpec['cards'] => [
    { type: 'A', dice: ATTACK_LADDER[r] }, { type: 'D', dice: DEFENSE_LADDER[r] }, { type: 'F', fx: 'boost', fxDice: ATTACK_LADDER[r] },
  ]),
};
export const vanillaCard = (type: 'A' | 'D' | 'F', rung: number): string => `vanilla-${(Math.max(1, Math.min(10, rung)) - 1) * 3 + 'ADF'.indexOf(type) + 1}`;

/** A vanilla kit on the ladder's rung `rung`: Strike, Guard, and an Aim worth the Strike again. */
export function ladderKit(id: string, rung: number): ControlKitSpec {
  const a = ATTACK_LADDER[rung], d = DEFENSE_LADDER[rung];
  return { id, cards: [{ type: 'A', dice: a }, { type: 'D', dice: d }, { type: 'F', fx: 'aim', fxDice: a }] };
}

/** The same kit whose Strike adds `bane` against heroes of `prey`. */
export function baneKit(id: string, rung: number, prey: string, bane: string): ControlKitSpec {
  const k = ladderKit(id, rung);
  k.cards[0] = { ...k.cards[0], fx: 'bane', fxDice: bane, prey };
  return k;
}

/** Control heroes hold their three cards, on one PV. */
export const CONTROL_PV = 15;
export const controlHero = (kit: string) => ({ kit, level: 3, pv: CONTROL_PV });

export const members = (side: SideSpec): string[] => side.heroes!.map(h => h.kit);

/** Games as the fit reads them: each side's members named by `name`. */
export function asGames(matches: readonly Match[], played: readonly Played[], name: (side: SideSpec) => string[] = members): Game[] {
  return matches.map((m, i) => ({ a: name(m.a), b: name(m.b), s: played[i].s }));
}

export function fightLength(played: readonly Played[]): string {
  const r = played.map(p => p.rounds).sort((x, y) => x - y);
  return `median ${r[Math.floor(r.length / 2)]} rounds, ${(100 * played.filter(p => p.capped).length / played.length).toFixed(1)}% stalled`;
}

const pad = (s: string, n: number) => s.padEnd(n);
const num = (x: number, w = 6) => x.toFixed(0).padStart(w);

/** Members by rating, each with its raw score, rating ±2 SE, and any extra columns. */
export function table(f: Fit, games: readonly Game[], extra: Record<string, Record<string, number>> = {}): string {
  const raw = rawScore(games);
  const width = Math.max(8, ...f.members.map(m => m.length)) + 2;
  const head = `${pad('', width)}${'raw'.padStart(7)}${'n'.padStart(7)}${'rating'.padStart(8)}${'±2SE'.padStart(6)}${Object.keys(extra).map(k => k.padStart(Math.max(8, k.length + 2))).join('')}`;
  const rows = [...f.members].sort((x, y) => f.rating[y] - f.rating[x]).map(m =>
    `${pad(m, width)}${(100 * (raw[m]?.score ?? 0)).toFixed(1).padStart(6)}%${String(raw[m]?.n ?? 0).padStart(7)}${num(f.rating[m], 8)}${num(2 * f.se[m], 6)}${Object.entries(extra).map(([k, r]) => (m in r ? num(r[m], Math.max(8, k.length + 2)) : ''.padStart(Math.max(8, k.length + 2)))).join('')}`);
  return [head, ...rows].join('\n');
}

/** The counter terms past `sigmas` standard errors, strongest first. */
export function counters(f: Fit, sigmas = 3): string[] {
  const out: { x: string; y: string; c: number; se: number }[] = [];
  for (const x of f.members) for (const y of f.members) {
    const c = f.counter?.[x]?.[y] ?? 0, se = f.counterSe?.[x]?.[y] ?? Infinity;
    if (c > sigmas * se) out.push({ x, y, c, se });
  }
  return out.sort((p, q) => q.c / q.se - p.c / p.se).map(o => `${o.x} > ${o.y}: +${o.c.toFixed(0)} ±${(2 * o.se).toFixed(0)}`);
}

let failed = 0;
export function check(name: string, ok: boolean, detail: string): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
}
export const failures = (): number => failed;

/** `n` 2v2 fights, every seat's kit drawn from `pool`. A kit with a forced schedule (`forced`) only meets sides drawn from its list. */
export function matchups(n: number, seed: number, hero: (kit: string) => HeroSpec, pool: readonly string[], forced?: (kit: string) => readonly string[] | undefined): Match[] {
  const rand = mulberry(seed);
  const pick = (xs: readonly string[]) => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    let a = [pick(pool), pick(pool)], b = [pick(pool), pick(pool)];
    const fa = a.map(k => forced?.(k)).find(Boolean), fb = b.map(k => forced?.(k)).find(Boolean);
    if (fa) b = [pick(fa), pick(fa)]; else if (fb) a = [pick(fb), pick(fb)];
    return { a: { heroes: a.map(hero) }, b: { heroes: b.map(hero) }, seed: seed * 1000 + i };
  });
}
