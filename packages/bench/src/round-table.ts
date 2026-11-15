/**
 * THE ROUND TABLE — the triangle read one round at a time (the user,
 * 2026-11-15: "if the enemy played an attack, you wished you played a
 * defense, if the enemy played a defense, you wished to have played a focus,
 * if the enemy plays a focus, you wished you had attack").
 *
 * Round starts are taken from ordinary fights (2v2 of drawn kit pairs, the
 * production AI on both sides), where both sides still hold two heroes who
 * can each play all three types. From each, one round is replayed for every
 * pair of plans (`plans.ts`): our side held to one plan, theirs to another,
 * neither knowing the other's (each picks its cards against its usual model
 * of the opponent). Both then play on as the production AI to the fight's
 * end, and the cell is our side's score: the worth of having answered THAT
 * plan with THIS one, set-ups that pay a round later included.
 *
 * It replaced the leans (a side forced to its type half the rounds), which
 * measured a strategy; this measures the round the strategy is made of, and
 * needs nobody to guess.
 */
import { availableActionIndices, CombatEngine, ROUND_CAP, random, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { variantPV, variantRules, type Variant } from './dynamics.js';
import { heroPVPrint, theSet } from './gameset.js';
import { PLANS, planChoices, type Plan } from './plans.js';

/** Positions a job replays: the table is measured in chunks, each cached. */
export const ROUND_TABLE_CHUNK = 12;
const SEED_BASE = 818_000;

export interface RoundCell { n: number; score: number; scoreSq: number; margin: number }
/** `cells[ours][theirs]`: our side's score (1 a win, ½ a draw or a stall, 0) and PV margin at the fight's end, summed over `n` positions. */
export interface RoundTableChunk { positions: number; cells: Record<Plan, Record<Plan, RoundCell>> }

type Given = { kits: readonly string[]; print: string };

const emptyCells = (): RoundTableChunk['cells'] => Object.fromEntries(PLANS.map(ours => [ours, Object.fromEntries(PLANS.map(theirs => [theirs, { n: 0, score: 0, scoreSq: 0, margin: 0 }]))])) as RoundTableChunk['cells'];

function team(kits: readonly string[], level: number, side: string, variant: Variant): Character[] {
  const set = theSet();
  const heroes = set.buildParty({ characters: kits.map((k, i) => { const pv = variantPV(variant, k, level); return { ...set.hero(`${side}${i + 1}`, k, level), ...(pv ? { pv } : {}) }; }) });
  for (const c of heroes) c.aiControlled = true;
  return heroes;
}

/** Can every hero of both sides play an attack, a defense and a Focus this round? */
function everyPlanOpen(e: CombatEngine): boolean {
  return e.teams.every(side => side.length >= 2 && side.slice(0, 2).every(c => {
    if (!c.isAlive() || c.skipTurns > 0) return false;
    const types = new Set(availableActionIndices(c, e.registry).map(i => c.actions[i].def.actionType));
    return types.size >= 3;
  }));
}

/** One fight from `position`, its next round forced to the two plans, the rest played by the production AI; `us`'s score and PV margin. */
function replay(position: CombatEngine, us: number, ours: Plan, theirs: Plan): { score: number; margin: number } {
  const sim = position.clone();
  const normal = aiPolicy(CELL_AI);
  const forcedRound = sim.round + 1;
  const picks: (Map<Character, number> | null)[] = [null, null];
  sim.targetChooser = normal.targetChooser;
  sim.optionChooser = normal.optionChooser;
  sim.actionChooser = (en, c) => {
    if (en.round !== forcedRound) return normal.actionChooser(en, c);
    picks[c.team] ??= planChoices(en as CombatEngine, c.team, c.team === us ? ours : theirs);
    return picks[c.team]!.get(c) ?? normal.actionChooser(en, c);
  };
  const result = sim.runCombat();
  const pv = (t: number) => sim.teams[t].reduce((sum, c) => sum + Math.max(0, c.currentPV), 0);
  return { score: result.capped || result.winner === null ? 0.5 : result.winner === us ? 1 : 0, margin: pv(us) - pv(1 - us) };
}

/** How many jobs `roundTable` is split into. */
export const roundTableChunks = (positions: number): number => Math.ceil(positions / ROUND_TABLE_CHUNK);

/** One chunk of the round table at `level`, cached: what a job computes. */
export function roundTableChunk(level: number, total: number, chunk: number, variant: Variant = {}, given?: Given): RoundTableChunk {
  const kits = given?.kits ?? theSet().calibration.mainKits;
  const print = `${given?.print ?? kits.map(skillPrint).join('|')}#pv:${heroPVPrint()}`;
  const want = Math.max(0, Math.min(ROUND_TABLE_CHUNK, total - chunk * ROUND_TABLE_CHUNK));
  return countedCached('round-table', key('round-table-v1', print, String(level), String(total), String(chunk), JSON.stringify(variant)), () => {
    const cells = emptyCells();
    let positions = 0;
    withSeed(SEED_BASE + level * 7_919 + chunk * 100_003, () => {
      const draw = () => kits[Math.floor(random() * kits.length)];
      for (let fight = 0; positions < want && fight < 20 * ROUND_TABLE_CHUNK; fight++) {
        const pair = [draw(), draw()];
        const e = new CombatEngine(team(pair, level, 'A', variant), team(pair, level, 'B', variant), {
          registry: theRegistry(), maxRounds: ROUND_CAP, ...variantRules(variant), ...aiPolicy(CELL_AI),
        });
        while (positions < want && !e.isOver() && e.round < e.maxRounds) {
          if (everyPlanOpen(e)) {
            const us = positions % 2;
            const seed = Math.floor(random() * 1e9);
            for (const ours of PLANS) for (const theirs of PLANS) {
              // The same dice for every pair of plans, as far as the cards played let them be.
              const r = withSeed(seed, () => replay(e, us, ours, theirs));
              const cell = cells[ours][theirs];
              cell.n++; cell.score += r.score; cell.scoreSq += r.score * r.score; cell.margin += r.margin;
            }
            positions++;
          }
          e.runRound();
        }
      }
    });
    return { positions, cells };
  });
}

export interface RoundTable {
  level: number; positions: number;
  /** `score[ours][theirs]`: our side's mean score, its standard error, and the mean PV margin at the fight's end. */
  cells: Record<Plan, Record<Plan, { score: number; se: number; margin: number }>>;
}

/** The chunks of one level's table, summed into means. */
export function mergeRoundTable(level: number, chunks: readonly RoundTableChunk[]): RoundTable {
  const sum = emptyCells();
  let n = 0;
  for (const part of chunks) {
    n += part.positions;
    for (const ours of PLANS) for (const theirs of PLANS) {
      const into = sum[ours][theirs], from = part.cells[ours][theirs];
      into.n += from.n; into.score += from.score; into.scoreSq += from.scoreSq; into.margin += from.margin;
    }
  }
  const cells = Object.fromEntries(PLANS.map(ours => [ours, Object.fromEntries(PLANS.map(theirs => {
    const c = sum[ours][theirs], m = c.n ? c.score / c.n : 0;
    return [theirs, { score: m, se: c.n > 1 ? Math.sqrt(Math.max(0, c.scoreSq / c.n - m * m) / (c.n - 1)) : 0, margin: c.n ? c.margin / c.n : 0 }];
  }))])) as RoundTable['cells'];
  return { level, positions: n, cells };
}

/** The whole table at `level` over `positions` round starts, chunk by chunk (from the cache when it is warm). */
export function roundTable(level: number, positions: number, variant: Variant = {}, given?: Given): RoundTable {
  return mergeRoundTable(level, Array.from({ length: roundTableChunks(positions) }, (_, chunk) => roundTableChunk(level, positions, chunk, variant, given)));
}
