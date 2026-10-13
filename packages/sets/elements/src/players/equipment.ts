import { type ActionDefinition, EquipmentDefinition, EquipmentSlot } from '@pimpampum/engine';
import { kitNeedsWeapon, needsWeapon, weaponFor, WEAPONS } from '@pimpampum/set-common';

const ICON = 'icons/000000/transparent/1x1/';

/**
 * The armour this world wears: a lamellar of boiled leather, and the iron
 * plate of the fire empire's soldiers. Same small lever as the fantasy set's
 * (intentions.md, ≤15% of outcome; it need not pay off). And the weapons every
 * set shares (@pimpampum/set-common), for the swordsmen who fight beside the
 * benders.
 *
 * No shield: every main kit here defends with its own element (or its own
 * blade), so the universal wooden-shield card the fantasy set hands every
 * hero has no place.
 */
export const ALL_EQUIPMENT: EquipmentDefinition[] = [
  {
    id: 'armadura-de-cuir', name: 'Armadura de cuir', slot: EquipmentSlot.Armor,
    passiveArmor: 2, speedPenalty: 1, rollBonuses: [],
    iconPath: ICON + 'lorc/leather-vest.svg', slotLabel: 'Armadura',
    description: '',
  },
  {
    id: 'armadura-de-ferro', name: 'Armadura de ferro', slot: EquipmentSlot.Armor,
    passiveArmor: 3, speedPenalty: 2, rollBonuses: [],
    iconPath: ICON + 'lorc/armor-vest.svg', slotLabel: 'Armadura',
    description: '',
  },
  ...WEAPONS,
];

const equipIndex = new Map(ALL_EQUIPMENT.map(e => [e.id, e]));

export function getEquipment(id: string): EquipmentDefinition | undefined {
  return equipIndex.get(id);
}

export { needsWeapon, kitNeedsWeapon };

const ARMOR_BY_VALUE: Record<number, string | null> = { 0: null, 1: 'armadura-de-cuir', 2: 'armadura-de-ferro' };

/** The gear a hero is given: the armour for `armor` (0-2, clamped), and the
 *  mid weapon whenever one of `kits` needs a weapon (`weaponFor`). */
export function standardGear(kits: { actions: ActionDefinition[] }[], armor: number): string[] {
  const armour = ARMOR_BY_VALUE[Math.max(0, Math.min(2, Math.round(armor)))];
  return [...(armour ? [armour] : []), ...weaponFor(kits)];
}
