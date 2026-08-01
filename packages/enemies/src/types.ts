import { AIStrategy } from '@pimpampum/engine';
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
  /** How a GM plays this creature: biases the AI's action mix toward the kit's
   *  identity (Power for casters, Protect for walls). Defaults to Aggro. */
  aiStrategy?: AIStrategy;
}

/** Every action the kit knows — the level at which a creature has its full kit. */
export function fullKitLevel(def: EnemyDefinition): number {
  return Math.max(1, ...def.skills.map(s => s.actions.length));
}

/** Icon path prefix shared by every creature (game-icons.net, CC BY 3.0). */
export const ICON = 'icons/000000/transparent/1x1/';
