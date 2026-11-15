/**
 * THE STRATEGY POOL'S FIGHTS (the user, 2026-11-15: "we need the strategy
 * pool ai … we are happy when the strategy pool converges to a player that
 * reads the opponent and does the winning play against it").
 *
 * A pool member is a RESPONSE TABLE: the plan (`plans.ts`) its side opens
 * with, and the plan it answers with after each plan the other side showed
 * last round. A table that answers everything the same way is a fixed
 * strategy (always attack: spam; always defend: the turtle); one whose
 * answers follow what it saw is a reader. Which cards a plan means is the
 * production search's choice, so a table differs from another only in what
 * it plays, never in how well it plays it.
 *
 * This module plays one member against another; growing the pool (the double
 * oracle over tables) is playtest's `pool.ts`. The production AI can sit in a
 * duel too, to be read against the pool: it is not a member the pool grows
 * from.
 */
import { CombatEngine, ROUND_CAP, random, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { variantPV, variantRules, type Variant } from './dynamics.js';
import { heroPVPrint, theSet } from './gameset.js';
import { planChooser, planPlayed, PLANS, type Plan } from './plans.js';
import type { Chooser } from './policies.js';

/** The plan a side opens with, and its answer to each plan the other side showed the round before. */
export interface ResponseTable { first: Plan; after: Readonly<Record<Plan, Plan>> }
export type PoolMember = ResponseTable | 'ai';

/** A table as fourteen letters: the opening, then the answer to each of `PLANS` in order. */
export const tableKey = (t: ResponseTable): string => [t.first, ...PLANS.map(p => t.after[p])].join('');
export const memberKey = (m: PoolMember): string => (m === 'ai' ? 'ai' : tableKey(m));

/** The table that plays `plan` whatever it sees. */
export const always = (plan: Plan): ResponseTable => ({ first: plan, after: Object.fromEntries(PLANS.map(p => [p, plan])) as Record<Plan, Plan> });

const TARGETS = aiPolicy(CELL_AI).targetChooser;
const SEED_BASE = 919_000;
type Given = { kits: readonly string[]; print: string };

export interface PoolDuel { score: number; stalls: number; games: number; meanRounds: number }

function team(kits: readonly string[], level: number, side: string, variant: Variant): Character[] {
  const set = theSet();
  const heroes = set.buildParty({ characters: kits.map((k, i) => { const pv = variantPV(variant, k, level); return { ...set.hero(`${side}${i + 1}`, k, level), ...(pv ? { pv } : {}) }; }) });
  for (const c of heroes) c.aiControlled = true;
  return heroes;
}

/**
 * X's score against Y (draws and stalls ½) over `games` fights at `level`:
 * both sides field the same drawn pair of kits, seats alternating. Every duel
 * at a level meets the same kit pairs in the same order, so two candidates
 * set against one opponent are compared on the same fights.
 */
export function poolDuel(x: PoolMember, y: PoolMember, level: number, games: number, variant: Variant = {}, given?: Given): PoolDuel {
  // One entry for a pair, whichever way round it is asked.
  if (memberKey(x) > memberKey(y)) {
    const d = poolDuel(y, x, level, games, variant, given);
    return { ...d, score: 1 - d.score };
  }
  const kits = given?.kits ?? theSet().calibration.mainKits;
  const print = `${given?.print ?? kits.map(skillPrint).join('|')}#pv:${heroPVPrint()}`;
  return countedCached('pool-duel', key('pool-duel-v1', print, memberKey(x), memberKey(y), String(level), String(games), JSON.stringify(variant)), () => {
    let score = 0, stalls = 0, rounds = 0;
    const seed = SEED_BASE + level * 7_919;
    const draw = () => kits[Math.floor(random() * kits.length)];
    const pairs = withSeed(seed, () => Array.from({ length: games }, () => [draw(), draw()]));
    for (let f = 0; f < games; f++) {
      // Each fight on its own seed: the same kit pair and the same dice to start from, whoever plays.
      withSeed(seed + (f + 1) * 104_729, () => {
        const pair = pairs[f];
        const xSide = f % 2;
        /** The plan each side showed in the round before. */
        const shown: (Plan | null)[] = [null, null];
        const chooserOf = (m: PoolMember, side: number): Chooser => (m === 'ai' ? lookaheadChooser(DEFAULT_LOOKAHEAD)
          : planChooser(() => { const saw = shown[1 - side]; return saw ? m.after[saw] : m.first; }));
        const choosers = [chooserOf(xSide === 0 ? x : y, 0), chooserOf(xSide === 0 ? y : x, 1)];
        const e = new CombatEngine(team(pair, level, 'A', variant), team(pair, level, 'B', variant), {
          registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS, ...variantRules(variant),
          actionChooser: (en, c) => choosers[c.team](en as CombatEngine, c),
        });
        while (!e.isOver() && e.round < e.maxRounds) {
          e.prepareRound();
          e.planActions([]);
          const now = [planPlayed(e, 0), planPlayed(e, 1)];
          for (let step = e.resolveNextAction(); step.kind !== 'done'; step = e.resolveNextAction()) {
            if (step.kind === 'target') e.setResolveTarget([]);
            else if (step.kind === 'choice') e.setResolveChoice();
          }
          e.finishRound();
          for (const side of [0, 1]) if (now[side]) shown[side] = now[side];
        }
        const w = e.winner();
        if (!e.isOver()) stalls++;
        score += !e.isOver() || w === null ? 0.5 : w === xSide ? 1 : 0;
        rounds += e.round;
      });
    }
    return { score: score / games, stalls: stalls / games, games, meanRounds: rounds / games };
  });
}
