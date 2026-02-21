import { DiceRoll } from './dice.js';
import { Card, CardType } from './card.js';

export enum EquipmentSlot {
  Torso = 'Torso',
  Arms = 'Arms',
  Head = 'Head',
  Legs = 'Legs',
  MainHand = 'MainHand',
  OffHand = 'OffHand',
  Consumable = 'Consumable',
}

/** Passive equipment that modifies character stats */
export class Equipment {
  public defense: DiceRoll | null = null;
  public defenseFlat = 0;
  public speedMod = 0;
  public strengthMod = 0;
  public magicMod = 0;
  public consumableCard: Card | null = null;

  constructor(
    public readonly name: string,
    public readonly slot: EquipmentSlot,
  ) {}

  withDefenseFlat(defense: number): this {
    this.defenseFlat = defense;
    return this;
  }

  withDefenseDice(dice: DiceRoll): this {
    this.defense = dice;
    return this;
  }

  withSpeed(speed: number): this {
    this.speedMod = speed;
    return this;
  }

  /** Get defense value (rolls dice if applicable) */
  getDefense(): number {
    const diceVal = this.defense ? this.defense.roll() : 0;
    return this.defenseFlat + diceVal;
  }

  /** Get average defense (for AI calculations) */
  getDefenseAvg(): number {
    const diceAvg = this.defense ? this.defense.average() : 0;
    return this.defenseFlat + diceAvg;
  }

  withConsumableCard(card: Card): this {
    this.consumableCard = card;
    return this;
  }
}

export interface EquipmentTemplate {
  id: string;
  name: string;
  slot: EquipmentSlot;
  slotLabel: string;
  defenseLabel: string;
  speedLabel: string;
  effectLabel?: string;
  iconPath: string;
  creator: () => Equipment;
}

// Equipment factory functions
export function createArmaduraDeFerro(): Equipment {
  return new Equipment('Armadura de ferro', EquipmentSlot.Torso)
    .withDefenseFlat(3)
    .withSpeed(-3);
}

export function createCotaDeMalla(): Equipment {
  return new Equipment('Cota de malla', EquipmentSlot.Torso)
    .withDefenseDice(new DiceRoll(1, 4))
    .withSpeed(-2);
}

export function createArmaduraDeCuir(): Equipment {
  return new Equipment('Armadura de cuir', EquipmentSlot.Torso)
    .withDefenseFlat(2)
    .withSpeed(-1);
}

export function createBracalsDeCuir(): Equipment {
  return new Equipment('Braçals de cuir', EquipmentSlot.Arms)
    .withDefenseFlat(1)
    .withSpeed(0);
}

export function createPocioDeGuaricio(): Equipment {
  const card = new Card('Poció de guarició', CardType.Focus)
    .withSpeedMod(2)
    .withEffect({ type: 'Regenerate', amount: 1 })
    .withDescription("Consumible. Beu la poció per curar 1 vida.")
    .withConsumable();
  return new Equipment('Poció de guarició', EquipmentSlot.Consumable)
    .withConsumableCard(card);
}

export const ALL_EQUIPMENT: EquipmentTemplate[] = [
  { id: 'armadura-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '+3', speedLabel: '-3', iconPath: 'icons/000000/transparent/1x1/lorc/armor-vest.svg', creator: createArmaduraDeFerro },
  { id: 'cota-malla', name: 'Cota de malla', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '1d4', speedLabel: '-2', iconPath: 'icons/000000/transparent/1x1/lorc/mail-shirt.svg', creator: createCotaDeMalla },
  { id: 'armadura-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '+2', speedLabel: '-1', iconPath: 'icons/000000/transparent/1x1/lorc/leather-vest.svg', creator: createArmaduraDeCuir },
  { id: 'bracals-cuir', name: 'Braçals de cuir', slot: EquipmentSlot.Arms, slotLabel: 'Braços', defenseLabel: '+1', speedLabel: '0', iconPath: 'icons/000000/transparent/1x1/lorc/mailed-fist.svg', creator: createBracalsDeCuir },
  { id: 'pocio-guaricio', name: 'Poció de guarició', slot: EquipmentSlot.Consumable, slotLabel: 'Consumible', defenseLabel: '-', speedLabel: '+2', effectLabel: 'Cura 1 vida', iconPath: 'icons/000000/transparent/1x1/delapouite/health-potion.svg', creator: createPocioDeGuaricio },
];
