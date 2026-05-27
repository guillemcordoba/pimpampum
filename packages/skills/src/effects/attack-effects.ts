import { EffectHandler } from '@pimpampum/engine';
import { num, str, diceParam, durParam, applyMod, ModKind } from './helpers.js';

/** Attack-rider effects: modifyAttack adjusts the roll/damage; onAttackHit triggers on a landed hit. */
export const ATTACK_EFFECTS: Record<string, EffectHandler> = {
  // Ignore the target's passive armour (arcane missiles, flurry kicks).
  piercing: {
    modifyAttack(ctx) { ctx.attackMods!.ignoreArmor = true; },
    aiWeight() { return 0.8; },
  },

  // Flat bonus PV damage on a hit (smite, devastating blows).
  bonus_damage: {
    modifyAttack(ctx) { ctx.attackMods!.bonusDamage += num(ctx.params, 'amount', 2); },
    aiWeight() { return 1; },
  },

  // Extra damage dice on a hit.
  extra_dice: {
    modifyAttack(ctx) { const d = diceParam(ctx.params, 'dice'); if (d) ctx.attackMods!.extraDamageDice.push(d); },
    aiWeight() { return 1; },
  },

  // +1 roll per `per` living allies (incl. self), capped at `max` (horde / pack tactics).
  pack: {
    modifyAttack(ctx) {
      const per = num(ctx.params, 'per', 3);
      const max = num(ctx.params, 'max', 5);
      const allies = ctx.engine.alliesOf(ctx.source, true).length;
      ctx.attackMods!.rollBonus += Math.min(max, Math.floor(allies / per));
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 1.5 : 0; },
  },

  // +1 roll per other living ally, capped at `max` (crossfire / coordinated strike).
  crossfire: {
    modifyAttack(ctx) {
      const max = num(ctx.params, 'max', 3);
      ctx.attackMods!.rollBonus += Math.min(max, ctx.engine.alliesOf(ctx.source, false).length);
    },
    aiWeight(ctx) { return ctx.allies.length >= 1 ? 1.2 : 0; },
  },

  // Bonus attack roll now, but lowered defense this and next turn.
  reckless: {
    modifyAttack(ctx) {
      ctx.attackMods!.rollBonus += num(ctx.params, 'attack', 5);
      applyMod(ctx.source, 'defense', -num(ctx.params, 'defense', 5), 1, 'Atac temerari');
      applyMod(ctx.source, 'defense', -num(ctx.params, 'defense', 5), 'thisTurn', 'Atac temerari');
    },
    aiWeight() { return 0.6; },
  },

  // Stronger the more wounded the attacker is: +`amount` per `per` missing PV.
  frenzy: {
    modifyAttack(ctx) {
      const missing = ctx.source.maxPV - ctx.source.currentPV;
      const steps = Math.floor(missing / num(ctx.params, 'per', 4));
      if (steps > 0) ctx.attackMods!.rollBonus += steps * num(ctx.params, 'amount', 3);
    },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.5 ? 1 : 0.3; },
  },

  // Heal the attacker for a fraction of damage dealt.
  lifedrain: {
    onAttackHit(ctx) {
      const dmg = ctx.damageDealt ?? 0;
      if (dmg > 0) ctx.engine.heal(ctx.source, Math.max(1, Math.round(dmg * num(ctx.params, 'ratio', 0.35))));
    },
    aiWeight() { return 0.8; },
  },

  // Lower a skill of the struck target.
  debuff_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      applyMod(ctx.target, (str(ctx.params, 'kind', 'skill') as ModKind), -num(ctx.params, 'amount', 8), durParam(ctx.params, 'duration', 'nextTurn'), 'Debilitació');
    },
    aiWeight() { return 0.6; },
  },

  // Apply damage-over-time on a hit.
  poison_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      const dmg = num(ctx.params, 'damage', 2);
      ctx.target.setStatus(str(ctx.params, 'name', 'verí'), dmg, num(ctx.params, 'turns', 3), { dot: dmg });
    },
    aiWeight() { return 0.8; },
  },

  // Make the target skip turns.
  stun_on_hit: {
    onAttackHit(ctx) { if (ctx.target) ctx.target.skipTurns += num(ctx.params, 'turns', 1); },
    aiWeight() { return 0.7; },
  },

  // Stack arcane marks on the target.
  mark_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      const cur = ctx.target.getStatusValue('marca', 0);
      ctx.target.setStatus('marca', cur + num(ctx.params, 'amount', 1), num(ctx.params, 'turns', 4));
    },
    aiWeight() { return 0.5; },
  },

  // Silence the target (no focus actions) for a while.
  silence_on_hit: {
    onAttackHit(ctx) { if (ctx.target) ctx.target.setStatus('silenced', 1, num(ctx.params, 'turns', 2)); },
    aiWeight() { return 0.5; },
  },
};
