import { ActionDefinition, ActionType, ActionEffect, DiceRoll } from '@pimpampum/engine';

export const ICON_PREFIX = 'icons/000000/transparent/1x1/';

/** A skill groups a set of actions unlocked at increasing levels. */
export interface SkillDefinition {
  id: string;
  displayName: string;
  /** Short Catalan description of the skill. */
  description: string;
  iconPath: string;
  /** CSS theme class for cards/portraits. */
  classCss: string;
  /** Whether this skill is typical for players or enemies (UI filtering only). */
  category: 'player' | 'enemy';
  actions: ActionDefinition[];
}

interface ActionOpts {
  id: string;
  name: string;
  skillId: string;
  unlock: number;
  type: ActionType;
  speed: number;
  damage?: DiceRoll;
  rollBonus?: number;
  targetCount?: number;
  effects?: ActionEffect[];
  desc: string;
  /** Icon path tail after ICON_PREFIX, e.g. "lorc/broadsword.svg". */
  icon: string;
  consumable?: boolean;
}

/** Build an ActionDefinition with sensible defaults. */
export function action(o: ActionOpts): ActionDefinition {
  const effects = o.effects ?? [];
  // Healing / cleansing support actions may target downed allies.
  const canReviveTarget = effects.some(e => e.type === 'heal' || e.type === 'cleanse');
  return {
    id: o.id,
    name: o.name,
    skillId: o.skillId,
    unlockLevel: o.unlock,
    actionType: o.type,
    speed: o.speed,
    damageDice: o.damage,
    rollBonus: o.rollBonus,
    targetCount: o.targetCount,
    effects,
    description: o.desc,
    iconPath: ICON_PREFIX + o.icon,
    isConsumable: o.consumable,
    canReviveTarget,
  };
}

/** Convenience for a damage DiceRoll. */
export function d(numDice: number, sides: number, modifier = 0): DiceRoll {
  return new DiceRoll(numDice, sides, modifier);
}
