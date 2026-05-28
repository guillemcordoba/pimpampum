import { EffectHandler, Character } from '@pimpampum/engine';
import { num, str, diceParam, durParam, tspec, resolveTargets, targetReq, applyMod, bestSaveBonus, ModKind } from './helpers.js';

/** Focus effects: resolved in speed order via onResolve. */
export const FOCUS_EFFECTS: Record<string, EffectHandler> = {
  // Restore PV to the chosen / implied targets.
  heal: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 2);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'ally'))) ctx.engine.heal(t, amt);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'ally')); },
    aiWeight(ctx) {
      const pool = [ctx.actor, ...ctx.allies];
      return pool.filter(a => a.currentPV < a.maxPV).length * 1.5;
    },
  },

  // Buff (positive amount) or debuff (negative) a skill on the targets.
  // If a `dice` param is supplied, it is rolled once at apply and added to `amount`.
  skill_mod: {
    onResolve(ctx) {
      let amt = num(ctx.params, 'amount', 8);
      const dice = diceParam(ctx.params, 'dice');
      if (dice) amt += dice.roll();
      const kind = str(ctx.params, 'kind', 'skill') as ModKind;
      const dur = durParam(ctx.params, 'duration', 'nextTurn');
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'self'))) applyMod(t, kind, amt, dur, ctx.action.name);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'self')); },
    aiWeight(ctx) { return num(ctx.params, 'amount', 0) >= 0 ? 1.3 : 1.0; },
  },

  // Make the target(s) skip turns.
  stun: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) t.skipTurns += num(ctx.params, 'turns', 1);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Contested d20+skill vs target's d20+best-skill save: on success, stun.
  // Default target: 'enemies' (group save). aiWeight tuned moderately.
  contested_stun: {
    onResolve(ctx) {
      const turns = num(ctx.params, 'turns', 1);
      const targets = resolveTargets(ctx, tspec(ctx.params, 'enemies'));
      const atkSkill = ctx.source.getRollSkill(ctx.action.skillId, 'attack') + (ctx.action.rollBonus ?? 0);
      for (const t of targets) {
        const atkRoll = ctx.engine.rollD20();
        const defRoll = ctx.engine.rollD20();
        const defBonus = bestSaveBonus(t);
        const attacker = atkRoll + atkSkill;
        const defender = defRoll + defBonus;
        const ok = attacker > defender;
        ctx.engine.log('focus', `🎲 ${ctx.action.name} contra ${t.name}: ${atkRoll}+${atkSkill}=${attacker} vs ${defRoll}+${defBonus}=${defender} → ${ok ? 'no esquiva' : 'esquiva'}.`, ctx.source.team);
        if (ok) t.skipTurns += turns;
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemies')); },
    aiWeight() { return 1; },
  },

  // Set up a self-guard with the action's defensive bonus (dodge / evasion).
  evasion: {
    onResolve(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action }); },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.4 ? 2 : 0.6; },
  },

  // Goblin "Amagar-se": dodge this turn + next turn, gain +1 attack per ally hiding.
  // Each goblin sets the 'amagant-se' status on itself in onResolve; postRound
  // counts allies with that status (incl. self) and applies a next-turn attack buff.
  nimble_escape: {
    onResolve(ctx) {
      ctx.source.guards.push({ defender: ctx.source, action: ctx.action });
      ctx.source.setStatus('amagant-se', 1, 1);
    },
    postRound(ctx) {
      if (!ctx.source.hasStatus('amagant-se')) return;
      const hiding = ctx.engine.alliesOf(ctx.source, true).filter(a => a.hasStatus('amagant-se')).length;
      if (hiding > 0) applyMod(ctx.source, 'attack', hiding * num(ctx.params, 'amount', 1), 'nextTurn', ctx.action.name);
    },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.5 ? 1.6 : 0.7; },
  },

  // Mark an enemy: future attacks against them by the attacker's team get +amount roll.
  // The bonus is read by the engine from the 'marca-objectiu' status on the target.
  mark_target: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 4);
      const turns = num(ctx.params, 'turns', 1);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        t.setStatus('marca-objectiu', amt, turns);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Distribute a "poisoned weapon" status (extra damage per hit) to up to `count` allies.
  weapon_buff: {
    onResolve(ctx) {
      const amount = num(ctx.params, 'amount', 1);
      const count = num(ctx.params, 'count', 3);
      const turns = num(ctx.params, 'turns', -1);
      const allies = ctx.engine.alliesOf(ctx.source, true).slice(0, count);
      for (const a of allies) a.setStatus('arma-enverinada', amount, turns);
    },
    aiWeight() { return 0.9; },
  },

  // Mark an enemy: their next received wound costs an extra `amount` PV.
  doom_mark: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 1);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        t.setStatus('condemnat', amt, num(ctx.params, 'turns', -1));
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 0.8; },
  },

  // Every enemy that has lost PV this combat loses an extra `damage` PV (Rèquiem / Set de sang).
  wound_wounded: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 1);
      for (const e of ctx.engine.enemiesOf(ctx.source)) {
        if (e.hitThisCombat) {
          ctx.engine.log('focus', `${e.name} pateix una ferida addicional.`, e.team);
          ctx.engine.applyPvLoss(e, dmg, ctx.source);
        }
      }
    },
    aiWeight(ctx) {
      const wounded = ctx.enemies.filter(e => e.hitThisCombat).length;
      return wounded * 0.5;
    },
  },

  // Regeneration: heal a fixed amount at the end of each round for `turns`.
  regen: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 1);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'self'))) t.setStatus('regeneració', amt, num(ctx.params, 'turns', 3), { regen: amt });
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'self')); },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV ? 1.2 : 0.4; },
  },

  // Inflict damage-over-time on the chosen enemy / enemies.
  dot: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 2);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) t.setStatus(str(ctx.params, 'name', 'crema'), dmg, num(ctx.params, 'turns', 3), { dot: dmg });
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Beast form: extra PV plus per-kind bonuses for the rest of combat.
  wild_shape: {
    onResolve(ctx) {
      const pv = num(ctx.params, 'pv', 0);
      if (pv) {
        ctx.source.maxPV += pv;
        ctx.source.currentPV += pv;
      }
      const attack = num(ctx.params, 'attack', 0);
      const defense = num(ctx.params, 'defense', 0);
      const skill = num(ctx.params, 'skill', 0);
      if (attack) applyMod(ctx.source, 'attack', attack, 'restOfCombat', 'Forma salvatge');
      if (defense) applyMod(ctx.source, 'defense', defense, 'restOfCombat', 'Forma salvatge');
      if (skill) applyMod(ctx.source, 'skill', skill, 'restOfCombat', 'Forma salvatge');
    },
    aiWeight(ctx) { return ctx.round <= 2 ? 1.8 : 0.6; },
  },

  // Summon a combatant from a factory carried in params.
  summon: {
    onResolve(ctx) {
      const f = ctx.params['factory'] as (() => Character) | undefined;
      if (f) ctx.engine.addCombatant(ctx.source.team, f());
    },
    aiWeight(ctx) { return ctx.allies.length < 3 ? 1.5 : 0.3; },
  },

  // Sacrifice PV for a rest-of-combat skill buff.
  sacrifice: {
    onResolve(ctx) {
      ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'cost', 3), ctx.source);
      const amt = num(ctx.params, 'amount', 0);
      if (amt) {
        const kind = str(ctx.params, 'kind', 'skill') as ModKind;
        applyMod(ctx.source, kind, amt, 'restOfCombat', ctx.action.name);
      }
    },
    aiWeight(ctx) { return ctx.actor.currentPV > ctx.actor.maxPV * 0.6 ? 1.2 : 0.1; },
  },

  // Consume all arcane marks on enemies for burst damage.
  detonate: {
    onResolve(ctx) {
      const per = num(ctx.params, 'perMark', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemies'))) {
        const marks = t.getStatusValue('marca', 0);
        if (marks > 0) {
          t.clearStatus('marca');
          ctx.engine.log('focus', `Detonació arcana: ${t.name} rep ${marks * per} de dany.`, t.team);
          ctx.engine.applyPvLoss(t, marks * per, ctx.source);
        }
      }
    },
    aiWeight() { return 1; },
  },

  // Remove negative modifiers and damage-over-time statuses from the target(s).
  cleanse: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'ally'))) {
        t.modifiers = t.modifiers.filter(m => m.getValue() >= 0);
        for (const [key, entry] of t.statuses) {
          if (typeof entry.data?.dot === 'number') t.statuses.delete(key);
        }
        t.clearStatus('silenced');
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'ally')); },
    aiWeight() { return 0.5; },
  },
};
