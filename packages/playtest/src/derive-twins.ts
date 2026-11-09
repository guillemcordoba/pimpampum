/**
 * HERO PV DERIVED ON THE VANILLA SET — never chosen (the user, 2026-11-04: "PV
 * needs to be derived to fulfill all the constraints, not the other way
 * around"), on the main kits' calibrated twins (`vanilla.ts`), checked against
 * today's game (`vanillaMatches`; the user, 2026-11-04: vanilla is reasonable
 * now, build on it). Per level, the window of PV that meets every constraint:
 * the floor — interactivity (no fast attack fells a fresh hero,
 * `burst: 'fast'`; the older readings, the twins' strongest blow plain or
 * boosted, stay for the structure search) — and the ceiling, fights ending in
 * time. The derived PV is the CEILING. An empty window is not papered over: it
 * says the STRUCTURE cannot meet the constraints at that level, and which
 * ones collide.
 */
import { DiceRoll, diceDistribution } from '@pimpampum/engine';
import { kitsDynamics, theSet, type FightSummary, type SubjectKit, type Variant } from '@pimpampum/bench';
import type { CensusCard } from './census.js';
import { summarise, type DynamicsSummary } from './dynamics.js';
import type { LadderRung } from './feasibility.js';
import { MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, MAX_UNANSWERABLE_KOS } from './rules.js';
import { vanillaPrint, vanillaTwin, withVanillaSet, type TwinParams } from './vanilla.js';

const PV_MIN = 1;
/** Heroes sit near 26 today and every derivation so far stayed under 40. */
const PV_MAX = 60;

export interface PVDerivation {
  level: number;
  /** Floor: the smallest PV the blow `burst` names fells from full at most
   *  `MAX_UNANSWERABLE_KOS` of the time. */
  floorPV: number;
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

export interface TwinDeriveOptions {
  fights: number; armour: number; burst?: 'aimed' | 'plain' | 'fast';
  /** The engine rules the fights play under (chip damage, Envoltat, guards), as bench's `Variant` takes them. */
  rules?: Omit<Variant, 'pv'>;
}

/** The smallest PV a blow of `dice` + `bonus` fells at most `MAX_UNANSWERABLE_KOS` of the time. */
function floorFor(dice: DiceRoll, bonus: number, armour: number): number {
  const dist = [...diceDistribution(dice)].map(([t, p]) => [Math.max(0, t + bonus - armour), p] as const);
  for (let pv = PV_MIN; pv <= PV_MAX; pv++) if (dist.filter(([d]) => d >= pv).reduce((a, [, p]) => a + p, 0) <= MAX_UNANSWERABLE_KOS) return pv;
  return PV_MAX;
}

const asFight = (s: DynamicsSummary): FightSummary => ({
  fights: s.fights, median: s.median, p90: s.p90, stalls: s.stallRate, pvPerRound: s.pvPerRound,
  emptyAttacks: s.emptyAttacks, mix: s.mix, firstRoundKOs: 0,
});

function blowFloor(level: number, twins: readonly SubjectKit[], burst: TwinDeriveOptions['burst'], armour: number): number {
  if (burst === 'fast') {
    // Interactivity: the strongest fast attack the real kits hold at this level.
    const fast = theSet().calibration.mainKits.flatMap(k => theSet().kit(k)?.actions ?? [])
      .filter(a => a.fast && a.actionType === 'Atac' && a.dice && a.unlockLevel <= level)
      .sort((a, b) => (b.dice!.average() + (b.rollBonus ?? 0)) - (a.dice!.average() + (a.rollBonus ?? 0)))[0];
    return fast ? floorFor(fast.dice!, fast.rollBonus ?? 0, armour) : PV_MIN;
  }
  // The level's strongest blow: the biggest dice a twin card held at this level
  // rolls, and (aimed) the biggest bonus a boost held at this level gives.
  let strongest = new DiceRoll(1, 4), bonus = 0;
  for (const t of twins) for (const a of t.actions) {
    if (a.unlockLevel > level) continue;
    if (a.dice && a.actionType !== 'Defensa' && a.dice.average() > strongest.average()) strongest = a.dice;
    for (const e of a.effects) bonus = Math.max(bonus, Number(e.params?.['bonus'] ?? 0));
  }
  return floorFor(strongest, burst === 'plain' ? 0 : bonus, armour);
}

export function deriveOnTwins(
  level: number, cards: readonly CensusCard[], ladder: Readonly<Record<number, LadderRung>>, p: TwinParams, opts: TwinDeriveOptions,
): PVDerivation {
  const twins = theSet().calibration.mainKits.map(k => vanillaTwin(k, cards, ladder, p));
  const print = `${twins.map(vanillaPrint).join('|')}#${JSON.stringify(p)}`;
  const floorPV = blowFloor(level, twins, opts.burst, opts.armour);

  return withVanillaSet(twins, () => {
    const measured = new Map<number, DynamicsSummary>();
    const at = (pv: number): DynamicsSummary => {
      let s = measured.get(pv);
      if (!s) {
        s = summarise(kitsDynamics(level, opts.fights, { pv, ...opts.rules }, { kits: twins.map(t => t.id), print }));
        measured.set(pv, s);
      }
      return s;
    };
    const ends = (s: DynamicsSummary) => s.median <= MAX_MEDIAN_ROUNDS && s.p90 <= MAX_P90_ROUNDS && s.stallRate < MAX_STALL_RATE;
    let lengthPV: number | null = null;
    if (ends(at(PV_MIN))) {
      let lo = PV_MIN, hi = PV_MAX;
      if (ends(at(hi))) lo = hi;
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ends(at(mid))) lo = mid; else hi = mid; }
      lengthPV = lo;
    }
    const collides = lengthPV === null ? ['fights do not end in time even at the smallest PV']
      : lengthPV < floorPV ? [
        `${opts.burst === 'fast' ? 'the strongest fast attack' : 'the best blow'} needs ≥ ${floorPV}`,
        `fights end in time only up to ${lengthPV}`,
      ] : [];
    return {
      level, floorPV, lengthPV,
      pv: lengthPV !== null && lengthPV >= floorPV ? lengthPV : null, collides,
      measured: [...measured].sort((a, b) => a[0] - b[0]).map(([pv, s]) => ({ pv, summary: asFight(s) })),
    };
  });
}
