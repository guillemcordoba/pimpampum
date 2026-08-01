/**
 * The lean policy: a linear scorer over generic action features, trained to
 * imitate the heavy search AI.
 *
 * The balancer runs thousands of combats to price one encounter, so it cannot
 * afford lookahead. What it CAN afford is a dot product per candidate card.
 * This module is the runtime half of that: the features and the scorer live
 * here, and the weights are fitted offline by the simulator (policy
 * distillation — see `distil-ai.ts`) and pasted into `POLICY_WEIGHTS`.
 *
 * IMPORTANT modelling constraint: the policy is a softmax over the candidate
 * cards of ONE decision, so a feature that is identical for every candidate
 * (how wounded the party is, how many enemies there are) contributes nothing —
 * it shifts every score equally and cancels. Context therefore only enters
 * CROSSED with the action, as "how much do I want an attack *given* that my
 * allies are hurt". Those crossed terms are what let a linear model express a
 * combo instead of a fixed per-card preference.
 *
 * Every feature is derived from fields the ENGINE already understands (action
 * type, dice, speed, fatigue cost, target count) plus the shape of the
 * position. Nothing names a card, a skill or a status, so the engine stays
 * content-agnostic and the same weights apply to content that doesn't exist yet.
 */
import { Character } from './character.js';
import { ActionDefinition, ActionType } from './types.js';

/** Context terms each action TYPE is crossed with. `one` is the plain type bias. */
const CONTEXT_TERMS = [
  'one',
  'alliesWounded',
  'outnumbered',
  'enemyNearDead',
  'actorHurt',
  'actorNearDead',
  'fatigueLeft',
  'enemyCount',
  'lateRound',
] as const;

const TYPE_TERMS = ['atac', 'defensa', 'focus'] as const;

/** Action-intrinsic features (vary card to card regardless of type). */
const INTRINSIC = ['dice', 'speed', 'fatigueCost', 'targetCount', 'diceXAtac'] as const;

export const POLICY_FEATURE_NAMES: string[] = [
  ...TYPE_TERMS.flatMap(t => CONTEXT_TERMS.map(c => (c === 'one' ? `is:${t}` : `${t}×${c}`))),
  ...INTRINSIC,
];

export type PolicyFeatures = number[];
export const POLICY_FEATURE_COUNT = POLICY_FEATURE_NAMES.length;

/** Context shared by every candidate action of one actor — computed once. */
export interface PolicyContext {
  alliesWounded: number;
  outnumbered: number;
  enemyNearDead: number;
  actorHurt: number;
  actorNearDead: number;
  fatigueLeft: number;
  enemyCount: number;
  lateRound: number;
}

export function policyContext(
  actor: Character,
  allies: Character[],
  enemies: Character[],
  opts: { fatigueMax?: number; round?: number; maxRounds?: number } = {},
): PolicyContext {
  const fatigueMax = opts.fatigueMax ?? 20;
  const livingAllies = allies.filter(c => c.isAlive());
  const livingEnemies = enemies.filter(c => c.isAlive());
  const nAllies = Math.max(1, livingAllies.length);
  const nEnemies = Math.max(1, livingEnemies.length);
  const frac = actor.currentPV / Math.max(1, actor.maxPV);
  return {
    alliesWounded: livingAllies.filter(c => c.currentPV / Math.max(1, c.maxPV) < 0.4).length / nAllies,
    outnumbered: livingEnemies.length > livingAllies.length ? 1 : 0,
    enemyNearDead: livingEnemies.filter(c => c.currentPV <= 4).length / nEnemies,
    actorHurt: 1 - frac,
    actorNearDead: actor.currentPV <= 4 ? 1 : 0,
    fatigueLeft: Math.max(0, 1 - actor.fatigue / fatigueMax),
    enemyCount: Math.min(1, livingEnemies.length / 6),
    lateRound: Math.min(1, (opts.round ?? 0) / Math.max(1, opts.maxRounds ?? 40)),
  };
}

/** Features of one candidate action in a given context. */
export function policyFeatures(
  def: ActionDefinition,
  effectiveSpeed: number,
  ctx: PolicyContext,
): PolicyFeatures {
  const isAtac = def.actionType === ActionType.Atac ? 1 : 0;
  const isDefensa = def.actionType === ActionType.Defensa ? 1 : 0;
  const isFocus = def.actionType === ActionType.Focus ? 1 : 0;
  const dice = ((def.dice?.average() ?? 0) + (def.rollBonus ?? 0)) / 10;

  const contextValues = [
    1,
    ctx.alliesWounded,
    ctx.outnumbered,
    ctx.enemyNearDead,
    ctx.actorHurt,
    ctx.actorNearDead,
    ctx.fatigueLeft,
    ctx.enemyCount,
    ctx.lateRound,
  ];

  const f: number[] = [];
  for (const isType of [isAtac, isDefensa, isFocus]) {
    for (const v of contextValues) f.push(isType * v);
  }
  f.push(
    dice,
    effectiveSpeed / 5,
    (def.fatigueCost ?? 1) / 3,
    Math.min(6, def.targetCount ?? 1) / 6,
    dice * isAtac,
  );
  return f;
}

/**
 * Weights fitted by distilling the search AI (simulator `distil-ai.ts`).
 * All zeros means "not yet trained" — `LearnedPolicy.isTrained` reports that
 * so callers can fall back to the built-in heuristic instead of choosing at
 * random.
 */
export const POLICY_WEIGHTS: number[] = new Array(POLICY_FEATURE_COUNT).fill(0);

export class LearnedPolicy {
  constructor(public weights: number[] = POLICY_WEIGHTS) {}

  get isTrained(): boolean {
    return this.weights.some(w => w !== 0);
  }

  score(f: PolicyFeatures): number {
    let z = 0;
    for (let i = 0; i < this.weights.length && i < f.length; i++) z += this.weights[i] * f[i];
    return z;
  }

  /** Softmax probabilities over candidate scores, with a temperature. */
  static softmax(scores: number[], temperature = 1): number[] {
    const t = Math.max(1e-6, temperature);
    const max = Math.max(...scores);
    const exps = scores.map(s => Math.exp((s - max) / t));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map(e => e / sum);
  }
}
