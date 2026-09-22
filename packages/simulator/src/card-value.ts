/**
 * WHAT IS EACH CARD WORTH? — per-decision counterfactual value (NEXT-STEPS §18).
 *
 * The standing question this answers after every content change: when this card
 * is on the table, is playing it better than playing something else?
 *
 *   value(C) = score(playing C) − score(playing the average alternative)
 *
 * scored in PV on my side minus PV on theirs — one currency by the rules, since
 * damage IS the margin applied to PV — from a position both branches share
 * exactly. The measurement lives in `bench/regret.ts`; this is its CLI, and the
 * kit analyzer's requirement 4/5 reads the same functions, so the report card
 * and this cannot print different numbers for one card.
 *
 *   npx tsx src/card-value.ts                       # every main kit
 *   npx tsx src/card-value.ts --player berserk
 *   npx tsx src/card-value.ts --enemy goblin --count 8
 *   npx tsx src/card-value.ts --games 40            # cheap
 *   npx tsx src/card-value.ts --depth 0             # fast, different ordering
 */
import { ALL_SKILLS } from '@pimpampum/skills';
import { getEnemy } from '@pimpampum/enemies';
import { MAIN_KITS, FANTASY } from '@pimpampum/set-fantasy';
import { cardsOf, cellsFor, setupFor, type Subject } from './kit-analyzer-lib.js';
import { DEFAULT_REGRET, exact, games, measureKit, pp, scoreCards, share, useSet } from '@pimpampum/bench';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

declare const process: { argv: string[]; env: Record<string, string | undefined> };

/**
 * Sized by the claim, per CLAUDE.md: resolve a card to ~1 PV at 2σ.
 *
 * At 24 fights the bars run ±3.5 to ±7.6 PV, so ~25× buys the order of
 * magnitude — affordable only because this is cheap where the ablation was not.
 * A rollout is two or three rounds, fights are three rounds at the median, and
 * every DECISION yields an observation instead of every fight.
 */
const GAMES = games(600);
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OPTS = { ...DEFAULT_REGRET, rolloutDepth: Number(flag('--depth') ?? DEFAULT_REGRET.rolloutDepth) };

function report(subject: Subject): void {
  const cards = cardsOf(subject);
  const cells = cellsFor(subject);
  const kit = measureKit(cells, cell => setupFor(subject, cardsOf(subject).length)(cell), GAMES, OPTS);
  const scored = scoreCards(kit);
  const byId = new Map(scored.map(s => [s.id, s]));

  console.log(`\n━━ ${subject.id} · ${kit.fights} combats · ${kit.positions} decisions valorades ━━`);
  console.log('  carta                     valor (PV)   valor (victòria)   millor opció (atzar)   cops legal');
  for (const c of cards) {
    const s = byId.get(c.id);
    if (!s) { console.log(`  ${c.name.padEnd(24)} mai legal`); continue; }
    // ✅ / ❌ mark the ABSOLUTE statistic, not the ranking: a card clearly under
    // the share chance alone would give it is one the game never wants played.
    // The `value` column is a ranking whose entries sum to ~zero, so marking it
    // would flag half of every hand by arithmetic.
    const dead = s.bestShare + 2 * s.bestStderr < s.nullShare;
    const alive = s.bestShare - 2 * s.bestStderr > s.nullShare;
    console.log(
      `  ${c.name.padEnd(24)} ${s.value.toFixed(2).padStart(6)}±${(s.stderr * 2).toFixed(2).padStart(5)}`
      + `   ${pp(s.winValue).padStart(8)}`
      + `   ${share(s.bestShare * s.observations, s.observations)} (${exact(s.nullShare)})`
      + `   ${String(s.observations).padStart(6)}${dead ? ' ❌' : alive ? ' ✅' : ''}`,
    );
  }

  // THE SURROGATE CHECK. PV differential is used because a win/loss bit throws
  // away every magnitude, but it is only legitimate while it agrees with
  // winning. Printed every run so it cannot quietly stop being true.
  const rank = (xs: number[]): number[] => {
    const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array(xs.length).fill(0);
    order.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  if (scored.length >= 3) {
    const a = rank(scored.map(s => s.value)), b = rank(scored.map(s => s.winValue));
    const n = a.length;
    const d2 = a.reduce((s2, x, i) => s2 + (x - b[i]) ** 2, 0);
    console.log(`  [PV vs victòria: Spearman ρ=${(1 - (6 * d2) / (n * (n * n - 1))).toFixed(2)} sobre ${n} cartes — si baixa, el substitut ha deixat de valer]`);
  }
  console.log(`  [valor = PV meu − PV seu, contra l'alternativa MITJANA — RANKING dins la mà, suma ~0; no diu "dolenta"]`);
  console.log(`  ["millor opció" = cops que va ser la millor jugada, contra el que en donaria l'atzar. Clarament per sota = mai val la pena]`);
}

const player = flag('--player');
const enemy = flag('--enemy');
const subjects: Subject[] = enemy
  ? (getEnemy(enemy) ? [{ mode: 'enemy', id: enemy, count: Number(flag('--count') ?? 4) }] : [])
  : player
    ? ALL_SKILLS.filter(s => s.id === player).map(s => ({ mode: 'player' as const, id: s.id }))
    : MAIN_KITS.map(s => ({ mode: 'player' as const, id: s.id }));

if (!subjects.length) { console.log(`cap subjecte '${player ?? enemy}'`); } else {
  console.log(`valor per decisió · ${GAMES} combats/kit · rollouts a profunditat ${OPTS.rolloutDepth}`);
  for (const s of subjects) report(s);
}
