import { EquipmentDefinition, EquipmentSlot, DiceRoll } from '@pimpampum/engine';

const ICON = 'icons/000000/transparent/1x1/';

/** All equipment items. Heavy armour trades speed for protection. */
export const ALL_EQUIPMENT: EquipmentDefinition[] = [
  {
    id: 'armadura-de-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Torso,
    passiveArmor: 3, speedPenalty: 4, skillBonuses: [],
    iconPath: ICON + 'lorc/armor-vest.svg', slotLabel: 'Tors',
    description: 'Molta protecció, però molt pesada (gran penalització de velocitat).',
  },
  {
    id: 'cota-de-malla', name: 'Cota de malla', slot: EquipmentSlot.Torso,
    passiveArmor: 2, speedPenalty: 2, skillBonuses: [],
    iconPath: ICON + 'lorc/mail-shirt.svg', slotLabel: 'Tors',
    description: 'Protecció equilibrada amb una penalització moderada de velocitat.',
  },
  {
    id: 'armadura-de-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Torso,
    passiveArmor: 1, speedPenalty: 1, skillBonuses: [],
    iconPath: ICON + 'lorc/leather-vest.svg', slotLabel: 'Tors',
    description: 'Lleugera: poca protecció, poca penalització.',
  },
  {
    id: 'elm-de-ferro', name: 'Elm de ferro', slot: EquipmentSlot.Head,
    passiveArmor: 1, speedPenalty: 1, skillBonuses: [],
    iconPath: ICON + 'lorc/visored-helm.svg', slotLabel: 'Cap',
    description: 'Protegeix el cap amb una petita penalització.',
  },
  {
    id: 'bracals-de-cuir', name: 'Braçals de cuir', slot: EquipmentSlot.Arms,
    passiveArmor: 1, speedPenalty: 0, skillBonuses: [],
    iconPath: ICON + 'lorc/mailed-fist.svg', slotLabel: 'Braços',
    description: 'Una mica de protecció sense penalització.',
  },
  {
    id: 'botes-de-cuir', name: 'Botes de cuir', slot: EquipmentSlot.Legs,
    passiveArmor: 1, speedPenalty: 0, skillBonuses: [],
    iconPath: ICON + 'lorc/leather-boot.svg', slotLabel: 'Cames',
    description: 'Protecció lleugera per a les cames.',
  },
  {
    id: 'escut', name: 'Escut', slot: EquipmentSlot.OffHand,
    passiveArmor: 2, speedPenalty: 1, skillBonuses: [],
    iconPath: ICON + 'willdabeast/round-shield.svg', slotLabel: 'Mà secundària',
    description: 'Bona protecció a canvi d\'una mica de velocitat.',
  },
  {
    id: 'arma-esmolada', name: 'Arma esmolada', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 0, skillBonuses: [{ skillId: '*', bonus: 2 }],
    damageDice: new DiceRoll(1, 6),
    iconPath: ICON + 'delapouite/sharp-axe.svg', slotLabel: 'Mà principal',
    description: 'Una arma de qualitat: +2 a totes les habilitats.',
  },
  {
    id: 'basto', name: 'Bastó', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 0, skillBonuses: [],
    damageDice: new DiceRoll(1, 4),
    iconPath: ICON + 'delapouite/wood-stick.svg', slotLabel: 'Mà principal',
    description: 'Una arma humil. El dany de les accions d\'arma surt d\'aquí (1d4).',
  },
  {
    id: 'gran-destral', name: 'Gran destral', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 1, skillBonuses: [],
    damageDice: new DiceRoll(1, 12),
    iconPath: ICON + 'delapouite/war-axe.svg', slotLabel: 'Mà principal',
    description: 'Una destral a dues mans, brutal i feixuga (1d12, −1 velocitat).',
  },
];

const equipIndex = new Map(ALL_EQUIPMENT.map(e => [e.id, e]));

export function getEquipment(id: string): EquipmentDefinition | undefined {
  return equipIndex.get(id);
}
