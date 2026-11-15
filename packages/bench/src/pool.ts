/**
 * THE STRATEGY POOL'S FIGHTS (the user, 2026-11-15: "we need the strategy
 * pool ai … we are happy when the strategy pool converges to a player that
 * reads the opponent and does the winning play against it").
 *
 * A pool member is a STRATEGY: a rule that names, each round, the plan
 * (`plans.ts`) its side plays. Which cards a plan means is the production
 * search's choice, so one strategy differs from another only in what it
 * plays, never in how well it plays it. Four kinds of logic, each with a few
 * numbers a search can turn (the user, that day: "generate a bunch of them
 * with different logic but with tunable parameters"):
 *  - a TABLE: the plan it opens with, and its answer to each plan the other
 *    side showed the round before. One that answers everything alike is a
 *    fixed strategy (always attack: spam; always defend: the turtle);
 *  - a MIXER: fixed odds of an attack, a defense or a Focus for each hero,
 *    every round;
 *  - a STATE player: it looks at the fight, not at the opponent's cards. It
 *    attacks when an enemy is low, guards when one of its own is, and plays a
 *    Focus in the first rounds;
 *  - a SCRIPT: one plan for the first rounds, another after (set up, then
 *    execute).
 *
 * This module plays one member against another; growing the pool (the double
 * oracle over strategies) is playtest's `pool.ts`. The production AI can sit
 * in a duel too, to be read against the pool: it is not a member the pool
 * grows from.
 */
import { CombatEngine, ROUND_CAP, random, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { variantPV, variantRules, type Variant } from './dynamics.js';
import { heroPVPrint, theSet } from './gameset.js';
import { planChooser, planOf, planPlayed, PLANS, type Kind, type Plan } from './plans.js';
import type { Chooser } from './policies.js';

/** The plan a side opens with, and its answer to each plan the other side showed the round before. */
export interface ResponseTable { kind: 'table'; first: Plan; after: Readonly<Record<Plan, Plan>> }
/** Each hero attacks with odds `attack`, defends with odds `defense`, plays a Focus otherwise. */
export interface Mixer { kind: 'mixer'; attack: number; defense: number }
/**
 * Both attack when an enemy hero holds under `strikeBelow` of its PV;
 * otherwise one guards when one of its own holds under `guardBelow`, and
 * whoever is left plays a Focus through round `focusRounds` and attacks after.
 */
export interface StatePlayer { kind: 'state'; guardBelow: number; strikeBelow: number; focusRounds: number }
/** `opening` for the first `rounds` rounds, `then` after. */
export interface Script { kind: 'script'; opening: Plan; rounds: number; then: Plan }

export type Strategy = ResponseTable | Mixer | StatePlayer | Script;
export type PoolMember = Strategy | 'ai';

/** A table as fourteen letters: the opening, then the answer to each of `PLANS` in order. */
export const tableKey = (t: ResponseTable): string => [t.first, ...PLANS.map(p => t.after[p])].join('');

/** A member's name in the cache and in a pool: the same strategy, the same key. */
export function memberKey(m: PoolMember): string {
  if (m === 'ai') return 'ai';
  switch (m.kind) {
    case 'table': return `table:${tableKey(m)}`;
    case 'mixer': return `mixer:${m.attack},${m.defense}`;
    case 'state': return `state:${m.guardBelow},${m.strikeBelow},${m.focusRounds}`;
    case 'script': return `script:${m.opening},${m.rounds},${m.then}`;
  }
}

/** The table that plays `plan` whatever it sees. */
export const always = (plan: Plan): ResponseTable => ({ kind: 'table', first: plan, after: Object.fromEntries(PLANS.map(p => [p, plan])) as Record<Plan, Plan> });

/** The heroes a plan speaks for, still standing. */
const heroes = (engine: CombatEngine, team: number): Character[] => engine.teams[team].slice(0, 2).filter(c => c.isAlive());
const lowest = (engine: CombatEngine, team: number): number => Math.min(1, ...heroes(engine, team).map(c => c.currentPV / Math.max(1, c.maxPV)));

/** The plan `m` names for `team` this round; `shown` is the plan the other side showed the round before. */
export function planFor(m: Strategy, engine: CombatEngine, team: number, shown: Plan | null): Plan {
  switch (m.kind) {
    case 'table': return shown ? m.after[shown] : m.first;
    case 'mixer': {
      const draw = (): Kind => { const x = random(); return x < m.attack ? 'A' : x < m.attack + m.defense ? 'D' : 'F'; };
      return planOf([draw(), draw()])!;
    }
    case 'state': {
      if (lowest(engine, 1 - team) < m.strikeBelow) return 'AA';
      const rest: Kind = engine.round <= m.focusRounds ? 'F' : 'A';
      return planOf(lowest(engine, team) < m.guardBelow ? ['D', rest] : [rest, rest])!;
    }
    case 'script': return engine.round <= m.rounds ? m.opening : m.then;
  }
}

const TARGETS = aiPolicy(CELL_AI).targetChooser;
const SEED_BASE = 919_000;
type Given = { kits: readonly string[]; print: string };

export interface PoolDuel { score: number; stalls: number; games: number; meanRounds: number }

function team(kits: readonly string[], level: number, side: string, variant: Variant): Character[] {
  const set = theSet();
  const fielded = set.buildParty({ characters: kits.map((k, i) => { const pv = variantPV(variant, k, level); return { ...set.hero(`${side}${i + 1}`, k, level), ...(pv ? { pv } : {}) }; }) });
  for (const c of fielded) c.aiControlled = true;
  return fielded;
}

/**
 * X's score against Y (draws and stalls ½) over `games` fights at `level`:
 * both sides field the same drawn pair of kits, seats alternating. Every duel
 * at a level meets the same kit pairs and starts each fight on the same dice,
 * so two candidates set against one opponent are compared on the same fights.
 * `fresh` > 0: another set of fights, for confirming what a search found on
 * the first.
 */
export function poolDuel(x: PoolMember, y: PoolMember, level: number, games: number, variant: Variant = {}, given?: Given, fresh = 0): PoolDuel {
  // One entry for a pair, whichever way round it is asked.
  if (memberKey(x) > memberKey(y)) {
    const d = poolDuel(y, x, level, games, variant, given, fresh);
    return { ...d, score: 1 - d.score };
  }
  const kits = given?.kits ?? theSet().calibration.mainKits;
  const print = `${given?.print ?? kits.map(skillPrint).join('|')}#pv:${heroPVPrint()}`;
  return countedCached('pool-duel', key('pool-duel-v2', print, memberKey(x), memberKey(y), String(level), String(games), JSON.stringify(variant), String(fresh)), () => {
    let score = 0, stalls = 0, rounds = 0;
    const seed = SEED_BASE + level * 7_919 + fresh * 15_485_863;
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
          : planChooser(engine => planFor(m, engine, side, shown[1 - side])));
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
