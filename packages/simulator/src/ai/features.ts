/**
 * Position features for the learned value model.
 *
 * Everything is expressed from the point of view of ONE team and, wherever
 * possible, as a ratio or a difference — so the same weights work for a 4v6
 * goblin swarm and a 4v1 boss. Raw counts would make the model memorise party
 * sizes instead of learning what a good position looks like.
 */
import { ActionType, Character, CombatEngine } from '@pimpampum/engine';

export const FEATURE_NAMES = [
  'bias',
  'pvFracUs',          // mean PV fraction, our side
  'pvFracThem',        // mean PV fraction, their side
  'pvFracDiff',        // the same, differenced — the headline term
  'aliveRatio',        // our living bodies / all living bodies (action economy)
  'bodyDiff',          // (ours − theirs) / (ours + theirs)
  'totalPvRatio',      // our total PV / all PV on the table
  'threatUs',          // mean best attack dice we can throw, normalised
  'threatThem',
  'woundedUs',         // fraction of our side below 40% PV (about to die)
  'woundedThem',
  'nearDeadUs',        // fraction of our side one hit from dying
  'nearDeadThem',
  'statusUs',          // mean statuses carried (buffs and debuffs both)
  'statusThem',
  'fatigueUs',         // mean fatigue / budget — how much play is left in us
  'fatigueThem',
  'roundProgress',     // rounds elapsed / maxRounds (draw pressure)
] as const;

export type FeatureVector = number[];
export const FEATURE_COUNT = FEATURE_NAMES.length;

/** Rough measure of how hard a character can hit, for the threat features. */
function bestAttackDice(c: Character): number {
  let best = 0;
  for (const a of c.actions) {
    if (a.def.actionType !== ActionType.Atac || !a.isAvailable()) continue;
    if (c.getSkillLevel(a.def.skillId) < a.def.unlockLevel) continue;
    best = Math.max(best, (a.def.dice?.average() ?? 0) + (a.def.rollBonus ?? 0));
  }
  return best;
}

function sideStats(team: Character[], fatigueMax: number) {
  const living = team.filter(c => c.isAlive());
  const n = Math.max(1, living.length);
  let pvFrac = 0, totalPv = 0, threat = 0, wounded = 0, nearDead = 0, statuses = 0, fatigue = 0;
  for (const c of living) {
    const frac = c.currentPV / Math.max(1, c.maxPV);
    pvFrac += frac;
    totalPv += c.currentPV;
    threat += bestAttackDice(c);
    if (frac < 0.4) wounded++;
    if (c.currentPV <= 4) nearDead++;
    statuses += c.statusRefs().length;
    fatigue += c.fatigue / fatigueMax;
  }
  return {
    count: living.length,
    pvFrac: pvFrac / n,
    totalPv,
    threat: threat / n / 10,   // ~0-1 for typical dice
    wounded: wounded / n,
    nearDead: nearDead / n,
    statuses: Math.min(3, statuses / n) / 3,
    fatigue: fatigue / n,
  };
}

/**
 * Features of the current position from `team`'s perspective. A finished
 * combat is scored by the caller, not here.
 */
export function positionFeatures(engine: CombatEngine, team: number, fatigueMax = 20): FeatureVector {
  const us = sideStats(engine.teams[team], fatigueMax);
  const them = sideStats(engine.teams[1 - team], fatigueMax);
  const bodies = Math.max(1, us.count + them.count);
  const allPv = Math.max(1, us.totalPv + them.totalPv);
  return [
    1,
    us.pvFrac,
    them.pvFrac,
    us.pvFrac - them.pvFrac,
    us.count / bodies,
    (us.count - them.count) / bodies,
    us.totalPv / allPv,
    us.threat,
    them.threat,
    us.wounded,
    them.wounded,
    us.nearDead,
    them.nearDead,
    us.statuses,
    them.statuses,
    us.fatigue,
    them.fatigue,
    Math.min(1, engine.round / Math.max(1, engine.maxRounds)),
  ];
}
