import { SkillDefinition } from '@pimpampum/skills';

/**
 * An enemy template. It declares which skills the enemy fights with; the DM /
 * web UI / simulator chooses the levels at runtime (defaulting to suggestedLevel).
 */
export interface EnemyTemplate {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  basePV: number;
  /** Skill ids defined by this enemy's module. */
  skills: string[];
  /** Default skill level when none is supplied. */
  suggestedLevel: number;
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
