/**
 * THE PLAYOUT JUDGE — the AI's choice against the actual end of the game.
 *
 * Where the referee cannot go (a real-size fight, real dice, played to its
 * end), this asks a narrower question it can answer at any size: with the AI
 * playing BOTH sides from the next round on, does some other card this round
 * win more often than the one the AI chose? Every candidate is played to the
 * real end (a side down, or the engine's own stall rule) on the same seeded
 * games, so the comparison is paired; the result is the game's own — won,
 * lost, drawn.
 *
 *   CANDIDATES  the AI's pick, and every pick that changes ONE seat's card.
 *   VERDICT     a candidate BEATS the pick when its paired mean outcome is
 *               ahead by more than ε and z standard errors, and still is on a
 *               second, fresh batch of games.
 *
 * What it proves is a contradiction, not an optimum: the AI's own play
 * afterwards wins more with the other card, so the AI misjudged its own
 * continuation. That is a real defect at any size; whether the other card is
 * the best one is the referee's question, asked once the position has been
 * shrunk small enough (`shrink.ts`).
 */
import { withSeed, type CombatEngine } from '@pimpampum/engine';
import { aiPolicy } from '../index.js';
import { aiPicks } from './check.js';
import { buildEngine, type Position } from './position.js';
import { outcome } from './referee.js';

export interface PlayoutOptions {
  /** Games per candidate, per batch. */
  games: number;
  /** Outcome lead (+1 win, −1 loss) a candidate must clear… */
  epsilon: number;
  /** …and this many standard errors of the paired difference. */
  z: number;
  /** Seeds the AI's own pick is asked under. */
  aiSeeds: number;
  seed: number;
  /** Skip a position whose result is all but settled: if the AI's pick's mean
   *  outcome over `games/4` screening games is beyond ±this, no card can
   *  matter much and the position is not judged. */
  settled: number;
}

export const DEFAULT_PLAYOUT: PlayoutOptions = { games: 200, epsilon: 0.1, z: 3, aiSeeds: 4, seed: 1, settled: 0.8 };

export interface Candidate {
  /** Card per acting seat of side A (action indices), and by archetype. */
  actions: number[];
  cards: string[];
  /** Mean outcome over the first batch, and the paired lead over the AI's pick. */
  mean: number;
  lead: number;
  /** Standard error of that lead. */
  se: number;
  /** Ahead on the first batch, and again on the second. */
  beats: boolean;
}

export interface PlayoutResult {
  position: Position;
  /** The AI's modal pick, and how many of its seeds chose it. */
  ai: { actions: number[]; cards: string[]; count: number; mean: number };
  candidates: Candidate[];
  /** The candidate with the largest confirmed lead, if any beats the pick. */
  best?: Candidate;
  games: number;
  /** The result was all but settled (`PlayoutOptions.settled`): nothing judged. */
  settledOut?: boolean;
  ms: number;
}

const archOf = (e: CombatEngine, seat: number, actionIdx: number): string =>
  actionIdx < 0 ? 'pass' : e.teams[0][seat].actions[actionIdx].def.id.split('.')[0];

/** One game to its end: side A plays `actions` this round, then the AI plays everyone. */
export function playOne(pos: Position, seats: number[], actions: number[], seed: number): number {
  return withSeed(seed, () => {
    const policy = aiPolicy({ depth: 1 });
    const e = buildEngine(pos, policy, { ai: true });
    e.prepareRound();
    e.planActions(seats.map((idx, k) => ({ team: 0, idx, actionIdx: actions[k] })));
    let step = e.resolveNextAction();
    for (let guard = 0; step.kind !== 'done'; guard++) {
      if (guard > 400) throw new Error('playout: a round that never ends');
      step = e.resolveNextAction();
    }
    e.finishRound();
    e.runCombat();
    return outcome(e);
  });
}

/** Judge one position. */
export function playoutCheck(pos: Position, opts: Partial<PlayoutOptions> = {}): PlayoutResult {
  const o = { ...DEFAULT_PLAYOUT, ...opts };
  const t0 = performance.now();
  const picks = [...aiPicks(pos, o.aiSeeds).values()].sort((a, b) => b.count - a.count);
  const mine = picks[0];

  // The seats that act this round, and each one's legal cards.
  const probe = buildEngine(pos, { actionChooser: () => null });
  const prep = probe.prepareRound();
  const skipping = new Set(prep.skipping.filter(r => r.team === 0).map(r => r.idx));
  const seats = probe.teams[0].map((c, i) => ({ c, i })).filter(({ c, i }) => c.isAlive() && !skipping.has(i)).map(({ i }) => i);
  const legal = seats.map(i => probe.teams[0][i].actions.map((_, a) => a).filter(a => probe.canPlayActionIdx(probe.teams[0][i], a)));

  const batch = (actions: number[], first: number): number[] =>
    Array.from({ length: o.games }, (_, g) => playOne(pos, seats, actions, o.seed * 1_000_003 + first + g));
  const screen = Array.from({ length: Math.ceil(o.games / 4) }, (_, g) => playOne(pos, seats, mine.actions, o.seed * 1_000_003 + 7_000_000 + g));
  const screened = screen.reduce((s, x) => s + x, 0) / screen.length;
  const aiCards = mine.actions.map((x, s) => archOf(probe, seats[s], x));
  if (Math.abs(screened) > o.settled) {
    return { position: pos, ai: { actions: mine.actions, cards: aiCards, count: mine.count, mean: screened }, candidates: [], games: screen.length, settledOut: true, ms: performance.now() - t0 };
  }
  const base = [batch(mine.actions, 0), batch(mine.actions, o.games)];
  const paired = (a: number[], b: number[]): { lead: number; se: number } => {
    const d = a.map((x, k) => x - b[k]);
    const lead = d.reduce((s, x) => s + x, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - lead) ** 2, 0) / Math.max(1, d.length - 1));
    return { lead, se: sd / Math.sqrt(d.length) };
  };
  const ahead = (p: { lead: number; se: number }): boolean => p.lead > Math.max(o.epsilon, o.z * p.se);

  const candidates: Candidate[] = [];
  let games = screen.length + 2 * o.games;
  seats.forEach((_, k) => {
    for (const a of legal[k]) {
      if (a === mine.actions[k]) continue;
      const actions = [...mine.actions];
      actions[k] = a;
      const first = batch(actions, 0);
      games += o.games;
      const p1 = paired(first, base[0]);
      let beats = false;
      if (ahead(p1)) {
        games += o.games;
        beats = ahead(paired(batch(actions, o.games), base[1]));
      }
      candidates.push({
        actions, cards: actions.map((x, s) => archOf(probe, seats[s], x)),
        mean: first.reduce((s, x) => s + x, 0) / o.games, lead: p1.lead, se: p1.se, beats,
      });
    }
  });
  const winners = candidates.filter(c => c.beats).sort((a, b) => b.lead - a.lead);
  return {
    position: pos,
    ai: { actions: mine.actions, cards: mine.actions.map((x, s) => archOf(probe, seats[s], x)), count: mine.count, mean: base[0].reduce((s, x) => s + x, 0) / o.games },
    candidates, ...(winners.length ? { best: winners[0] } : {}), games, ms: performance.now() - t0,
  };
}
