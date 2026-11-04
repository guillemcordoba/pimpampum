/**
 * THE CENSUS — what each real card DOES when it is played, read from the
 * fights (bench `kitsDynamics`' per-card tallies), not from its text: its ROLE,
 * which is what the vanilla twins copy (`vanilla.ts`). A card's definition says
 * little — a Focus with dice may heal, one without may bleed its target — so
 * the role comes from the PV it moved and the effects it left.
 */
import type { CardTally } from '@pimpampum/bench';
import { theSet } from '@pimpampum/bench';
import { ActionType, type ActionDefinition } from '@pimpampum/engine';

export type Role = 'attack' | 'area' | 'rider' | 'guard' | 'payoff' | 'blast' | 'heal' | 'hex' | 'boost';

export interface CensusCard {
  kit: string; id: string; name: string; unlock: number;
  type: ActionType; fast: boolean; fatigue: number;
  role: Role;
  /** Per resolved play, over every level it was measured at. */
  plays: number; foeLoss: number; allyGain: number; foeEffects: number; allyEffects: number;
}

/** The thresholds a card's per-play behaviour is sorted by. */
const DEALS = 2;        // PV off the enemies a play: a damaging Focus
const HEALS = 2;        // PV back to the allies a play: a heal
const MARKS = 0.25;     // effects left on the enemies a play: a rider, a hex

const fatigueOf = (a: ActionDefinition): number =>
  a.effects.filter(e => e.type === 'fatigue_cost').reduce((t, e) => t + Number(e.params?.['levels'] ?? 0), 0);
const hasEffects = (a: ActionDefinition): boolean => a.effects.some(e => e.type !== 'fatigue_cost' && e.type !== 'weapon_damage');

function roleOf(a: ActionDefinition, per: { plays: number; foeLoss: number; allyGain: number; foeEffects: number }): Role {
  if (a.actionType === ActionType.Atac) {
    if ((a.targetCount ?? 1) > 1) return 'area';
    return per.plays ? (per.foeEffects >= MARKS ? 'rider' : 'attack') : (hasEffects(a) ? 'rider' : 'attack');
  }
  if (a.actionType === ActionType.Defensa) return hasEffects(a) ? 'payoff' : 'guard';
  // A Focus never seen resolve falls back on its definition.
  if (!per.plays) return a.dice ? 'blast' : 'boost';
  if (per.foeLoss >= DEALS) return 'blast';
  if (per.allyGain >= HEALS) return 'heal';
  if (per.foeEffects >= MARKS) return 'hex';
  return 'boost';
}

/** Every main-kit card with its role, from the tallies of one or more
 *  dynamics runs (several levels, so each card has been played). */
export function census(tallies: readonly Record<string, CardTally>[]): CensusCard[] {
  const out: CensusCard[] = [];
  for (const kit of theSet().calibration.mainKits) {
    for (const a of theSet().kit(kit)?.actions ?? []) {
      if (a.skillId !== kit) continue;
      const sum = { plays: 0, foeLoss: 0, allyGain: 0, foeEffects: 0, allyEffects: 0 };
      for (const t of tallies) {
        const c = t[a.id];
        if (!c) continue;
        sum.plays += c.plays; sum.foeLoss += c.foeLoss; sum.allyGain += c.allyGain; sum.foeEffects += c.foeEffects; sum.allyEffects += c.allyEffects;
      }
      const n = Math.max(1, sum.plays);
      const per = { plays: sum.plays, foeLoss: sum.foeLoss / n, allyGain: sum.allyGain / n, foeEffects: sum.foeEffects / n, allyEffects: sum.allyEffects / n };
      out.push({
        kit, id: a.id, name: a.name, unlock: a.unlockLevel, type: a.actionType, fast: !!a.fast, fatigue: fatigueOf(a),
        role: roleOf(a, per), ...per,
      });
    }
  }
  return out;
}
