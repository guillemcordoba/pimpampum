/**
 * HERO PV DERIVED ON THE VANILLA SET — the main kits' calibrated twins
 * (`vanilla.ts`), checked against today's game (`vanillaMatches`; the user,
 * 2026-11-04: vanilla is reasonable now, build on it). The same constraints as
 * `derivePV`: the floors from burst (a fresh hero survives the level's best
 * blow — read from the twins' own strongest card, plain or with the strongest
 * boost on it — and survives round 1), the ceiling from fights ending in time.
 */
import { DiceRoll, diceDistribution } from '@pimpampum/engine';
import { kitsDynamics, theSet, type FightSummary } from '@pimpampum/bench';
import type { CensusCard } from './census.js';
import { MAX_BEST_BLOW_KOS, MAX_ROUND_ONE_KOS, type PVDerivation } from './derive-pv.js';
import { summarise, type DynamicsSummary } from './dynamics.js';
import type { LadderRung } from './feasibility.js';
import { installSet, type RunContext } from './prepare.js';
import { MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE } from './rules.js';
import { vanillaPrint, vanillaTwin, withVanillaSet, type TwinParams } from './vanilla.js';

const PV_MIN = 1;
/** Heroes sit near 26 today and every derivation so far stayed under 40. */
const PV_MAX = 60;

export interface TwinDeriveOptions { fights: number; armour: number; chip?: number; burst?: 'aimed' | 'plain' }

/** The smallest PV a blow of `dice` + `bonus` fells at most `MAX_BEST_BLOW_KOS` of the time. */
function floorFor(dice: DiceRoll, bonus: number, armour: number): number {
  const dist = [...diceDistribution(dice)].map(([t, p]) => [Math.max(0, t + bonus - armour), p] as const);
  for (let pv = PV_MIN; pv <= PV_MAX; pv++) if (dist.filter(([d]) => d >= pv).reduce((a, [, p]) => a + p, 0) <= MAX_BEST_BLOW_KOS) return pv;
  return PV_MAX;
}

const asFight = (s: DynamicsSummary): FightSummary => ({
  fights: s.fights, median: s.median, p90: s.p90, stalls: s.stallRate, pvPerRound: s.pvPerRound,
  emptyAttacks: s.emptyAttacks, mix: s.mix, firstRoundKOs: s.roundOneKOs,
});

export function deriveOnTwins(
  level: number, cards: readonly CensusCard[], ladder: Readonly<Record<number, LadderRung>>, p: TwinParams, opts: TwinDeriveOptions,
): PVDerivation {
  const twins = theSet().calibration.mainKits.map(k => vanillaTwin(k, cards, ladder, p));
  const print = `${twins.map(vanillaPrint).join('|')}#${JSON.stringify(p)}`;
  // The level's strongest blow: the biggest dice a twin card held at this level
  // rolls, and the biggest bonus a boost held at this level gives.
  let strongest = new DiceRoll(1, 4), bonus = 0;
  for (const t of twins) for (const a of t.actions) {
    if (a.unlockLevel > level) continue;
    if (a.dice && a.actionType !== 'Defensa' && a.dice.average() > strongest.average()) strongest = a.dice;
    for (const e of a.effects) bonus = Math.max(bonus, Number(e.params?.['bonus'] ?? 0));
  }
  const plainBlowPV = floorFor(strongest, 0, opts.armour);
  const bestBlowPV = floorFor(strongest, bonus, opts.armour);

  return withVanillaSet(twins, () => {
    const measured = new Map<number, DynamicsSummary>();
    const at = (pv: number): DynamicsSummary => {
      let s = measured.get(pv);
      if (!s) {
        s = summarise(kitsDynamics(level, opts.fights, { pv, ...(opts.chip ? { chipDamage: opts.chip } : {}) }, { kits: twins.map(t => t.id), print }));
        measured.set(pv, s);
      }
      return s;
    };
    const ends = (s: DynamicsSummary) => s.median <= MAX_MEDIAN_ROUNDS && s.p90 <= MAX_P90_ROUNDS && s.stallRate < MAX_STALL_RATE;
    const survives = (s: DynamicsSummary) => s.roundOneKOs <= MAX_ROUND_ONE_KOS;
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
    const blowPV = opts.burst === 'plain' ? plainBlowPV : bestBlowPV;
    const floor = Math.max(blowPV, roundOnePV);
    const collides = lengthPV === null ? ['fights do not end in time even at the smallest PV']
      : lengthPV < floor ? [
        ...(lengthPV < blowPV ? [`the best blow needs ≥ ${blowPV}`] : []),
        ...(lengthPV < roundOnePV ? [`the first round needs ≥ ${roundOnePV}`] : []),
        `fights end in time only up to ${lengthPV}`,
      ] : [];
    return {
      level, bestBlowPV, plainBlowPV, roundOnePV, lengthPV,
      pv: lengthPV !== null && lengthPV >= floor ? lengthPV : null, collides,
      measured: [...measured].sort((a, b) => a[0] - b[0]).map(([pv, s]) => ({ pv, summary: asFight(s) })),
    };
  });
}

/** One level in a child process. The ladder travels as notation. */
export async function deriveTwinLevel(
  set: RunContext['set'], level: number, cards: readonly CensusCard[], ladder: Record<number, { attack: string; defense: string }>,
  p: TwinParams, opts: TwinDeriveOptions,
): Promise<PVDerivation> {
  await installSet(set);
  const rungs: Record<number, LadderRung> = Object.fromEntries(Object.entries(ladder).map(([l, r]) => [l, { attack: DiceRoll.parse(r.attack), defense: DiceRoll.parse(r.defense) }]));
  return deriveOnTwins(level, cards, rungs, p, opts);
}
