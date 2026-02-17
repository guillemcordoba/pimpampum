import { DiceRoll } from './dice.js';
import { ModifierDuration } from './modifier.js';

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
  | { type: 'CharacteristicModifier';
      modifiers: Array<{
        characteristic: 'strength' | 'magic' | 'defense' | 'speed';
        amount: number;
        dice?: DiceRoll;
      }>;
      target: 'self' | 'allies' | 'team' | 'enemy' | 'enemies';
      duration: ModifierDuration;
    }
  | { type: 'EmbestidaEffect' }
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
  | { type: 'VenomBite' }
  | { type: 'SwiftStrike' }
  | { type: 'PiercingStrike' }
  | { type: 'FlurryOfBlows' }
  | { type: 'Deflection'; counterAttackDice: DiceRoll }
  | { type: 'MeditationBoost'; defenseDice: DiceRoll; defenseFlat: number; speedBoost: number }
  | { type: 'SilenceStrike' }
  | { type: 'PackTactics'; alliesPerBonus: number }
  | { type: 'NimbleEscape' }
  | { type: 'Crossfire'; maxBonus: number }
  | { type: 'FireAndRetreat' }
  | { type: 'LingeringFire' }
  | { type: 'DebilitatingVenom'; defenseReduction: number }
  | { type: 'TerrorAura'; statReduction: number }
  | { type: 'DoomMark' }
  | { type: 'Impale' }
  | { type: 'BloodContract' }
  | { type: 'FuryScaling' }
  | { type: 'InfernalRetaliation' }
  | { type: 'DoubleWound' }
  | { type: 'Dissonance' }
  | { type: 'MagicDeflection'; counterAttackDice: DiceRoll }
  | { type: 'Charm' }
  | { type: 'VoiceOfValor' }
  | { type: 'Requiem' }
  | { type: 'Overcharge' }
  | { type: 'SpellReflection' }
  | { type: 'BloodMagic' }
  | { type: 'DivineSmite' }
  | { type: 'DivineBulwark' }
  | { type: 'LayOnHands' };

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
      case 'LingeringFire': return 'enemy';
      case 'DoomMark': return 'enemy';
      case 'BloodContract': return 'enemy';
      case 'Vengeance': return 'ally';
      case 'EnchantWeapon': return 'ally';
      case 'HealAlly': return 'ally';
      case 'VoiceOfValor': return 'ally';
      case 'LayOnHands': return 'ally';
      case 'Charm': return 'enemy';
      case 'PoisonWeapon': return 'none';
      case 'CharacteristicModifier':
        if (card.effect.target === 'enemy') return 'enemy';
        return 'none';
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
