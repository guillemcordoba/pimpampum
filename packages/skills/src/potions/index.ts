import { ActionDefinition, ActionType } from '@pimpampum/engine';
import { action, d } from '../types.js';

/**
 * Potions: consumable, skill-less action cards (unlockLevel 0 — playable by
 * anyone, no skill required). Drinking is a Focus action: fast, but
 * interruptible like any focus — and an interrupted potion is NOT spent
 * (consumption happens on resolve). How many you own is loot/DM economy;
 * each card vanishes when drunk.
 */
export const ALL_POTIONS: ActionDefinition[] = [
  action({
    id: 'pocio-de-vida', name: 'Poció de vida', skillId: 'pocio',
    unlock: 0, type: ActionType.Focus, speed: 3, dice: d(2, 4), consumable: true, fatigueCost: 0,
    effects: [{ type: 'heal', params: { mode: 'roll', target: 'self' } }],
    desc: 'Recuperes la tirada en PV. Un sol ús.',
    icon: 'delapouite/health-potion.svg',
  }),
  action({
    id: 'pocio-de-rapidesa', name: 'Poció de rapidesa', skillId: 'pocio',
    unlock: 0, type: ActionType.Focus, speed: 3, consumable: true, fatigueCost: 0,
    effects: [{ type: 'skill_mod', params: { kind: 'speed', amount: 3, duration: 3, target: 'self' } }],
    desc: '+3 de velocitat durant 3 torns. Un sol ús.',
    icon: 'lorc/fizzing-flask.svg',
  }),
  action({
    id: 'pocio-dale', name: "Poció d'alè", skillId: 'pocio',
    unlock: 0, type: ActionType.Focus, speed: 1, consumable: true, fatigueCost: 0,
    effects: [{ type: 'fatigue_relief', params: { amount: 5 } }],
    desc: 'Recuperes 5 punts de fatiga. Un sol ús.',
    icon: 'lorc/heart-bottle.svg',
  }),
];

const potionIndex = new Map(ALL_POTIONS.map(p => [p.id, p]));

export function getPotion(id: string): ActionDefinition | undefined {
  return potionIndex.get(id);
}
