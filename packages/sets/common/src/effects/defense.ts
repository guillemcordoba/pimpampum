import { EffectHandler, DiceRoll } from '@pimpampum/engine';
import { diceParam, wieldedWeaponBonus } from './helpers.js';

/** Defense-rider effects: onDefend runs when a block lands. */
export const DEFENSE_EFFECTS: Record<string, EffectHandler> = {
  // Counter-attack the attacker when an attack is blocked, rolling `dice`
  // (default 1d6). With `weapon: true` the wielded weapon's flat bonus rides
  // the riposte, exactly as it rides a weapon attack.
  counter: {
    onDefend(ctx) {
      if (!ctx.target) return;
      const dice = diceParam(ctx.params, 'dice') ?? new DiceRoll(1, 6);
      const rollBonus = ctx.params['weapon'] === true ? (wieldedWeaponBonus(ctx.source) ?? 0) : 0;
      ctx.engine.performExtraAttack(ctx.source, ctx.target, dice, { skillId: ctx.action.skillId, rollBonus, label: `${ctx.source.name} contraataca` });
    },
    aiWeight() { return 0.5; },
  },
};
