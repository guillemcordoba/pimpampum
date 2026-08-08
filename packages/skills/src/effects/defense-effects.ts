import { EffectHandler, DiceRoll } from '@pimpampum/engine';
import { num, str, diceParam, durParam, applyMod, ModKind, wieldedWeaponBonus } from './helpers.js';
import { DOT } from './status-behaviors.js';

/** Defense-rider effects: onDefend runs when a block lands; onBlockFail when it fails. */
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

  // On a successful block, the attacker directly loses PV (spiked / infernal
  // retaliation). Flat `amount`, or `dice` when the retaliation is rolled.
  retaliate_wound: {
    onDefend(ctx) {
      if (!ctx.target) return;
      const dice = diceParam(ctx.params, 'dice');
      const amount = dice ? dice.roll() : num(ctx.params, 'amount', 2);
      ctx.engine.log('defense', `${ctx.source.name} repèl l'atac: ${ctx.target.name} rep ${amount} de dany.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.target, amount, ctx.source);
    },
    aiWeight() { return 0.5; },
  },

  // On a successful block, the attacker is left burning/bleeding: a DoT of
  // `damage` per round for `turns` rounds.
  dot_on_block: {
    onDefend(ctx) {
      if (!ctx.target) return;
      const dmg = num(ctx.params, 'damage', 2);
      const name = str(ctx.params, 'name', 'crema');
      ctx.target.setStatus(name, dmg, num(ctx.params, 'turns', 2), { dot: dmg }, DOT);
      ctx.engine.log('defense', `${ctx.target.name} queda amb ${name} (${dmg}/torn).`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // On a successful block, the defender recovers PV (bones reknitting, wards
  // feeding on the blow).
  heal_on_block: {
    onDefend(ctx) {
      ctx.engine.log('defense', `${ctx.source.name} es refà del cop.`, ctx.source.team);
      ctx.engine.heal(ctx.source, num(ctx.params, 'amount', 3));
    },
    aiWeight() { return 0.4; },
  },

  // On a successful block, debuff the attacker.
  debuff_on_block: {
    onDefend(ctx) {
      if (!ctx.target) return;
      applyMod(ctx.target, str(ctx.params, 'kind', 'skill') as ModKind, -num(ctx.params, 'amount', 3), durParam(ctx.params, 'duration', 'nextTurn'), 'Repèl'); // TODO(balance)
    },
    aiWeight() { return 0.3; },
  },

  // On a successful block, buff the defender or the defended ally.
  buff_on_block: {
    onDefend(ctx) {
      const recipient = str(ctx.params, 'target', 'self') === 'ally' ? (ctx.targets[0] ?? ctx.source) : ctx.source;
      const amt = num(ctx.params, 'amount', 2);
      const kind = str(ctx.params, 'kind', 'defense') as ModKind;
      const dur = durParam(ctx.params, 'duration', 'restOfCombat');
      applyMod(recipient, kind, amt, dur, ctx.action.name);
    },
    aiWeight() { return 0.4; },
  },

  // When the guard fails and damage gets through, buff the defender (berserker rage).
  buff_on_block_fail: {
    onBlockFail(ctx) {
      const amt = num(ctx.params, 'amount', 2); // TODO(balance)
      const kind = str(ctx.params, 'kind', 'attack') as ModKind;
      const dur = durParam(ctx.params, 'duration', 'restOfCombat');
      applyMod(ctx.source, kind, amt, dur, ctx.action.name);
    },
    aiWeight() { return 0.4; },
  },

  // Extra passive armour for the round the defense is played.
  self_armor: {
    onResolve(ctx) { applyMod(ctx.source, 'armor', num(ctx.params, 'amount', 2), 'thisTurn', ctx.action.name); },
    aiWeight() { return 0.3; },
  },
};
