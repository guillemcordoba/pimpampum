import { DiceRoll } from './dice.js';

export enum CardType {
  PhysicalAttack = 'PhysicalAttack',
  MagicAttack = 'MagicAttack',
  Defense = 'Defense',
  Focus = 'Focus',
  PhysicalDefense = 'PhysicalDefense',
}

export function isAttack(ct: CardType): boolean {
  return ct === CardType.PhysicalAttack || ct === CardType.MagicAttack || ct === CardType.PhysicalDefense;
}

export function isDefense(ct: CardType): boolean {
  return ct === CardType.Defense || ct === CardType.PhysicalDefense;
}

export function isFocus(ct: CardType): boolean {
  return ct === CardType.Focus;
}

export function isPhysical(ct: CardType): boolean {
  return ct === CardType.PhysicalAttack || ct === CardType.PhysicalDefense;
}

/** Special effect types for cards — discriminated union */
export type SpecialEffect =
  | { type: 'None' }
  | { type: 'Stun' }
  | { type: 'SkipNextTurn' }
  | { type: 'SkipNextTurns'; count: number }
  | { type: 'StrengthBoost'; amount: number }
  | { type: 'MagicBoost'; amount: number }
  | { type: 'AllyStrengthThisTurn'; amount: number }
  | { type: 'DefenseBoostDuration'; dice: DiceRoll; turns: number }
  | { type: 'TeamSpeedDefenseBoost' }
  | { type: 'EnemySpeedDebuff'; amount: number }
  | { type: 'EnemyStrengthDebuff'; amount: number }
  | { type: 'EmbestidaEffect' }
  | { type: 'IceTrap' }
  | { type: 'BlindingSmoke' }
  | { type: 'DodgeWithSpeedBoost' }
  | { type: 'CoordinatedAmbush' }
  | { type: 'Sacrifice' }
  | { type: 'Vengeance' }
  | { type: 'EnchantWeapon' }
  | { type: 'BloodThirst' }
  | { type: 'AbsorbPain' }
  | { type: 'MultiTarget'; count: number }
  | { type: 'DefendMultiple'; count: number }
  | { type: 'PoisonWeapon' }
  | { type: 'RageBoost' }
  | { type: 'RecklessAttack' }
  | { type: 'IntimidatingRoar' };

export const EFFECT_NONE: SpecialEffect = { type: 'None' };

export type TargetRequirement = 'none' | 'enemy' | 'ally' | 'ally_other';

/** Determine what kind of target the player needs to select for a card */
export function getCardTargetRequirement(card: Card): TargetRequirement {
  if (isAttack(card.cardType)) {
    if (card.effect.type === 'MultiTarget') return 'none';
    return 'enemy';
  }
  if (isDefense(card.cardType)) {
    if (card.effect.type === 'Sacrifice') return 'ally_other';
    if (card.defense) return 'ally';
    return 'none';
  }
  if (isFocus(card.cardType)) {
    switch (card.effect.type) {
      case 'CoordinatedAmbush': return 'enemy';
      case 'Vengeance': return 'ally';
      case 'EnchantWeapon': return 'ally';
      case 'PoisonWeapon': return 'ally';
      case 'DefenseBoostDuration': return 'ally_other';
      default: return 'none';
    }
  }
  return 'none';
}

/** A card that can be played during combat */
export class Card {
  public physicalAttack: DiceRoll | null = null;
  public magicAttack: DiceRoll | null = null;
  public defense: DiceRoll | null = null;
  public speedMod = 0;
  public effect: SpecialEffect = EFFECT_NONE;
  public description = '';

  constructor(
    public readonly name: string,
    public readonly cardType: CardType,
  ) {}

  withPhysicalAttack(dice: DiceRoll): this {
    this.physicalAttack = dice;
    return this;
  }

  withMagicAttack(dice: DiceRoll): this {
    this.magicAttack = dice;
    return this;
  }

  withDefense(dice: DiceRoll): this {
    this.defense = dice;
    return this;
  }

  withSpeedMod(speed: number): this {
    this.speedMod = speed;
    return this;
  }

  withEffect(effect: SpecialEffect): this {
    this.effect = effect;
    return this;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }
}
