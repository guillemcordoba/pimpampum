import { EffectHandler } from '@pimpampum/engine';
import { num, wieldedWeaponBonus } from './helpers.js';

/**
 * Generic weapon mechanic — shared by any weapon-using skill (Weapon Master,
 * Berserk, …), NOT tied to one skill. A "weapon action" carries `weapon_damage`:
 * the card rolls its OWN dice (the technique) and the wielded main-hand
 * weapon's flat attackBonus is added on top (×`times`). Weapon actions REQUIRE
 * a weapon — unarmed they are unplayable. Actions without `weapon_damage` are
 * unaffected.
 */
export const WEAPON_EFFECTS: Record<string, EffectHandler> = {
  weapon_damage: {
    canPlay(actor) { return wieldedWeaponBonus(actor) !== undefined; },
    modifyAttack(ctx) {
      const bonus = wieldedWeaponBonus(ctx.source);
      if (bonus === undefined) return;
      ctx.attackMods!.rollBonus += bonus * num(ctx.params, 'times', 1);
    },
    aiWeight() { return 0; },
  },
};
