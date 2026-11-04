/**
 * HERO PV, DERIVED — never chosen (the user, 2026-11-04: "PV needs to be
 * derived to fulfill all the constraints, not the other way around"). Per
 * level, on vanilla kits (`vanilla.ts`: the structure with no real card in it),
 * the window of PV that meets every constraint:
 *
 *  - FLOOR, burst: a fresh hero survives its level's best blow (an aimed
 *    strike, the vanilla kit's strongest) 9 times in 10 — from the dice alone —
 *    and survives the first round 9 times in 10 — from the fights;
 *  - CEILING, length: fights end — the median, 9 in 10 within the limit, and
 *    almost no stalls (`MAX_MEDIAN_ROUNDS`, `MAX_P90_ROUNDS`, `MAX_STALL_RATE`).
 *
 * The derived PV is the CEILING: the most a hero can hold while fights still
 * end in time — the longest fights allowed, the most robust to a lucky blow.
 * An empty window (ceiling under the floor) is not papered over: it says the
 * STRUCTURE (the ladder, the Focus rule) cannot meet the constraints at that
 * level, and which ones collide.
 */
import { DiceRoll, diceDistribution } from '@pimpampum/engine';
import { kitOnlyMirrors, type FightSummary } from '@pimpampum/bench';
import type { LadderRung } from './feasibility.js';
import { MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE } from './rules.js';
import { vanillaKit, vanillaPrint } from './vanilla.js';
import { withControlKit } from './control-kits.js';
import { installSet, type RunContext } from './prepare.js';

/** At most this share of fresh heroes may fall in the first round. */
export const MAX_ROUND_ONE_KOS = 0.1;
/** At most this share of the level's best blows may fell a fresh hero. */
export const MAX_BEST_BLOW_KOS = 0.1;

const PV_MIN = 1;
const PV_MAX = 120;

export interface PVOptions { aim: number; armour: number; fights: number }

export interface PVDerivation {
  level: number;
  /** Floors: the best blow (dice alone) and the first round (fights). */
  bestBlowPV: number; roundOnePV: number;
  /** Ceiling: the most PV with fights still ending in time (null: not even
   *  at the smallest PV). */
  lengthPV: number | null;
  /** The derived PV, or null when the window is empty. */
  pv: number | null;
  /** What closes the window when it is empty. */
  collides: string[];
  /** Every PV the search measured, for the report. */
  measured: { pv: number; summary: FightSummary }[];
}

/** The smallest PV the best blow fells at most `MAX_BEST_BLOW_KOS` of the time. */
function bestBlowFloor(rung: LadderRung, opts: PVOptions): number {
  const k = 1 + opts.aim;
  const blow = new DiceRoll(rung.attack.numDice * k, rung.attack.sides, rung.attack.modifier * k);
  const dist = [...diceDistribution(blow)].map(([total, p]) => [Math.max(0, total - opts.armour), p] as const);
  for (let pv = PV_MIN; pv <= PV_MAX; pv++) {
    if (dist.filter(([d]) => d >= pv).reduce((t, [, p]) => t + p, 0) <= MAX_BEST_BLOW_KOS) return pv;
  }
  return PV_MAX;
}

export function derivePV(level: number, rung: LadderRung, opts: PVOptions): PVDerivation {
  const measured = new Map<number, FightSummary>();
  const kit = vanillaKit(level, rung, opts.aim);
  const at = (pv: number): FightSummary => {
    let s = measured.get(pv);
    if (!s) {
      s = withControlKit(kit, def => kitOnlyMirrors(def.id, vanillaPrint(def), level, pv, opts.fights));
      measured.set(pv, s);
    }
    return s;
  };
  const ends = (s: FightSummary) => s.median <= MAX_MEDIAN_ROUNDS && s.p90 <= MAX_P90_ROUNDS && s.stalls < MAX_STALL_RATE;
  const survives = (s: FightSummary) => s.firstRoundKOs <= MAX_ROUND_ONE_KOS;

  // Both searches assume the obvious direction: more PV, longer fights and
  // fewer first-round KOs. Bisection on integers.
  let lengthPV: number | null = null;
  if (ends(at(PV_MIN))) {
    let lo = PV_MIN, hi = PV_MAX;
    if (ends(at(hi))) lo = hi;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ends(at(mid))) lo = mid; else hi = mid; }
    lengthPV = lo;
  }
  let roundOnePV = PV_MAX;
  if (survives(at(PV_MAX))) {
    let lo = PV_MIN, hi = PV_MAX;
    if (survives(at(lo))) hi = lo;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (survives(at(mid))) hi = mid; else lo = mid; }
    roundOnePV = hi;
  }
  const bestBlowPV = bestBlowFloor(rung, opts);
  const floor = Math.max(bestBlowPV, roundOnePV);
  const collides = lengthPV === null ? ['fights do not end in time even at the smallest PV']
    : lengthPV < floor ? [
      ...(lengthPV < bestBlowPV ? [`the best blow needs ≥ ${bestBlowPV}`] : []),
      ...(lengthPV < roundOnePV ? [`the first round needs ≥ ${roundOnePV}`] : []),
      `fights end in time only up to ${lengthPV}`,
    ] : [];
  return {
    level, bestBlowPV, roundOnePV, lengthPV,
    pv: lengthPV !== null && lengthPV >= floor ? lengthPV : null,
    collides,
    measured: [...measured].sort((a, b) => a[0] - b[0]).map(([pv, summary]) => ({ pv, summary })),
  };
}

/** One level, in a child process (bench `isolated`): install the set and
 *  derive. The rung's dice travel as notation. */
export async function deriveLevel(set: RunContext['set'], level: number, attack: string, defense: string, opts: PVOptions): Promise<PVDerivation> {
  await installSet(set);
  return derivePV(level, { attack: DiceRoll.parse(attack), defense: DiceRoll.parse(defense) }, opts);
}
