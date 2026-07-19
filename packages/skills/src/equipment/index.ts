import { ActionType, EquipmentDefinition, EquipmentSlot } from '@pimpampum/engine';
import { action, d } from '../types.js';

const ICON = 'icons/000000/transparent/1x1/';

/** Defense card granted by wearing a shield (unlock 0: needs no skill). */
const ALCAR_ESCUT = action({
  id: 'alcar-escut', name: "Alçar l'escut", skillId: 'escut', unlock: 0,
  type: ActionType.Defensa, speed: 2, dice: d(2, 4),
  desc: '', icon: 'willdabeast/round-shield.svg',
});

/** All equipment items. Heavy armour trades speed for protection. */
export const ALL_EQUIPMENT: EquipmentDefinition[] = [
  {
    id: 'armadura-de-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Torso,
    passiveArmor: 3, speedPenalty: 4, rollBonuses: [],
    iconPath: ICON + 'lorc/armor-vest.svg', slotLabel: 'Tors',
    description: '',
  },
  {
    id: 'cota-de-malla', name: 'Cota de malla', slot: EquipmentSlot.Torso,
    passiveArmor: 2, speedPenalty: 2, rollBonuses: [],
    iconPath: ICON + 'lorc/mail-shirt.svg', slotLabel: 'Tors',
    description: '',
  },
  {
    id: 'armadura-de-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Torso,
    passiveArmor: 1, speedPenalty: 1, rollBonuses: [],
    iconPath: ICON + 'lorc/leather-vest.svg', slotLabel: 'Tors',
    description: '',
  },
  {
    id: 'casc-de-ferro', name: 'Casc de ferro', slot: EquipmentSlot.Head,
    passiveArmor: 1, speedPenalty: 1, rollBonuses: [],
    iconPath: ICON + 'lorc/visored-helm.svg', slotLabel: 'Cap',
    description: '',
  },
  {
    id: 'bracals-de-cuir', name: 'Braçals de cuir', slot: EquipmentSlot.Arms,
    passiveArmor: 1, speedPenalty: 0, rollBonuses: [],
    iconPath: ICON + 'lorc/mailed-fist.svg', slotLabel: 'Braços',
    description: '',
  },
  {
    id: 'botes-de-cuir', name: 'Botes de cuir', slot: EquipmentSlot.Legs,
    passiveArmor: 1, speedPenalty: 0, rollBonuses: [],
    iconPath: ICON + 'lorc/leather-boot.svg', slotLabel: 'Cames',
    description: '',
  },
  {
    id: 'escut', name: 'Escut', slot: EquipmentSlot.OffHand,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    grantsActions: [ALCAR_ESCUT],
    iconPath: ICON + 'willdabeast/round-shield.svg', slotLabel: 'Mà secundària',
    description: '',
  },
  {
    id: 'destral', name: 'Destral', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 2,
    iconPath: ICON + 'delapouite/sharp-axe.svg', slotLabel: 'Mà principal',
    description: '',
  },
  {
    id: 'basto', name: 'Bastó', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 0,
    iconPath: ICON + 'delapouite/bo.svg', slotLabel: 'Mà principal',
    description: '',
  },
  {
    id: 'gran-destral', name: 'Gran destral', slot: EquipmentSlot.MainHand,
    passiveArmor: 0, speedPenalty: 1, rollBonuses: [],
    attackBonus: 4,
    iconPath: ICON + 'delapouite/war-axe.svg', slotLabel: 'Mà principal',
    description: '',
  },
];

const equipIndex = new Map(ALL_EQUIPMENT.map(e => [e.id, e]));

export function getEquipment(id: string): EquipmentDefinition | undefined {
  return equipIndex.get(id);
}
