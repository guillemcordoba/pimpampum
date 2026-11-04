/**
 * CANDIDATE FIXES, MEASURED — for the dynamics report (the user, 2026-11-04:
 * the machinery recommends fixes that meet all our constraints). A fix is a
 * structure: how strong a Focus is, how far below the ladder defenses sit, how
 * much of a held blow lands, and which blow a fresh hero must survive. Each is
 * measured twice, in its own process:
 *  - on VANILLA kits: hero PV derived per checkpoint (`derivePV`): the window,
 *    and the PV;
 *  - on the REAL kits, as far as it can be applied mechanically — the chip
 *    damage, every Defense card's dice shifted down the rungs, the derived PV —
 *    in the measurement only (nothing is written to a card): how fights then
 *    play (bench `kitsDynamics`), the triangle and the turtle.
 * A stronger Focus cannot be applied to real cards mechanically (their power
 * is in their effects, not their dice): the report says so instead of guessing.
 */
import { ActionType, DiceRoll } from '@pimpampum/engine';
import { kitsDynamics, styleDuel, theSet, type DuelStyle, type Variant } from '@pimpampum/bench';
import { derivePV, type PVDerivation } from './derive-pv.js';
import { summarise, type DynamicsSummary } from './dynamics.js';
import { installSet, type RunContext } from './prepare.js';
import { edgeHolds } from './rules.js';
import { diceStep } from './tune.js';

export interface Fix {
  id: string;
  /** In plain words, for the report. */
  label: string;
  /** Vanilla Focus: your next attack adds the ladder dice × this (1: a doubled blow). */
  aim: number;
  defenseShift: number;
  chip: number;
  burst: 'aimed' | 'plain';
}

export const TODAY: Fix = { id: 'today', label: 'Today: the ladder as it is, survive the aimed blow', aim: 1, defenseShift: 0, chip: 0, burst: 'aimed' };

export const CANDIDATE_FIXES: readonly Fix[] = [
  TODAY,
  { id: 'plain', label: 'Survive the plain blow (only the burst rule changes)', aim: 1, defenseShift: 0, chip: 0, burst: 'plain' },
  { id: 'focus4', label: 'Focus worth a 4× blow', aim: 3, defenseShift: 0, chip: 0, burst: 'plain' },
  { id: 'chip50', label: 'Half of a held blow lands (chip 50%)', aim: 1, defenseShift: 0, chip: 0.5, burst: 'plain' },
  { id: 'focus3-chip50', label: 'Focus 3× + chip 50%', aim: 2, defenseShift: 0, chip: 0.5, burst: 'plain' },
  { id: 'focus4-chip50', label: 'Focus 4× + chip 50%', aim: 3, defenseShift: 0, chip: 0.5, burst: 'plain' },
  { id: 'focus4-chip25-def1', label: 'Focus 4× + chip 25% + defenses a rung lower', aim: 3, defenseShift: -1, chip: 0.25, burst: 'plain' },
  { id: 'focus4-def3', label: 'Focus 4× + defenses three rungs lower', aim: 3, defenseShift: -3, chip: 0, burst: 'plain' },
  { id: 'def2', label: 'Defenses two rungs lower (nothing else)', aim: 1, defenseShift: -2, chip: 0, burst: 'plain' },
];

export interface FixBudget { vanillaFights: number; realFights: number; duelGames: number }
export const FIX_BUDGET: FixBudget = { vanillaFights: 120, realFights: 120, duelGames: 100 };

export interface FixLevel {
  level: number;
  vanilla: PVDerivation;
  /** The PV the real kits were measured at: the derived one, or — with no
   *  window — the most that keeps vanilla fights in time. */
  pv: number;
  real: DynamicsSummary;
  triangle: { edge: string; winrate: number; holds: boolean }[];
  turtle: { score: number; loses: boolean };
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
  levels: readonly number[], budget: FixBudget = FIX_BUDGET,
): Promise<FixResult> {
  await installSet(set);
  shiftDefenses(fix.defenseShift);
  const out: FixLevel[] = [];
  for (const level of levels) {
    const defense = ladder[Math.max(1, Math.min(10, level + fix.defenseShift))].defense;
    const vanilla = derivePV(level, { attack: DiceRoll.parse(ladder[level].attack), defense: DiceRoll.parse(defense) },
      { aim: fix.aim, armour: 1, fights: budget.vanillaFights, chip: fix.chip, burst: fix.burst });
    const pv = vanilla.pv ?? vanilla.lengthPV ?? Math.max(vanilla.roundOnePV, fix.burst === 'plain' ? vanilla.plainBlowPV : vanilla.bestBlowPV);
    const variant: Variant = { pv, ...(fix.chip ? { chipDamage: fix.chip } : {}) };
    const real = summarise(kitsDynamics(level, budget.realFights, variant));
    const triangle = EDGES.map(([x, y]) => {
      const d = styleDuel(x, y, level, budget.duelGames, undefined, variant);
      return { edge: `${x} > ${y}`, winrate: d.score, holds: edgeHolds(d.score, d.games) };
    });
    const t = styleDuel('turtle', 'ai', level, budget.duelGames, undefined, variant);
    out.push({ level, vanilla, pv, real, triangle, turtle: { score: t.score, loses: edgeHolds(1 - t.score, t.games) } });
  }
  return { fix, levels: out, focusOnRealKits: fix.aim === 1 };
}

/** What the report ranks a fix on. */
export interface FixScore {
  /** Checkpoints where vanilla has a PV window / the real kits' fights end /
   *  the triangle holds / the turtle loses. */
  windows: number; realEnds: number; triangle: number; turtle: number;
  /** The narrowest PV window (0 when one is empty). */
  robustness: number;
  /** Against the user's principles: softer defenses (turtles are to be beaten by
   *  Focus, not by weaker guards), a new rule, Focus cards to rebuild. */
  costs: string[];
}

export function scoreFix(r: FixResult): FixScore {
  const width = (l: FixLevel) => {
    const floor = Math.max(l.vanilla.roundOnePV, r.fix.burst === 'plain' ? l.vanilla.plainBlowPV : l.vanilla.bestBlowPV);
    return l.vanilla.lengthPV === null ? 0 : Math.max(0, l.vanilla.lengthPV - floor + 1);
  };
  return {
    windows: r.levels.filter(l => l.vanilla.pv !== null).length,
    realEnds: r.levels.filter(l => l.real.ends).length,
    triangle: r.levels.filter(l => l.triangle.every(e => e.holds)).length,
    turtle: r.levels.filter(l => l.turtle.loses).length,
    robustness: Math.min(...r.levels.map(width)),
    costs: [
      ...(r.fix.defenseShift ? [`defenses ${-r.fix.defenseShift} rung${r.fix.defenseShift === -1 ? '' : 's'} lower (against "turtles are beaten by Focus, not by softer defense")`] : []),
      ...(r.fix.chip ? [`a new rule: ${Math.round(100 * r.fix.chip)}% of a held blow lands`] : []),
      ...(r.fix.aim > 1 ? [`every Focus card rebuilt to about a ${r.fix.aim + 1}× blow`] : []),
      ...(r.fix.burst === 'plain' ? ['the burst rule reads "survive the plain blow"'] : []),
    ],
  };
}

/** Best first: most constraints met, then fewest costs, then the widest windows. */
export function rankFixes(results: FixResult[]): { result: FixResult; score: FixScore }[] {
  const met = (s: FixScore) => s.windows + s.realEnds + s.triangle + s.turtle;
  return results.map(result => ({ result, score: scoreFix(result) }))
    .sort((a, b) => met(b.score) - met(a.score) || a.score.costs.length - b.score.costs.length || b.score.robustness - a.score.robustness);
}
