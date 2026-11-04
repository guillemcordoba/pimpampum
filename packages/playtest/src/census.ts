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

export type Role = 'attack' | 'area' | 'rider' | 'guard' | 'payoff' | 'blast' | 'crack' | 'heal' | 'hex' | 'boost' | 'shield';

export interface CensusCard {
  kit: string; id: string; name: string; unlock: number;
  type: ActionType; fast: boolean; fatigue: number;
  /** The real card's dice, as notation (none: the card rolls nothing). */
  dice?: string;
  /** It adds the wielded weapon (`weapon_damage`). */
  weapon: boolean;
  role: Role;
  /** Per resolved play, over every level it was measured at. */
  plays: number; foeLoss: number; allyGain: number; foeEffects: number; allyEffects: number;
  /** Per play: the share of its damage that landed on enemies that defended
   *  that round; the PV its statuses took at round ends later. */
  onDefenders: number; lingering: number;
  /** Per play: the attack-roll and defense bonuses it gave its side. */
  attackBonus: number; defenseBonus: number;
}

/** The thresholds a card's per-play behaviour is sorted by. */
const DEALS = 2;        // PV off the enemies a play: a damaging Focus
const HEALS = 2;        // PV back to the allies a play: a heal
const MARKS = 0.25;     // effects left on the enemies a play: a rider, a hex
const CRACKS = 0.8;     // share of a damaging card's damage on defenders: it pays off against a guard
const LINGERS = 1;      // PV its statuses take later, a play: it burns or bleeds

const fatigueOf = (a: ActionDefinition): number =>
  a.effects.filter(e => e.type === 'fatigue_cost').reduce((t, e) => t + Number(e.params?.['levels'] ?? 0), 0);
const hasEffects = (a: ActionDefinition): boolean => a.effects.some(e => e.type !== 'fatigue_cost' && e.type !== 'weapon_damage');

function roleOf(a: ActionDefinition, per: { plays: number; foeLoss: number; allyGain: number; foeEffects: number; onDefenders: number; lingering: number; offense: number; protection: number }): Role {
  if (a.actionType === ActionType.Atac) {
    if ((a.targetCount ?? 1) > 1) return 'area';
    return per.plays ? (per.foeEffects >= MARKS ? 'rider' : 'attack') : (hasEffects(a) ? 'rider' : 'attack');
  }
  if (a.actionType === ActionType.Defensa) return hasEffects(a) ? 'payoff' : 'guard';
  // A Focus never seen resolve falls back on its definition.
  if (!per.plays) return a.dice ? 'blast' : 'boost';
  if (per.foeLoss >= DEALS / 2 && per.onDefenders >= CRACKS) return 'crack';
  if (per.foeLoss >= DEALS) return 'blast';
  if (per.allyGain >= HEALS) return 'heal';
  if (per.foeEffects >= MARKS || per.lingering >= LINGERS) return 'hex';
  // A Focus that only works on its own side: shielding it or strengthening it.
  return per.protection > per.offense ? 'shield' : 'boost';
}

/** Every main-kit card with its role, from the tallies of one or more
 *  dynamics runs (several levels, so each card has been played). */
export function census(tallies: readonly Record<string, CardTally>[]): CensusCard[] {
  const out: CensusCard[] = [];
  for (const kit of theSet().calibration.mainKits) {
    for (const a of theSet().kit(kit)?.actions ?? []) {
      if (a.skillId !== kit) continue;
      const sum = { plays: 0, foeLoss: 0, onDefenders: 0, allyGain: 0, foeEffects: 0, allyEffects: 0, lingering: 0, offense: 0, protection: 0, attackBonus: 0, defenseBonus: 0 };
      for (const t of tallies) {
        const c = t[a.id];
        if (!c) continue;
        sum.plays += c.plays; sum.foeLoss += c.foeLoss; sum.onDefenders += c.onDefenders; sum.allyGain += c.allyGain;
        sum.foeEffects += c.foeEffects; sum.allyEffects += c.allyEffects; sum.lingering += c.lingering;
        sum.offense += c.offense; sum.protection += c.protection; sum.attackBonus += c.attackBonus; sum.defenseBonus += c.defenseBonus;
      }
      const n = Math.max(1, sum.plays);
      const per = {
        plays: sum.plays, foeLoss: sum.foeLoss / n, allyGain: sum.allyGain / n, foeEffects: sum.foeEffects / n, allyEffects: sum.allyEffects / n,
        onDefenders: sum.foeLoss ? sum.onDefenders / sum.foeLoss : 0, lingering: sum.lingering / n,
        offense: sum.offense / n, protection: sum.protection / n, attackBonus: sum.attackBonus / n, defenseBonus: sum.defenseBonus / n,
      };
      out.push({
        kit, id: a.id, name: a.name, unlock: a.unlockLevel, type: a.actionType, fast: !!a.fast, fatigue: fatigueOf(a),
        ...(a.dice ? { dice: a.dice.toString() } : {}), weapon: a.effects.some(e => e.type === 'weapon_damage'),
        role: roleOf(a, per), ...per,
      });
    }
  }
  return out;
}
