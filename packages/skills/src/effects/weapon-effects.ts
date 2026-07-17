import { EffectHandler } from '@pimpampum/engine';
import { num, wieldedWeaponDice } from './helpers.js';

/**
 * Generic weapon mechanic — shared by any weapon-using skill (Weapon Master,
 * Berserk, …), NOT tied to one skill. A "weapon action" carries `weapon_damage`
 * and rolls the wielded main-hand weapon's dice as its attack: the card reads
 * as "arma + modificador" (its flat rollBonus). Actions without `weapon_damage`
 * are unaffected and keep their own dice.
 */
export const WEAPON_EFFECTS: Record<string, EffectHandler> = {
  // Roll the wielded main-hand weapon's dice into the attack total (×`times`,
  // default 1). No weapon → 0.
  weapon_damage: {
    modifyAttack(ctx) {
      const dice = wieldedWeaponDice(ctx.source);
      if (!dice) return;
      const times = num(ctx.params, 'times', 1);
      for (let i = 0; i < times; i++) ctx.attackMods!.extraDamageDice.push(dice);
    },
    aiWeight() { return 0; },
  },
};
