/**
 * THE KIT GATE — every requirement of the livable zone, for every main kit at
 * every level, as one grid (the user, 2026-11-03: the zone that meets them all
 * is small, and the kits have to converge on it).
 *
 * Measured where the requirements bite, heroes against heroes (bench
 * `mirror.ts`):
 *  - FIGHTS END: per kit and level, 2v2 fights against random kits — the
 *    median, the 90th percentile (the user's hard limit, `MAX_P90_ROUNDS`) and
 *    the fights that never end;
 *  - NO KIT DOMINATES: in the same fights, no kit's side clearly above
 *    `FIELD_MAX` against the field;
 *  - THE TRIANGLE and DUMB PLAY LOSES: at the checkpoints (3, 6, 10), the
 *    three leaning styles each against the next, and every dumb strategy
 *    (bench `DUMB_STYLES`: only defending, the biggest attack, any card)
 *    against the reading AI, which must beat each one clearly;
 *  - EVERY CARD HAS A USE, and CHOOSING MATTERS: per kit, each card's value in
 *    mirrors — a card that is never the right play at any level it is held, or
 *    one the AI is blind to — and what a random card costs against the best,
 *    per decision, at each checkpoint.
 *
 * The strength band joins when creatures are on the ladder (OPEN.md B20): it is
 * measured against creatures, and their cells saturate until then.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUMB_STYLES, duelAutopsy, kitChoiceCost, kitMirrorCardValues, kitMirrors, modelCheck, scoreCards, styleDuel, theSet, warm, type DuelAutopsy, type DuelStyle, type DumbStyle, type KitMirrorRun, type MirrorAutopsy, type ModelCheck } from '@pimpampum/bench';
import type { RunContext } from './prepare.js';
import {
  choiceMattersVerdict, dominatesField, durationVerdict, edgeHolds, isBlindSpot, MIN_CHOICE_COST, isNeverRight, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, modelVerdict, triangleVerdict,
} from './rules.js';

export const GATE_LEVELS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10];
/** Checkpoints (the user, 2026-11-03): the start, where players live, the top. */
export const STYLE_LEVELS: readonly number[] = [3, 6, 10];
/** The same checkpoints for the cards: every card is held at one of them. */
export const CARD_LEVELS: readonly number[] = STYLE_LEVELS;

export interface GateBudget { kitFights: number; duelGames: number; cardFights: number; modelFights?: number }
export const GATE_BUDGET: GateBudget = { kitFights: 120, duelGames: 200, cardFights: 30, modelFights: 40 };
/** For iterating (with the checkpoints only, and no card values): about a
 *  quarter of the fights, minutes instead of an hour. Its numbers are rough;
 *  the full gate confirms. */
export const GATE_QUICK: GateBudget = { kitFights: 30, duelGames: 60, cardFights: 10, modelFights: 15 };

const EDGES: readonly [DuelStyle, DuelStyle][] = [['Power', 'Protect'], ['Protect', 'Aggro'], ['Aggro', 'Power']];

export interface GateKitCell {
  kit: string; level: number; fights: number;
  medianRounds: number; p90Rounds: number; stallRate: number;
  /** The kit's side's score in its fights (draws and stalls ½). */
  winrate: number;
  /** Fights end (`ok`, `reasons`); the kit clearly above `FIELD_MAX`. */
  ok: boolean; reasons: string[]; dominates: boolean;
  why: LengthAutopsy;
  /** A failing cell at a checkpoint: the same fights with each of the kit's
   *  cards out of its hand — which card blocks the requirement. */
  blame: KitCardBlame[];
}

/** The kit's fights without one card. `flips`: without it the cell passes
 *  everything it failed. */
export interface KitCardBlame {
  card: string; name: string; medianRounds: number; p90Rounds: number; stallRate: number; winrate: number;
  lengthOk: boolean; dominates: boolean; flips: boolean;
}

/** WHY fights run long: who was in them, what was played late, and how the
 *  long fights differ from the short ones. */
export interface LengthAutopsy {
  /** Share of the fights past `MAX_P90_ROUNDS` (stalls included). */
  longShare: number;
  /** The opponent and partner kits with the highest share of long fights. */
  foes: { kit: string; longShare: number; fights: number }[];
  partners: { kit: string; longShare: number; fights: number }[];
  /** The cards most resolved after round `MAX_P90_ROUNDS` in the long fights. */
  late: { card: string; name: string; share: number }[];
  long: FightShape; short: FightShape;
}

/** A set of fights in four numbers. */
export interface FightShape {
  fights: number;
  pvPerRound: number;
  /** Attacks that took no PV from anyone, of the attacks resolved. */
  emptyAttacks: number;
  /** Focus cards that never resolved, of the Focus cards played. */
  focusLost: number;
  /** Defenses, of the cards resolved. */
  defenseShare: number;
}

export interface GateStyleCell {
  level: number;
  edges: { winner: string; loser: string; winrate: number; games: number }[];
  broken: string[];
  /** Per broken edge, the loser's cards whose removal lifts the claimed
   *  winner's score most: what holds the edge up (`shift` in points). */
  culprits: { edge: string; cards: { card: string; name: string; shift: number }[] }[];
  /** Per broken edge, both sides' play in its duels (`duelAutopsy`): what
   *  the guards met, where the blows landed, what came of the Focus cards. */
  autopsies: DuelAutopsy[];
  /** Each dumb strategy's score against the reading AI; `ok`: it clearly loses. */
  dumb: { style: DumbStyle; score: number; stalls: number; games: number; ok: boolean }[];
  /** The AI's model of its opponents against what they played (`modelCheck`). */
  model: ModelCheck & { ok: boolean; off: string[] };
}

export interface GateCardCell {
  kit: string; card: string; name: string; unlock: number;
  /** Per priced level the card is held at. */
  levels: { level: number; bestShare: number; playRate: number; gainWhenBest: number | null; decisions: number; neverRight: boolean; blind: boolean }[];
  neverRight: boolean; blind: boolean;
}

/** What a random legal card costs against the best one, per decision, in PV (`kitChoiceCost`). */
export interface GateChoiceCell { kit: string; level: number; mean: number; stderr: number; decisions: number; ok: boolean }

export interface GateReport {
  kits: GateKitCell[]; styles: GateStyleCell[]; cards: GateCardCell[]; choices: GateChoiceCell[];
  /** One per failing cell, the grid's ❌s: a stable `key` (what a test's
   *  ratchet names) and the line that explains it. */
  failures: GateFailure[];
}

/** Keys: `<kit> L<n> length`, `<kit> L<n> dominates`, `<kit> L<n> choice`, `L<n> triangle <winner> > <loser>`, `L<n> dumb <style>`,
 *  `L<n> model`, `<kit> <card id> never-right`, `<kit> <card id> blind`. */
export interface GateFailure { key: string; text: string }

/** One unit of the gate, as a worker computes it (`gate-worker.ts`). */
export type GateJob =
  | { kind: 'gate-fights'; kit: string; level: number }
  | { kind: 'gate-duel'; x: DuelStyle; y: DuelStyle; level: number }
  | { kind: 'gate-cards'; kit: string; level: number }
  | { kind: 'gate-blame'; x: DuelStyle; y: DuelStyle; level: number; card: string }
  | { kind: 'gate-autopsy'; x: DuelStyle; y: DuelStyle; level: number }
  | { kind: 'gate-ablate'; kit: string; level: number; card: string }
  | { kind: 'gate-model'; level: number };

export interface GateScope {
  kits?: readonly string[]; levels?: readonly number[];
  /** false: leave the card values out — they replay the rest of the fight for
   *  every legal card at every decision, most of a gate's cost. */
  cards?: boolean;
  /** false: leave the strategy triangle out (its duels, culprits, autopsies). */
  triangle?: boolean;
  /** The set-level duels (dumb play, the triangle, the AI's model); on unless
   *  the scope names kits. */
  styles?: boolean;
  /** true: each failing kit cell at a checkpoint re-measured without each of
   *  the kit's cards (`KitCardBlame`). Off by default: it multiplies the fights. */
  blame?: boolean;
}

const stylesOn = (scope: GateScope) => scope.styles ?? !scope.kits;

function scopeKits(scope: GateScope): string[] { return [...(scope.kits ?? theSet().calibration.mainKits)]; }
const inScope = (levels: readonly number[], scope: GateScope): number[] => levels.filter(l => !scope.levels || scope.levels.includes(l));

/** Every unit `measureGate(scope)` reads, most expensive first (the card values). */
export function gateJobs(scope: GateScope = {}): GateJob[] {
  const kits = scopeKits(scope);
  return [
    ...(scope.cards === false ? [] : kits.flatMap(kit => inScope(CARD_LEVELS, scope).map(level => ({ kind: 'gate-cards' as const, kit, level })))),
    ...(!stylesOn(scope) ? [] : inScope(STYLE_LEVELS, scope).flatMap(level => [
      ...(scope.triangle === false ? [] : EDGES.map(([x, y]) => ({ kind: 'gate-duel' as const, x, y, level }))),
      ...DUMB_STYLES.map(x => ({ kind: 'gate-duel' as const, x, y: 'ai' as const, level })),
      { kind: 'gate-model' as const, level },
    ])),
    ...kits.flatMap(kit => inScope(GATE_LEVELS, scope).map(level => ({ kind: 'gate-fights' as const, kit, level }))),
  ];
}

export function runGateJob(job: GateJob, budget: GateBudget = GATE_BUDGET): void {
  if (job.kind === 'gate-fights') kitMirrors(job.kit, job.level, budget.kitFights, MAX_P90_ROUNDS);
  else if (job.kind === 'gate-duel') styleDuel(job.x, job.y, job.level, budget.duelGames);
  else if (job.kind === 'gate-blame') styleDuel(job.x, job.y, job.level, budget.duelGames, job.card);
  else if (job.kind === 'gate-autopsy') duelAutopsy(job.x, job.y, job.level, budget.duelGames);
  else if (job.kind === 'gate-ablate') kitMirrors(job.kit, job.level, budget.kitFights, MAX_P90_ROUNDS, job.card);
  else if (job.kind === 'gate-model') modelCheck(job.level, budget.modelFights ?? GATE_BUDGET.modelFights!);
  else kitMirrorCardValues(job.kit, job.level, budget.cardFights);
}

/** How many of the loser's most played cards a broken edge tries removing. */
const CULPRIT_CANDIDATES = 6;

/** The edge's suspects: the cards the claimed loser played most. */
function suspects(x: DuelStyle, y: DuelStyle, level: number, budget: GateBudget): string[] {
  const plays = styleDuel(x, y, level, budget.duelGames).yPlays;
  return Object.entries(plays).sort((a, b) => b[1] - a[1]).slice(0, CULPRIT_CANDIDATES).map(([id]) => id);
}

/** The second wave: a removal duel per suspect of every broken edge. Reads the
 *  first wave's duels, so it runs after them. */
export function blameJobs(scope: GateScope = {}, budget: GateBudget = GATE_BUDGET): GateJob[] {
  const triangle = !stylesOn(scope) || scope.triangle === false ? [] : inScope(STYLE_LEVELS, scope).flatMap(level => EDGES.flatMap(([x, y]) => {
    const d = styleDuel(x, y, level, budget.duelGames);
    if (edgeHolds(d.score, d.games)) return [];
    return [
      { kind: 'gate-autopsy' as const, x, y, level },
      ...suspects(x, y, level, budget).map(card => ({ kind: 'gate-blame' as const, x, y, level, card })),
    ];
  }));
  const kits = !scope.blame ? [] : scopeKits(scope).flatMap(kit => inScope(STYLE_LEVELS, scope).flatMap(level => {
    const c = kitVerdict(kit, level, budget);
    if (c.ok && !c.dominates) return [];
    return ownCards(kit, level).map(card => ({ kind: 'gate-ablate' as const, kit, level, card: card.id }));
  }));
  return [...triangle, ...kits];
}

/** The kit's own cards its hero holds at `level`. */
const ownCards = (kit: string, level: number) => (theSet().kit(kit)?.actions ?? []).filter(a => a.skillId === kit && a.unlockLevel <= level);

/** One kit run's two verdicts: fights end, and the kit not dominating the field. */
function runVerdict(run: KitMirrorRun): { medianRounds: number; p90Rounds: number; stallRate: number; winrate: number; ok: boolean; reasons: string[]; dominates: boolean } {
  const fights = run.fights;
  const ended = fights.filter(f => !f.capped).map(f => f.rounds).sort((a, b) => a - b);
  // A stall counts as the longest fight: it never ended.
  const rounds = [...ended, ...fights.filter(f => f.capped).map(f => f.rounds)];
  const stallRate = fights.filter(f => f.capped).length / Math.max(1, fights.length);
  const medianRounds = quantile(rounds, 0.5), p90Rounds = quantile(rounds, 0.9);
  const v = durationVerdict(medianRounds, p90Rounds, stallRate, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE);
  const winrate = fights.reduce((t, f) => t + f.won, 0) / Math.max(1, fights.length);
  return { medianRounds, p90Rounds, stallRate, winrate, ok: v.ok, reasons: v.reasons, dominates: dominatesField(winrate, fights.length) };
}

const kitVerdict = (kit: string, level: number, budget: GateBudget, withoutCard?: string) =>
  runVerdict(kitMirrors(kit, level, budget.kitFights, MAX_P90_ROUNDS, withoutCard));

function quantile(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : 0;
}

const isLong = (f: { rounds: number; capped: boolean }) => f.capped || f.rounds > MAX_P90_ROUNDS;

function shapeOf(a: MirrorAutopsy): FightShape {
  const cards = a.attacks + a.defenses + Math.max(0, a.focus - a.focusLost);
  return {
    fights: a.fights, pvPerRound: a.pvLost / Math.max(1, a.rounds), emptyAttacks: a.emptyAttacks / Math.max(1, a.attacks),
    focusLost: a.focusLost / Math.max(1, a.focus), defenseShare: a.defenses / Math.max(1, cards),
  };
}

function cardName(id: string): string {
  for (const k of theSet().calibration.mainKits) {
    const a = theSet().kit(k)?.actions.find(x => x.id === id);
    if (a) return a.name;
  }
  return id;
}

function byKit(fights: { kit: string; long: boolean }[]): { kit: string; longShare: number; fights: number }[] {
  const t = new Map<string, { long: number; n: number }>();
  for (const f of fights) { const r = t.get(f.kit) ?? { long: 0, n: 0 }; r.n++; if (f.long) r.long++; t.set(f.kit, r); }
  return [...t].map(([kit, r]) => ({ kit, longShare: r.long / r.n, fights: r.n }))
    .filter(r => r.fights >= 5).sort((a, b) => b.longShare - a.longShare).slice(0, 3);
}

export function gateKitCell(kit: string, level: number, budget: GateBudget = GATE_BUDGET, blame = false): GateKitCell {
  const run = kitMirrors(kit, level, budget.kitFights, MAX_P90_ROUNDS);
  const fights = run.fights;
  const lateTotal = Object.values(run.long.late).reduce((t, n) => t + n, 0);
  const why: LengthAutopsy = {
    longShare: fights.filter(isLong).length / Math.max(1, fights.length),
    foes: byKit(fights.flatMap(f => f.foes.map(k => ({ kit: k, long: isLong(f) })))),
    partners: byKit(fights.map(f => ({ kit: f.partner, long: isLong(f) }))),
    late: Object.entries(run.long.late).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([card, n]) => ({ card, name: cardName(card), share: n / Math.max(1, lateTotal) })),
    long: shapeOf(run.long), short: shapeOf(run.short),
  };
  const v = runVerdict(run);
  const failing = !v.ok || v.dominates;
  const blamed = blame && failing && STYLE_LEVELS.includes(level) ? ownCards(kit, level).map(card => {
    const w = kitVerdict(kit, level, budget, card.id);
    return {
      card: card.id, name: card.name, medianRounds: w.medianRounds, p90Rounds: w.p90Rounds, stallRate: w.stallRate, winrate: w.winrate,
      lengthOk: w.ok, dominates: w.dominates, flips: (v.ok || w.ok) && (!v.dominates || !w.dominates),
    };
  }) : [];
  return { kit, level, fights: fights.length, ...v, why, blame: blamed };
}

export function gateStyleCell(level: number, budget: GateBudget = GATE_BUDGET, triangle = true): GateStyleCell {
  const edges = !triangle ? [] : EDGES.map(([x, y]) => {
    const d = styleDuel(x, y, level, budget.duelGames);
    return { winner: x, loser: y, winrate: d.score, games: d.games };
  });
  const dumb = DUMB_STYLES.map(style => {
    const d = styleDuel(style, 'ai', level, budget.duelGames);
    return { style, score: d.score, stalls: d.stalls, games: d.games, ok: edgeHolds(1 - d.score, d.games) };
  });
  const judged = triangle ? EDGES : [];
  const culprits = judged.filter(([x, y]) => {
    const e = edges.find(d => d.winner === x && d.loser === y)!;
    return !edgeHolds(e.winrate, e.games);
  }).map(([x, y]) => {
    const before = edges.find(d => d.winner === x && d.loser === y)!.winrate;
    const cards = suspects(x, y, level, budget).map(card => ({
      card, name: cardName(card), shift: 100 * (styleDuel(x, y, level, budget.duelGames, card).score - before),
    })).sort((a, b) => b.shift - a.shift).slice(0, 3);
    return { edge: `${x} > ${y}`, cards };
  });
  const autopsies = judged.filter(([x, y]) => {
    const e = edges.find(d => d.winner === x && d.loser === y)!;
    return !edgeHolds(e.winrate, e.games);
  }).map(([x, y]) => duelAutopsy(x, y, level, budget.duelGames));
  const model = modelCheck(level, budget.modelFights ?? GATE_BUDGET.modelFights!);
  return {
    level, edges, broken: triangleVerdict(edges).broken, culprits, autopsies, model: { ...model, ...modelVerdict(model.predicted, model.actual) },
    dumb,
  };
}

export function gateCardCells(kit: string, budget: GateBudget = GATE_BUDGET, levels: readonly number[] = CARD_LEVELS): GateCardCell[] {
  const cards = (theSet().kit(kit)?.actions ?? []).filter(a => a.skillId === kit);
  const priced = levels.map(level => {
    const m = kitMirrorCardValues(kit, level, budget.cardFights);
    return { level, scores: new Map(scoreCards(m.values).map(s => [s.id, s])), legal: m.legal, played: m.played };
  });
  return cards.map(card => {
    const rows = priced.filter(p => p.level >= card.unlockLevel).flatMap(p => {
      const s = p.scores.get(card.id);
      const decisions = p.legal[card.id] ?? 0;
      if (!s || !decisions) return [];
      const playRate = (p.played[card.id] ?? 0) / decisions;
      return [{
        level: p.level, bestShare: s.bestShare, playRate, gainWhenBest: s.gainWhenBest, decisions,
        neverRight: isNeverRight(s.gainWhenBest, s.gainWhenBestStderr, s.observations),
        blind: isBlindSpot(s.bestShare, s.bestStderr, playRate),
      }];
    });
    return {
      kit, card: card.id, name: card.name, unlock: card.unlockLevel, levels: rows,
      // Never right at EVERY level it was judged at: a low card may fade out
      // later, a card with no moment at all has no use.
      neverRight: rows.length > 0 && rows.every(r => r.neverRight),
      blind: rows.some(r => r.blind),
    };
  });
}

export function gateChoiceCell(kit: string, level: number, budget: GateBudget = GATE_BUDGET): GateChoiceCell {
  const c = kitChoiceCost(kitMirrorCardValues(kit, level, budget.cardFights).values);
  return { kit, level, ...c, ok: choiceMattersVerdict(c.mean, c.stderr, MIN_CHOICE_COST) };
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** A duel autopsy in a few lines, the claimed winner first: what each side
 *  played, what its guards met, where its blows landed, what came of its
 *  Focus cards, where its damage came from. */
export function autopsyLines(a: DuelAutopsy): string[] {
  const sides = [[a.x, a.sides.x], [a.y, a.sides.y]] as const;
  const share = (n: number, of: number) => (of ? pct(n / of) : '—');
  const each = (f: (s: DuelAutopsy['sides']['x']) => string) => sides.map(([name, s]) => `${name} ${f(s)}`).join(' · ');
  const plays = (s: DuelAutopsy['sides']['x']) => s.plays.attack + s.plays.defense + s.plays.focus;
  const dealt = (s: DuelAutopsy['sides']['x']) => Object.values(s.dealt).reduce((t, v) => t + v, 0);
  return [
    `${a.x} scores ${pct(a.score)} over ${a.games} duels, ${a.meanRounds.toFixed(1)} rounds on average`,
    `plays (attack / defense / Focus): ${each(s => `${share(s.plays.attack, plays(s))} / ${share(s.plays.defense, plays(s))} / ${share(s.plays.focus, plays(s))}`)}`,
    `guards: ${each(s => `${s.guards} up, ${share(s.guardsFaced, s.guards)} met an attack, ${share(s.guardsHeld, s.guardsFaced)} of those held`)}`,
    `blows on enemies: ${each(s => { const n = s.blowsOpen + s.blowsHeld + s.blowsThrough; return `${share(s.blowsOpen, n)} open, ${share(s.blowsHeld, n)} held, ${share(s.blowsThrough, n)} through a guard`; })}`,
    `Focus cards lost before resolving: ${each(s => share(s.focusLost, s.plays.focus))}`,
    `PV dealt a duel: ${each(s => `${(dealt(s) / a.games).toFixed(1)} (${(Object.entries(s.dealt) as [string, number][]).filter(([, v]) => v / Math.max(1, dealt(s)) >= 0.05).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${share(v, dealt(s))}`).join(', ')})`)}`,
  ];
}

/** The whole gate (or a scope of it), from the cache when it is warm. */
export function measureGate(scope: GateScope = {}, budget: GateBudget = GATE_BUDGET): GateReport {
  const kits = scopeKits(scope).flatMap(kit => inScope(GATE_LEVELS, scope).map(level => gateKitCell(kit, level, budget, scope.blame)));
  const styles = !stylesOn(scope) ? [] : inScope(STYLE_LEVELS, scope).map(level => gateStyleCell(level, budget, scope.triangle !== false));
  const cards = scope.cards === false ? [] : scopeKits(scope).flatMap(kit => gateCardCells(kit, budget, inScope(CARD_LEVELS, scope)));
  const choices = scope.cards === false ? [] : scopeKits(scope).flatMap(kit => inScope(CARD_LEVELS, scope).map(level => gateChoiceCell(kit, level, budget)));
  const failures: GateFailure[] = [
    ...kits.filter(c => !c.ok).map(c => ({ key: `${c.kit} L${c.level} length`, text: `${c.kit} L${c.level}: ${c.reasons.join(', ')}` })),
    ...kits.filter(c => c.dominates).map(c => ({ key: `${c.kit} L${c.level} dominates`, text: `${c.kit} L${c.level}: its side scores ${pct(c.winrate)} against the field` })),
    ...styles.flatMap(s => s.broken.map(b => ({ key: `L${s.level} triangle ${b}`, text: `L${s.level} triangle: ${b} doesn't hold` }))),
    ...styles.flatMap(s => s.dumb.filter(d => !d.ok).map(d => ({ key: `L${s.level} dumb ${d.style}`, text: `L${s.level} dumb play: ${d.style} scores ${pct(d.score)} against the AI` }))),
    ...styles.filter(s => !s.model.ok).map(s => ({ key: `L${s.level} model`, text: `L${s.level} the AI's model of its opponents: ${s.model.off.join(', ')}` })),
    ...choices.filter(c => !c.ok).map(c => ({ key: `${c.kit} L${c.level} choice`, text: `${c.kit} L${c.level}: a random card costs ${c.mean.toFixed(2)}±${c.stderr.toFixed(2)} PV a decision (needs ${MIN_CHOICE_COST})` })),
    ...cards.filter(c => c.neverRight).map(c => ({ key: `${c.kit} ${c.card} never-right`, text: `${c.kit} ${c.name}: never the right play (L${c.levels.map(l => l.level).join(', L')})` })),
    ...cards.filter(c => c.blind).map(c => ({ key: `${c.kit} ${c.card} blind`, text: `${c.kit} ${c.name}: the AI is blind to it (L${c.levels.filter(l => l.blind).map(l => l.level).join(', L')})` })),
  ];
  return { kits, styles, cards, choices, failures };
}

/** Everything a worker needs to rebuild the gate's run. */
export interface GateContext { set: RunContext['set']; budget: GateBudget }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'gate-worker.js');

/** Fill the cache `measureGate(scope, ctx.budget)` reads, across bench's lanes. */
export async function prepareGate(ctx: GateContext, scope: GateScope = {}, onProgress?: (done: number, total: number) => void): Promise<void> {
  const worker = [process.execPath, '--import', 'tsx', WORKER, JSON.stringify(ctx)];
  await warm(gateJobs(scope), worker, onProgress);
  await warm(blameJobs(scope, ctx.budget), worker, onProgress);
}
