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

/** Equipment slots. Keys are stable identifiers; Catalan labels live in EQUIPMENT display data. */
export enum EquipmentSlot {
  Torso = 'Torso',
  Head = 'Head',
  Arms = 'Arms',
  Legs = 'Legs',
  MainHand = 'MainHand',
  OffHand = 'OffHand',
}

/** What kind of target the player must pick for an action. */
export type TargetRequirement = 'none' | 'enemy' | 'ally' | 'ally_other' | 'self';

/** A skill the character knows and its current level (1-100). */
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
  /** Skill this action belongs to; the attack/defense roll uses this skill's level. */
  skillId: string;
  /** Skill level at which this action unlocks. */
  unlockLevel: number;
  actionType: ActionType;
  /** Higher resolves first. Heavy-armour speed penalty is subtracted at runtime. */
  speed: number;
  /** Damage dice rolled on a hit (Atac only). */
  damageDice?: DiceRoll;
  /** Flat bonus added to the d20 + skill roll for this action. */
  rollBonus?: number;
  /** How many targets are selected (multi-attack / multi-defend). Defaults to 1. */
  targetCount?: number;
  effects: ActionEffect[];
  description: string;
  iconPath: string;
  /** Consumable actions are removed after a single use (e.g. potions). */
  isConsumable?: boolean;
  /** Healing/support actions may target (and revive) downed allies. */
  canReviveTarget?: boolean;
  /**
   * Fatigue added to the actor each time this action is played. Defaults to
   * `DEFAULT_FATIGUE_COST` (1). Larger-impact actions (multi-target, lasting
   * buffs, transformations) declare higher costs; trivial actions declare 0.
   */
  fatigueCost?: number;
}

export interface SkillBonus {
  /** Bonus applies to rolls made with this skill. Use '*' to bonus every skill. */
  skillId: string;
  bonus: number;
}

/** Passive equipment definition: flat armour, speed penalty and skill bonuses. */
export interface EquipmentDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
  /** Flat damage reduction subtracted from each incoming hit (min 0 damage). */
  passiveArmor: number;
  /** Subtracted from the speed of every action the wearer plays (>= 0). */
  speedPenalty: number;
  skillBonuses: SkillBonus[];
  /**
   * Weapon damage dice. Only matters for actions carrying the `weapon_damage`
   * effect — those deal the wielded main-hand weapon's dice instead of their own.
   * Generic: any weapon-using skill (Weapon Master, Berserk…) reads it.
   */
  damageDice?: DiceRoll;
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
