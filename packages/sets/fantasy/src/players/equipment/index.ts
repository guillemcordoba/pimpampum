import { type ActionDefinition, ActionType, EquipmentDefinition, EquipmentSlot } from '@pimpampum/engine';
import { action, d } from '../types.js';

const ICON = 'icons/000000/transparent/1x1/';

/** Defense card granted by wearing the shield (unlock 0: needs no skill).
 *  Blocking with a shield shoves the attacker back — the universal defense
 *  payoff, the mildest of them (everyone can carry a shield). */
const ESCUT_DE_FUSTA = action({
  id: 'escut-de-fusta', name: 'Escut de fusta', skillId: 'escut', unlock: 0,
  type: ActionType.Defensa, speed: 2, dice: d(2, 4),
  effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 2, duration: 'nextTurn' } }],
  desc: 'Si bloqueges un atac, {V}−2 a l\'atacant el proper torn.',
  icon: 'willdabeast/round-shield.svg',
});

/** All equipment items. One armour, one weapon, one shield — small levers.
 *  Armour is a light durability nudge (intentions.md ≤15% of outcome) with a
 *  SWEET SPOT: what it buys and what its speed costs balance so that it is
 *  right on some of a party and wrong on all of it — light cuir on most, heavy
 *  ferro on a tank or two (sets/fantasy/test/set.slow.test.ts; NEXT-STEPS §26). */
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

/** Passive-armour value → the Armor item that provides it. */
const ARMOR_BY_VALUE: Record<number, string | null> = { 0: null, 1: 'armadura-de-cuir', 2: 'armadura-de-ferro' };

/** Does this card roll the WIELDED weapon? Without one it is unplayable. */
export function needsWeapon(card: ActionDefinition): boolean {
  return card.effects.some(e => e.type === 'weapon_damage');
}

/** Does a kit hold any card that needs a weapon? */
export function kitNeedsWeapon(kit: { actions: ActionDefinition[] }): boolean {
  return kit.actions.some(needsWeapon);
}

/**
 * THE GEAR A HERO IS GIVEN so every card in their kits actually works: the
 * shield (it is the universal defense card), the armour for `armor` (0-2,
 * clamped), and the MID weapon whenever a kit needs one — the bastó would hand
 * a weapon kit the worst weapon by accident, and no weapon at all is a dead
 * hand. One definition, because it used to be spelt out in five places (the
 * drawn party, the reference hero, the web app's hero builder, its roster
 * check and its quick-hero helper) that could drift apart.
 */
export function standardGear(kits: { actions: ActionDefinition[] }[], armor: number): string[] {
  const gear = ['escut'];
  const armour = ARMOR_BY_VALUE[Math.max(0, Math.min(2, Math.round(armor)))];
  if (armour) gear.push(armour);
  if (kits.some(kitNeedsWeapon)) gear.push('destral');
  return gear;
}
