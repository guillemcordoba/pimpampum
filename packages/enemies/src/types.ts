import { SkillDefinition } from '@pimpampum/skills';

/**
 * A creature: a name, an icon, and a kit. That is the whole definition.
 *
 * There is deliberately no PV and no level here. Enemies are composed at the
 * table exactly like players are — the encounter decides how many bodies, at
 * what level, with how much PV — and the balancer SIMULATES the result rather
 * than reading fitted numbers off a stat block. The hand-set `threat`,
 * `levelThreat`, `basePV`, `suggestedLevel` and fielding `role` all went away
 * with the closed-form balancer (2026-08-01).
 *
 * What remains besides the kit is creature IDENTITY, not balance: a goblin
 * carries a shield, a basilisk has scales, a golem fights defensively.
 */
export interface EnemyDefinition {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  /** The creature's kit — its skill definition(s), cards and all. */
  skills: SkillDefinition[];
  /** Gear it carries by default (the goblin's shield). */
  equipment?: string[];
  /** Innate passive armour (scales, stone hide…). Equipped by the factory as
   *  a synthetic Armor item so it flows through the normal armour pipeline. */
  naturalArmor?: number;
  /**
   * How much flesh this creature is, RELATIVE to the others. Default 1.
   *
   * Still no printed PV: the solver searches one global scale and each body
   * gets `scale × bulk`, so difficulty stays an input and PV stays solved.
   * What this fixes is that a goblin and a basilisk in the same encounter used
   * to come out equally durable — the solver had a single lever and no reason
   * to spend it unevenly.
   *
   * It is IDENTITY, not balance: a single-species encounter solves to exactly
   * the same PV whatever its bulk (the scale just moves the other way), so
   * this number can never make a creature secretly harder or easier. It only
   * decides how the PV is SHARED OUT in a mixed fight.
   *
   * ### How to pick one: `bulk = ∛(kg / 70)`
   *
   * Look the creature's canonical WEIGHT up in the fantasies it comes from and
   * divide by a 70 kg human — the players are the reference body, so bulk 1 is
   * a person. The CUBE ROOT is the point: mass runs 82× from a spinagon (11 kg)
   * to a stone golem (907 kg), and PV spread that wide would turn every mixed
   * encounter into one boss surrounded by confetti. A linear dimension instead
   * of a mass compresses it to ~4.4×, which is a range this game's dice and its
   * small flat armour can actually express.
   *
   * Pick the fantasy the CARDS are already written in, not the first stat
   * block you find: the basilisk's kit sweeps three people with its tail, so it
   * is Rowling's 15 m serpent (~3.2 t) rather than D&D's 300 lb lizard, and
   * that is a 3× difference in bulk.
   *
   * The current set (with the sources on each definition): spinagon 0.54,
   * goblin shaman 0.64, goblin 0.66, wolf 0.86, bone devil 1.48, horned devil
   * 1.62, stone golem 2.35, basilisk 3.57.
   */
  bulk?: number;
  /** How a GM plays this creature: biases the AI's action mix toward the kit's
   *  identity (Power for casters, Protect for walls). Defaults to Aggro. */
}

/** Every action the kit knows — the level at which a creature has its full kit. */
export function fullKitLevel(def: EnemyDefinition): number {
  return Math.max(1, ...def.skills.map(s => s.actions.length));
}

/** Icon path prefix shared by every creature (game-icons.net, CC BY 3.0). */
export const ICON = 'icons/000000/transparent/1x1/';
