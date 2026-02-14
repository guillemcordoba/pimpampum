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
  | { type: 'StrengthBoost'; amount: number; dice?: DiceRoll }
  | { type: 'MagicBoost'; amount: number; dice?: DiceRoll }
  | { type: 'AllyStrengthThisTurn'; amount: number }
  | { type: 'DefenseBoostDuration'; dice: DiceRoll; turns: number }
  | { type: 'TeamSpeedBoost' }
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
  | { type: 'RageBoost'; amount: number; dice?: DiceRoll; speedBoost: number }
  | { type: 'RecklessAttack' }
  | { type: 'IntimidatingRoar' }
  | { type: 'CounterThrow' }
  | { type: 'LifeDrain' }
  | { type: 'TouchOfDeath'; strengthDebuff: number; magicDebuff: number }
  | { type: 'DeathCurse'; dice: DiceRoll }
  | { type: 'ShroudDebuff'; amount: number }
  | { type: 'SpiritInvocation'; dice: DiceRoll }
  | { type: 'HealAlly' }
  | { type: 'BerserkerEndurance'; strengthDice: DiceRoll; counterAttackDice: DiceRoll }
  | { type: 'Frenzy'; bonusDicePerLostLife: DiceRoll }
  | { type: 'PetrifyingGaze'; dice: DiceRoll; threshold: number; turns: number }
  | { type: 'Regenerate'; amount: number }
  | { type: 'VenomBite' };

export const EFFECT_NONE: SpecialEffect = { type: 'None' };

export type TargetRequirement = 'none' | 'enemy' | 'ally' | 'ally_other';

/** Determine what kind of target the player needs to select for a card */
export function getCardTargetRequirement(card: Card): TargetRequirement {
  if (isAttack(card.cardType)) {
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
      case 'DeathCurse': return 'enemy';
      case 'Vengeance': return 'ally';
      case 'EnchantWeapon': return 'ally';
      case 'HealAlly': return 'ally';
      case 'PoisonWeapon': return 'none';
      case 'DefenseBoostDuration': return 'none';
      default: return 'none';
    }
  }
  return 'none';
}

/** How many targets the player needs to select for a card */
export function getCardTargetCount(card: Card): number {
  if (card.effect.type === 'MultiTarget') return card.effect.count;
  if (card.effect.type === 'DefendMultiple') return card.effect.count;
  return 1;
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
