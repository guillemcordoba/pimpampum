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

  // Atac encadenat: arm the compounding attack chain. The engine reads the
  // `cadena` status: each attacking turn doubles {ATK} and damage; the chain
  // breaks on any non-attack turn (engine `applyChainBreaks`).
  chain_attack: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('cadena'); },
    onResolve(ctx) {
      ctx.source.setStatus('cadena', 1, -1, { armedRound: ctx.engine.round });
      ctx.engine.log('focus', `${ctx.source.name} encadena els seus atacs!`, ctx.source.team);
    },
    // Worth arming when there are foes to grind down; nothing once already chained.
    aiWeight(ctx) { return ctx.actor.hasStatus('cadena') ? 0 : (ctx.enemies.length >= 1 ? 2.5 : 0); },
  },

  // Estat de flux: enter the flow state. The engine handles the post-reveal card
  // swaps (flowSwapRefs / flowSwap) while the `flux` charge counter lasts.
  flow_state: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('flux'); },
    onResolve(ctx) {
      ctx.source.setStatus('flux', num(ctx.params, 'charges', 3), -1);
      ctx.engine.log('focus', `${ctx.source.name} entra en estat de flux.`, ctx.source.team);
    },
    // The AI can't exploit post-reveal swaps, so keep it from picking this often.
    aiWeight() { return 0.2; },
  },
};
