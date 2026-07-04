import { EffectHandler } from '@pimpampum/engine';
import { num, wieldedWeaponDice } from './helpers.js';

/**
 * Generic weapon mechanic — shared by any weapon-using skill (Weapon Master,
 * Berserk, …), NOT tied to one skill. A "weapon action" carries `weapon_damage`
 * and deals the wielded main-hand weapon's dice; the action's own {ATK} (skill +
 * precision) decides whether it lands. Actions without `weapon_damage` are
 * unaffected and keep their fixed damage dice.
 */
export const WEAPON_EFFECTS: Record<string, EffectHandler> = {
  // Deal the wielded main-hand weapon's dice (×`times`, default 1). No weapon → 0.
  weapon_damage: {
    modifyAttack(ctx) {
      const dice = wieldedWeaponDice(ctx.source);
      if (!dice) return;
      const times = num(ctx.params, 'times', 1);
      for (let i = 0; i < times; i++) ctx.attackMods!.extraDamageDice.push(dice);
    },
    aiWeight() { return 0; },
  },

  // Precision: count the action's own skill level extra times on the attack roll.
  // levelMultiplier N → adds (N-1)×level to {ATK}, so {ATK} = level×N + d20.
  precision: {
    modifyAttack(ctx) {
      const mult = num(ctx.params, 'levelMultiplier', 2);
      const lvl = ctx.source.getSkillLevel(ctx.action.skillId);
      ctx.attackMods!.rollBonus += lvl * (mult - 1);
    },
    aiWeight() { return 0.8; },
  },

  // Feint: ignore the target's guard entirely (the attack is undefendable).
  ignore_defense: {
    modifyAttack(ctx) { ctx.attackMods!.ignoreDefense = true; },
    aiWeight() { return 0.9; },
  },
};
