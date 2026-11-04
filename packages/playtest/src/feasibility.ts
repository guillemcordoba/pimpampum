/**
 * FEASIBILITY — can a set of targets hold at once? Arithmetic, no simulation:
 * the first layer of the tuning process (the user, 2026-11-04: settle the game
 * top down). On 2026-11-03 the 6-round limit turned out to be out of reach at
 * level 3 only after days of tuning cards toward it; this says so in a second.
 *
 * Per level: `teamSize` heroes a side, each holding its level's ladder attack
 * and defense and the same armour; each round every hero attacks, defends or
 * focuses with the given shares, and a defense covers one body. A blow on a
 * covered body does E[(attack − defense − armour)+], an uncovered one
 * E[(attack − armour)+], from the exact dice distributions (ties hold). The
 * rounds to wipe a side are its PV over what it loses a round. Two numbers
 * bracket the game:
 *  - PURE AGGRESSION: nobody defends or focuses. The shortest a fight between
 *    sides of ladder cards can be: a target no faster than this is unreachable
 *    by tuning cards, whatever their numbers;
 *  - THE MIX: the shares the AI really plays (the gate's model check). A
 *    Focus counts as dealing nothing here, so this leans long.
 */
import { DiceRoll, expectedExcess } from '@pimpampum/engine';

export interface LadderRung { attack: DiceRoll; defense: DiceRoll }

export interface FeasibilityInput {
  ladder: Readonly<Record<number, LadderRung>>;
  /** A hero's PV, flat or by level. */
  pv: number | ((level: number) => number);
  armour: number;
  teamSize: number;
  /** Shares of attacks and defenses among the cards played (the rest is Focus). */
  mix: { attack: number; defense: number };
}

export interface FeasibilityRow {
  level: number;
  pv: number;
  /** A ladder blow's mean, and what it takes off on average: uncovered, and
   *  through its level's defense. */
  blow: number; landsBare: number; landsOnGuard: number;
  /** Rounds to wipe a side (its PV over its loss a round). */
  pureRounds: number; mixRounds: number;
  /** The hero PV that would make each of them equal `targetRounds`. */
  pvPure: number; pvMix: number;
}

export function feasibility(input: FeasibilityInput, levels: readonly number[], targetRounds: number): FeasibilityRow[] {
  return levels.map(level => {
    const rung = input.ladder[level];
    const pv = typeof input.pv === 'function' ? input.pv(level) : input.pv;
    const landsBare = expectedExcess(rung.attack, 0, undefined, 0, input.armour);
    const landsOnGuard = expectedExcess(rung.attack, 0, rung.defense, 0, input.armour);
    const side = input.teamSize * pv;
    const purePerRound = input.teamSize * landsBare;
    // A blow finds its target covered as often as a hero defends.
    const covered = input.mix.defense;
    const mixPerRound = input.teamSize * input.mix.attack * (covered * landsOnGuard + (1 - covered) * landsBare);
    return {
      level, pv, blow: rung.attack.average(), landsBare, landsOnGuard,
      pureRounds: side / purePerRound, mixRounds: mixPerRound > 0 ? side / mixPerRound : Infinity,
      pvPure: targetRounds * purePerRound / input.teamSize,
      pvMix: targetRounds * mixPerRound / input.teamSize,
    };
  });
}
