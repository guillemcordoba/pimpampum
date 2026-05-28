import { EffectHandler, EffectContext, Character, DiceRoll } from '@pimpampum/engine';
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

  // Stronger the more wounded the attacker is: +`amount` (or +dice) per `per` missing PV.
  frenzy: {
    modifyAttack(ctx) {
      const missing = ctx.source.maxPV - ctx.source.currentPV;
      const steps = Math.floor(missing / num(ctx.params, 'per', 4));
      if (steps <= 0) return;
      const dice = diceParam(ctx.params, 'dice');
      if (dice) {
        let total = 0;
        for (let i = 0; i < steps; i++) total += dice.roll();
        ctx.attackMods!.rollBonus += total;
      } else {
        ctx.attackMods!.rollBonus += steps * num(ctx.params, 'amount', 3);
      }
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

  // Lower a skill of the struck target — or all enemies if target=='enemies'.
  debuff_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      const kind = str(ctx.params, 'kind', 'skill') as ModKind;
      const amount = -num(ctx.params, 'amount', 8);
      const dur = durParam(ctx.params, 'duration', 'nextTurn');
      const tgt = str(ctx.params, 'target', '');
      const recipients: Character[] = tgt === 'enemies' ? ctx.engine.enemiesOf(ctx.source) : [ctx.target];
      for (const r of recipients) applyMod(r, kind, amount, dur, 'Debilitació');
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

  // After resolving the attack, perform an additional attack against the same target
  // (target='same') or a random enemy (default 'random'). Always fires (hit or miss).
  second_attack: {
    onAttackHit(ctx) { performSecondAttack(ctx); },
    onAttackMiss(ctx) { performSecondAttack(ctx); },
    aiWeight() { return 0.9; },
  },

  // After resolving the attack, the attacker skips their next N turns.
  self_stun: {
    onAttackHit(ctx) { ctx.source.skipTurns += num(ctx.params, 'turns', 1); },
    onAttackMiss(ctx) { ctx.source.skipTurns += num(ctx.params, 'turns', 1); },
    aiWeight() { return 0.4; },
  },

  // On hit, mark the target as undefendable: no guard can be used against them.
  undefendable_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      ctx.target.setStatus('indefensable', 1, num(ctx.params, 'turns', 2));
    },
    aiWeight() { return 0.6; },
  },

  // On hit, buff the attacker (a Swift Strike's bonus next turn).
  buff_on_hit: {
    onAttackHit(ctx) {
      const amt = num(ctx.params, 'amount', 2);
      const kind = str(ctx.params, 'kind', 'attack') as ModKind;
      const dur = durParam(ctx.params, 'duration', 'nextTurn');
      applyMod(ctx.source, kind, amt, dur, ctx.action.name);
    },
    aiWeight() { return 0.6; },
  },

  // Add the actor's level in another skill to the attack roll (Càstig diví "+M").
  skill_bonus_from: {
    modifyAttack(ctx) {
      const sid = str(ctx.params, 'skillId', '');
      if (!sid) return;
      ctx.attackMods!.rollBonus += ctx.source.getSkillLevel(sid);
    },
    aiWeight() { return 0.6; },
  },

  // On hit, steal a positive (non-armour) modifier from the target.
  spell_leech_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      const positives = ctx.target.modifiers.filter(m => m.value > 0 && m.stat !== 'armor');
      if (!positives.length) return;
      const stolen = positives[0];
      ctx.target.modifiers = ctx.target.modifiers.filter(m => m !== stolen);
      ctx.source.addModifier(stolen);
      ctx.engine.log('focus', `${ctx.source.name} roba "${stolen.source || stolen.stat}" de ${ctx.target.name}.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // Deal flat PV damage to self after resolving the action (warlock Explosió).
  self_damage: {
    onAttackHit(ctx) { ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'amount', 1), ctx.source); },
    onAttackMiss(ctx) { ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'amount', 1), ctx.source); },
    aiWeight() { return 0.4; },
  },

  // After attacking, the attacker is treated as evading (sets up a self-guard
  // using this same attack action — its rollBonus drives the dodge roll).
  evasion_after_attack: {
    onAttackHit(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action }); },
    onAttackMiss(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action }); },
    aiWeight() { return 0.7; },
  },

  // On hit, add a flat extra wound (Sentència infernal, "DoubleWound").
  double_wound: {
    onAttackHit(ctx) {
      if (!ctx.target) return;
      ctx.engine.applyPvLoss(ctx.target, num(ctx.params, 'amount', 2), ctx.source);
    },
    aiWeight() { return 1; },
  },
};

function performSecondAttack(ctx: EffectContext): void {
  const dice: DiceRoll | undefined = diceParam(ctx.params, 'dice') ?? ctx.action.damageDice;
  if (!dice) return;
  const mode = str(ctx.params, 'target', 'random');
  let t: Character | undefined;
  if (mode === 'same') {
    t = ctx.target && ctx.target.isAlive() ? ctx.target : undefined;
  } else {
    const pool = ctx.engine.enemiesOf(ctx.source);
    if (!pool.length) return;
    t = pool[Math.floor(Math.random() * pool.length)];
  }
  if (!t) return;
  ctx.engine.performExtraAttack(ctx.source, t, dice, { skillId: ctx.action.skillId, label: `${ctx.source.name} segon atac` });
}
