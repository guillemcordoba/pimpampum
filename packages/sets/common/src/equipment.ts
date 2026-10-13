import { type ActionDefinition, EquipmentDefinition, EquipmentSlot } from '@pimpampum/engine';
import { ICON_PREFIX } from './types.js';

/**
 * THE WEAPONS every set hands out. A weapon is only a flat `attackBonus` the
 * generic `weapon_damage` effect adds to a weapon card's roll (and that a few
 * cards read for their riders); the technique is the card's own dice.
 */
export const WEAPONS: EquipmentDefinition[] = [
  {
    id: 'basto', name: 'Bastó', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 0,
    iconPath: ICON_PREFIX + 'delapouite/bo.svg', slotLabel: 'Arma',
    description: '',
  },
  // An experiment the user wants measured: +1 to attack AND to Defensa rolls,
  // but only in a fencer's hand — Esgrima 2 or more. Anyone may carry it; below
  // that it is a weapon at +0 and no parry.
  {
    id: 'espasa-lleugera', name: 'Espasa lleugera', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 0,
    rollBonuses: [{ skillId: '*', kind: 'defense', value: 1 }],
    attackBonus: 1,
    bonusRequires: { skillId: 'mestre-armes', level: 2 },
    iconPath: ICON_PREFIX + 'lorc/pointy-sword.svg', slotLabel: 'Arma',
    description: 'Els bonus només compten amb Esgrima 2 o més.',
  },
  {
    id: 'destral', name: 'Destral', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 0, rollBonuses: [],
    attackBonus: 2,
    iconPath: ICON_PREFIX + 'delapouite/sharp-axe.svg', slotLabel: 'Arma',
    description: '',
  },
  {
    id: 'gran-destral', name: 'Gran destral', slot: EquipmentSlot.Weapon,
    passiveArmor: 0, speedPenalty: 1, rollBonuses: [],
    attackBonus: 4,
    iconPath: ICON_PREFIX + 'delapouite/war-axe.svg', slotLabel: 'Arma',
    description: '',
  },
];

/** Does this card roll the WIELDED weapon? Without one it is unplayable. */
export function needsWeapon(card: ActionDefinition): boolean {
  return card.effects.some(e => e.type === 'weapon_damage');
}

/** Does a kit hold any card that needs a weapon? */
export function kitNeedsWeapon(kit: { actions: ActionDefinition[] }): boolean {
  return kit.actions.some(needsWeapon);
}

/**
 * The weapon a hero is given so every card in their kits works: the MID one
 * (the destral) whenever a kit needs one — the bastó would hand a weapon kit
 * the worst weapon by accident, and no weapon at all is a dead hand — and
 * nothing otherwise. Each set's `standardGear` adds its own armour (and
 * shield) around it.
 */
export function weaponFor(kits: { actions: ActionDefinition[] }[]): string[] {
  return kits.some(kitNeedsWeapon) ? ['destral'] : [];
}
