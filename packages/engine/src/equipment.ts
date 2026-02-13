import { DiceRoll } from './dice.js';

export enum EquipmentSlot {
  Torso = 'Torso',
  Arms = 'Arms',
  Head = 'Head',
  Legs = 'Legs',
  MainHand = 'MainHand',
  OffHand = 'OffHand',
}

/** Passive equipment that modifies character stats */
export class Equipment {
  public defense: DiceRoll | null = null;
  public defenseFlat = 0;
  public speedMod = 0;
  public strengthMod = 0;
  public magicMod = 0;

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
}

export interface EquipmentTemplate {
  id: string;
  name: string;
  slot: EquipmentSlot;
  slotLabel: string;
  defenseLabel: string;
  speedLabel: string;
  creator: () => Equipment;
}

// Equipment factory functions
export function createArmaduraDeFerro(): Equipment {
  return new Equipment('Armadura de ferro', EquipmentSlot.Torso)
    .withDefenseFlat(7)
    .withSpeed(-3);
}

export function createCotaDeMalla(): Equipment {
  return new Equipment('Cota de malla', EquipmentSlot.Torso)
    .withDefenseDice(new DiceRoll(1, 8))
    .withSpeed(-2);
}

export function createArmaduraDeCuir(): Equipment {
  return new Equipment('Armadura de cuir', EquipmentSlot.Torso)
    .withDefenseFlat(4)
    .withSpeed(-1);
}

export function createBracalsDeCuir(): Equipment {
  return new Equipment('Braçals de cuir', EquipmentSlot.Arms)
    .withDefenseFlat(2)
    .withSpeed(0);
}

export const ALL_EQUIPMENT: EquipmentTemplate[] = [
  { id: 'armadura-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '+7', speedLabel: '-3', creator: createArmaduraDeFerro },
  { id: 'cota-malla', name: 'Cota de malla', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '1d8', speedLabel: '-2', creator: createCotaDeMalla },
  { id: 'armadura-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Torso, slotLabel: 'Tors', defenseLabel: '+4', speedLabel: '-1', creator: createArmaduraDeCuir },
  { id: 'bracals-cuir', name: 'Braçals de cuir', slot: EquipmentSlot.Arms, slotLabel: 'Braços', defenseLabel: '+2', speedLabel: '0', creator: createBracalsDeCuir },
];
