import { DiceRoll } from './dice.js';

/** The three kinds of action a character can play in a round. */
export enum ActionType {
  Atac = 'Atac',
  Defensa = 'Defensa',
  Focus = 'Focus',
}

export function isAttack(t: ActionType): boolean {
  return t === ActionType.Atac;
}
export function isDefenseAction(t: ActionType): boolean {
  return t === ActionType.Defensa;
}
export function isFocusAction(t: ActionType): boolean {
  return t === ActionType.Focus;
}

/** Equipment slots — one item per slot. Deliberately minimal: a character
 *  carries at most one armour, one weapon and one shield. No body-part
 *  inventory, no main-hand/off-hand/two-handed bookkeeping. */
export enum EquipmentSlot {
  Armor = 'Armor',
  Weapon = 'Weapon',
  Shield = 'Shield',
}

/**
 * What kind of target the player must pick for an action. `'defense'` is the
 * defense-action dual choice: one living ally (including self) to guard, OR
 * one living enemy to block.
 */
export type TargetRequirement = 'none' | 'enemy' | 'ally' | 'ally_other' | 'self' | 'defense';

/** A skill the character knows and its current level — the number of actions
 *  of the skill the character knows (level N = the first N actions). */
export interface SkillInstance {
  skillId: string;
  level: number;
}

/** A single effect attached to an action. `type` is a registry key; the handler
 *  is registered by the content package. `params` carries effect-specific data. */
export interface ActionEffect {
  type: string;
  params?: Record<string, unknown>;
}

/**
 * Definition of an action: a capability unlocked by a skill at a given level.
 * Pure data — behaviour lives in registered effect handlers.
 */
export interface ActionDefinition {
  id: string;
  name: string;
  /** Skill this action belongs to. */
  skillId: string;
  /** Ordinal position within the skill: the level at which this action is
   *  learnt (level N = knows the first N actions). */
  unlockLevel: number;
  actionType: ActionType;
  /** Higher resolves first. Heavy-armour speed penalty is subtracted at runtime. */
  speed: number;
  /**
   * Contest dice: attack dice (Atac) or defense dice (Defensa). Rolled when
   * the action contests — the attack total IS the damage margin. Focus actions
   * usually carry none (effects may still read them, e.g. heal amounts).
   */
  dice?: DiceRoll;
  /** Flat bonus added to this action's dice roll. */
  rollBonus?: number;
  /** How many targets are selected (multi-attack / multi-defend). Defaults to 1. */
  targetCount?: number;
  /** Multi-target attacks roll ONE shared roll per pass by default; set this
   *  to roll fresh attack dice against each target instead. */
  rollPerTarget?: boolean;
  effects: ActionEffect[];
  description: string;
  iconPath: string;
  /** Consumable actions are removed after a single use (e.g. potions). */
  isConsumable?: boolean;
  /** Healing/support actions may target (and revive) downed allies. */
  canReviveTarget?: boolean;
  /**
   * Fatigue added to the actor when this action is played (in or out of
   * combat). Defaults to 1; heavy "esgotadora" cards declare more. An action
   * is unplayable if it would push the actor past the daily maximum
   * (FATIGUE_CONFIG.max).
   */
  fatigueCost?: number;
  /**
   * A desperation fallback: only playable when NO other (non-last-resort)
   * action is playable — e.g. once the fatigue budget is spent.
   */
  lastResort?: boolean;
}

/** Equipment bonus added to the wearer's contest rolls. */
export interface RollBonus {
  /** Applies to rolls of this skill; '*' applies to every skill. */
  skillId: string;
  /** Restrict to attack or defense rolls; omit to apply to any roll. */
  kind?: 'attack' | 'defense';
  value: number;
}

/** Passive equipment definition: flat armour, speed penalty and roll bonuses. */
export interface EquipmentDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
  /** Flat damage reduction subtracted from each incoming hit (min 0 damage). */
  passiveArmor: number;
  /** Subtracted from the speed of every action the wearer plays (>= 0). */
  speedPenalty: number;
  rollBonuses: RollBonus[];
  /**
   * Weapon attack modifier, added to the roll of actions whose effects read
   * the wielded weapon (`weapon_damage`). Present (even 0) = the item counts
   * as a weapon. Generic: any weapon-using skill's effects may read it.
   */
  attackBonus?: number;
  /**
   * Action cards the item puts in the wearer's hand while equipped (a shield's
   * raise-shield defense…). Use `unlockLevel: 0` so the card needs no skill.
   */
  grantsActions?: ActionDefinition[];
  iconPath: string;
  description: string;
  /** Catalan label for the slot, for display. */
  slotLabel?: string;
}

/**
 * A complete character definition. Both player builds (created on the fly) and
 * enemy templates (instantiated with runtime skill levels) reduce to this shape.
 */
export interface CharacterDefinition {
  id: string;
  displayName: string;
  /** CSS class used by the web app for theming. */
  classCss: string;
  iconPath: string;
  category: 'player' | 'enemy';
  basePV: number;
  skills: SkillInstance[];
  /** ActionDefinition ids forming the active "hand". */
  actions: string[];
  /** Equipment ids the character starts with. */
  equipment?: string[];
}
