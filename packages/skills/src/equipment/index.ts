import { ActionType, EquipmentDefinition, EquipmentSlot } from '@pimpampum/engine';
import { action, d } from '../types.js';

const ICON = 'icons/000000/transparent/1x1/';

/** Defense card granted by wearing the shield (unlock 0: needs no skill). */
const ESCUT_DE_FUSTA = action({
  id: 'escut-de-fusta', name: 'Escut de fusta', skillId: 'escut', unlock: 0,
  type: ActionType.Defensa, speed: 2, dice: d(2, 4),
  desc: '', icon: 'willdabeast/round-shield.svg',
});

/** All equipment items. One armour, one weapon, one shield — small levers.
 *  Armour is a light durability nudge (intentions.md ≤15% of outcome), so the
 *  values are deliberately small: cuir +1, ferro +2 (heavier = more speed cost). */
export const ALL_EQUIPMENT: EquipmentDefinition[] = [
  {
    id: 'armadura-de-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Armor,
    passiveArmor: 1, speedPenalty: 1, rollBonuses: [],
    iconPath: ICON + 'lorc/leather-vest.svg', slotLabel: 'Armadura',
    description: '',
  },
  {
    id: 'armadura-de-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Armor,
    passiveArmor: 2, speedPenalty: 2, rollBonuses: [],
    iconPath: ICON + 'lorc/armor-vest.svg', slotLabel: 'Armadura',
    description: '',
  },
  {
    id: 'escut', name: 'Escut de fusta', slot: EquipmentSlot.Shield,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    grantsActions: [ESCUT_DE_FUSTA],
    iconPath: ICON + 'willdabeast/round-shield.svg', slotLabel: 'Escut',
    description: '',
  },
  {
    id: 'destral', name: 'Destral', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 2,
    iconPath: ICON + 'delapouite/sharp-axe.svg', slotLabel: 'Arma',
    description: '',
  },
  {
    id: 'basto', name: 'Bastó', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 0,
    iconPath: ICON + 'delapouite/bo.svg', slotLabel: 'Arma',
    description: '',
  },
  {
    id: 'gran-destral', name: 'Gran destral', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 1, rollBonuses: [],
    attackBonus: 4,
    iconPath: ICON + 'delapouite/war-axe.svg', slotLabel: 'Arma',
    description: '',
  },
];

const equipIndex = new Map(ALL_EQUIPMENT.map(e => [e.id, e]));

export function getEquipment(id: string): EquipmentDefinition | undefined {
  return equipIndex.get(id);
}
