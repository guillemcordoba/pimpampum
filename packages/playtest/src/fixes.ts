/**
 * CANDIDATE FIXES, MEASURED — for the dynamics report (the user, 2026-11-04:
 * the machinery recommends fixes that meet all our constraints). A fix is a
 * structure: how strong a Focus is, how far below the ladder defenses sit, how
 * much of a held blow lands, and which blow a fresh hero must survive. Each is
 * measured twice, in its own process:
 *  - on the VANILLA SET — the main kits' calibrated twins, which play like
 *    today's game (`vanilla.ts`): hero PV derived per checkpoint
 *    (`deriveOnTwins`), the window and the PV;
 *  - on the REAL kits, as far as it can be applied mechanically — the chip
 *    damage, every Defense card's dice shifted down the rungs, the derived PV —
 *    in the measurement only (nothing is written to a card): how fights then
 *    play (bench `kitsDynamics`), the triangle and dumb play.
 * A stronger Focus cannot be applied to real cards mechanically (their power
 * is in their effects, not their dice): the report says so instead of guessing.
 */
import { ActionType, DiceRoll } from '@pimpampum/engine';
import { DUMB_STYLES, kitsDynamics, styleDuel, theSet, type DuelStyle, type DumbStyle, type Variant } from '@pimpampum/bench';
import { MAX_FAST_KOS, MAX_ROUND_ONE_KOS, type PVDerivation } from './derive-pv.js';
import { deriveOnTwins } from './derive-twins.js';
import type { CensusCard } from './census.js';
import { TWIN_DEFAULTS } from './vanilla.js';
import { summarise, type DynamicsSummary } from './dynamics.js';
import { installSet, type RunContext } from './prepare.js';
import { edgeHolds } from './rules.js';
import { diceStep } from './tune.js';

export interface Fix {
  id: string;
  /** In plain words, for the report. */
  label: string;
  /** How strong a Focus is: the vanilla twins' Focus power × (aim + 1) / 2,
   *  so 1 is today's and 3 doubles it (a "4× blow" in the old vanilla's terms). */
  aim: number;
  defenseShift: number;
  chip: number;
  /** The floor a hero's PV keeps: interactivity (`fast`: no fast attack fells a
   *  fresh hero) or the older readings, the twins' strongest blow aimed or plain. */
  burst: 'aimed' | 'plain' | 'fast';
  /** False: a defense rolls once however many blows pile on (`CombatEngineOptions.envoltat`). */
  envoltat?: boolean;
  /** True: a defense guarding an ally also covers its player, the rule before 2026-11-02. */
  guardCoversDefender?: boolean;
}

export const TODAY: Fix = { id: 'today', label: 'Today: the structure as it is', aim: 1, defenseShift: 0, chip: 0, burst: 'fast' };

export const CANDIDATE_FIXES: readonly Fix[] = [
  TODAY,
  { id: 'focus4', label: 'Every Focus twice as strong', aim: 3, defenseShift: 0, chip: 0, burst: 'fast' },
  { id: 'chip50', label: 'Half of a held blow lands (chip 50%)', aim: 1, defenseShift: 0, chip: 0.5, burst: 'fast' },
  { id: 'focus3-chip50', label: 'Focus 1.5× as strong + chip 50%', aim: 2, defenseShift: 0, chip: 0.5, burst: 'fast' },
  { id: 'focus4-chip50', label: 'Focus twice as strong + chip 50%', aim: 3, defenseShift: 0, chip: 0.5, burst: 'fast' },
  { id: 'focus4-chip25-def1', label: 'Focus twice as strong + chip 25% + defenses a rung lower', aim: 3, defenseShift: -1, chip: 0.25, burst: 'fast' },
  { id: 'focus4-def3', label: 'Focus twice as strong + defenses three rungs lower', aim: 3, defenseShift: -3, chip: 0, burst: 'fast' },
  { id: 'def2', label: 'Defenses two rungs lower (nothing else)', aim: 1, defenseShift: -2, chip: 0, burst: 'fast' },
];

const blowFloor = (v: PVDerivation, burst: Fix['burst']) => (burst === 'fast' ? v.fastBlowPV ?? 1 : burst === 'plain' ? v.plainBlowPV : v.bestBlowPV);

export interface FixBudget { vanillaFights: number; realFights: number; duelGames: number }
export const FIX_BUDGET: FixBudget = { vanillaFights: 60, realFights: 120, duelGames: 100 };

export interface FixLevel {
  level: number;
  vanilla: PVDerivation;
  /** The PV the real kits were measured at: the derived one, or — with no
   *  window — the most that keeps vanilla fights in time. */
  pv: number;
  real: DynamicsSummary;
  triangle: { edge: string; winrate: number; holds: boolean }[];
  dumb: { style: DumbStyle; score: number; loses: boolean }[];
}

export interface FixResult { fix: Fix; levels: FixLevel[]; focusOnRealKits: boolean }

const EDGES: readonly [DuelStyle, DuelStyle][] = [['Power', 'Protect'], ['Protect', 'Aggro'], ['Aggro', 'Power']];

/** Every Defense card of the main kits, its dice `shift` rungs along (in this process). */
function shiftDefenses(shift: number): void {
  if (!shift) return;
  for (const k of theSet().calibration.mainKits) for (const a of theSet().kit(k)?.actions ?? []) {
    if (a.actionType !== ActionType.Defensa || !a.dice) continue;
    let d: DiceRoll | null = a.dice;
    for (let i = 0; i < Math.abs(shift) && d; i++) d = diceStep(d, shift > 0 ? 1 : -1) ?? d;
    (a as { dice?: DiceRoll }).dice = d ?? a.dice;
  }
}

/** One fix at the checkpoints, in a child process (bench `isolated`). The
 *  ladder's dice travel as notation, by level. */
export async function evaluateFix(
  set: RunContext['set'], fix: Fix, ladder: Record<number, { attack: string; defense: string }>,
  levels: readonly number[], budget: FixBudget, cards: readonly CensusCard[],
): Promise<FixResult> {
  await installSet(set);
  shiftDefenses(fix.defenseShift);
  // The twins' ladder, defenses shifted as the fix says.
  const twinLadder = Object.fromEntries(Object.keys(ladder).map(Number).map(l => [l, {
    attack: DiceRoll.parse(ladder[l].attack), defense: DiceRoll.parse(ladder[Math.max(1, Math.min(10, l + fix.defenseShift))].defense),
  }]));
  const params = { ...TWIN_DEFAULTS, focusScale: (fix.aim + 1) / 2 };
  const out: FixLevel[] = [];
  for (const level of levels) {
    const vanilla = deriveOnTwins(level, cards, twinLadder, params, {
      fights: budget.vanillaFights, armour: 1, chip: fix.chip, burst: fix.burst, envoltat: fix.envoltat, guardCoversDefender: fix.guardCoversDefender,
    });
    const pv = vanilla.pv ?? vanilla.lengthPV ?? Math.max(vanilla.roundOnePV, blowFloor(vanilla, fix.burst));
    const variant: Variant = {
      pv, ...(fix.chip ? { chipDamage: fix.chip } : {}), ...(fix.envoltat === false ? { envoltat: false } : {}), ...(fix.guardCoversDefender ? { guardCoversDefender: true } : {}),
    };
    const real = summarise(kitsDynamics(level, budget.realFights, variant));
    const triangle = EDGES.map(([x, y]) => {
      const d = styleDuel(x, y, level, budget.duelGames, undefined, variant);
      return { edge: `${x} > ${y}`, winrate: d.score, holds: edgeHolds(d.score, d.games) };
    });
    const dumb = DUMB_STYLES.map(style => {
      const d = styleDuel(style, 'ai', level, budget.duelGames, undefined, variant);
      return { style, score: d.score, loses: edgeHolds(1 - d.score, d.games) };
    });
    out.push({ level, vanilla, pv, real, triangle, dumb });
  }
  return { fix, levels: out, focusOnRealKits: fix.aim === 1 };
}

/** What the report ranks a fix on. */
export interface FixScore {
  /** Checkpoints where vanilla has a PV window / the real kits' fights end /
   *  the triangle holds / every dumb strategy loses. */
  windows: number; realEnds: number; triangle: number; dumb: number;
  /** Checkpoints where the real kits keep burst in bounds: round-1 KOs and
   *  heroes felled from full by one card, each at most a tenth. */
  realBurst: number;
  /** The narrowest PV window (0 when one is empty). */
  robustness: number;
  /** Where it goes against "without focus or buffs, defenses should on average
   *  completely block an attack" (the user, 2026-11-02): lower defenses, chip
   *  damage. Shown, and counted as a cost; not a veto (the user, 2026-11-05). */
  conflicts: string[];
  /** Everything else it asks for: Focus cards to rebuild, a rule changed. */
  costs: string[];
}

export function scoreFix(r: FixResult): FixScore {
  const width = (l: FixLevel) => {
    const floor = Math.max(l.vanilla.roundOnePV, blowFloor(l.vanilla, r.fix.burst));
    return l.vanilla.lengthPV === null ? 0 : Math.max(0, l.vanilla.lengthPV - floor + 1);
  };
  return {
    windows: r.levels.filter(l => l.vanilla.pv !== null).length,
    realEnds: r.levels.filter(l => l.real.ends).length,
    triangle: r.levels.filter(l => l.triangle.every(e => e.holds)).length,
    dumb: r.levels.filter(l => l.dumb.every(d => d.loses)).length,
    realBurst: r.levels.filter(l => burstHolds(l.real)).length,
    robustness: Math.min(...r.levels.map(width)),
    conflicts: [
      ...(r.fix.defenseShift ? [`defenses ${-r.fix.defenseShift} rung${r.fix.defenseShift === -1 ? '' : 's'} lower: an unbuffed attack is no longer blocked completely`] : []),
      ...(r.fix.chip ? [`${Math.round(100 * r.fix.chip)}% of a held blow lands: a guard no longer blocks completely`] : []),
    ],
    costs: [
      ...(r.fix.envoltat === false ? ['Envoltat off: blows piled on one body no longer wear its guard down'] : []),
      ...(r.fix.guardCoversDefender ? ['a defense that guards an ally covers its player too (the rule before 2026-11-02)'] : []),
      ...(r.fix.aim > 1 ? [`every Focus card rebuilt about ${(r.fix.aim + 1) / 2}× as strong`] : []),
    ],
  };
}

/** The real kits' burst within the floors: round-1 falls, and no fast attack felling fresh heroes. */
export function burstHolds(s: DynamicsSummary): boolean {
  return s.roundOneKOs <= MAX_ROUND_ONE_KOS && s.fastKOs <= MAX_FAST_KOS;
}

/** Constraint checks a fix passes, of five per checkpoint. */
export const checksMet = (s: FixScore): number => s.windows + s.realEnds + s.realBurst + s.triangle + s.dumb;

/** Best first: most constraints met, then fewest costs (conflicts included),
 *  then the widest windows. */
export function rankFixes(results: FixResult[]): { result: FixResult; score: FixScore }[] {
  const met = checksMet;
  const costs = (s: FixScore) => s.conflicts.length + s.costs.length;
  return results.map(result => ({ result, score: scoreFix(result) }))
    .sort((a, b) => met(b.score) - met(a.score) || costs(a.score) - costs(b.score) || b.score.robustness - a.score.robustness);
}
