import { AIStrategy } from '@pimpampum/engine';
import { SkillDefinition } from '@pimpampum/skills';

/**
 * An enemy template. It declares which skills the enemy fights with; the DM /
 * web UI / simulator chooses the levels at runtime (defaulting to suggestedLevel).
 */
/** How a creature is meant to be fielded — bounds body count in generated encounters. */
export type EnemyRole = 'horda' | 'elit' | 'solitari';

export interface EnemyTemplate {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  /** Fielding role: horda swarms, elit squads, solitari bosses. PV comes from
   *  the level via `pvForLevel`, never from the template. */
  role: EnemyRole;
  /** Enemy difficulty: threat per PV point relative to a goblin (1.0),
   *  MEASURED by simulation (PV50 sweeps, 2026-07) — not designed. Re-measure
   *  after kit changes. */
  difficulty: number;
  /** Skill ids defined by this enemy's module. */
  skills: string[];
  /** Default skill level when none is supplied. */
  suggestedLevel: number;
  /** Innate passive armour (scales, stone hide…). Equipped by the factory as
   *  a synthetic Torso item so it flows through the normal armour pipeline. */
  naturalArmor?: number;
  /** How a GM plays this creature: biases the AI's action mix toward the
   *  kit's identity (Power for casters, Protect for walls). Defaults to Aggro.
   *  Calibration runs with this, so it must match intended table play. */
  aiStrategy?: AIStrategy;
}

/**
 * A single enemy: its template plus the skill definition(s) it fights with.
 * Each enemy lives in its own file under `bestiary/` and exports one of these.
 */
export interface EnemyModule {
  template: EnemyTemplate;
  skills: SkillDefinition[];
}

export const ICON = 'icons/000000/transparent/1x1/';
