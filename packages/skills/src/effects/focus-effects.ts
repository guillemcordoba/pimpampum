import { EffectHandler, Character } from '@pimpampum/engine';
import { num, str, durParam, tspec, resolveTargets, targetReq, applyMod, ModKind } from './helpers.js';

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
  skill_mod: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 8);
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

  // Set up a self-guard with the action's defensive bonus (dodge / evasion).
  evasion: {
    onResolve(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action }); },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.4 ? 2 : 0.6; },
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

  // Beast form: extra PV plus an all-round skill bonus for the rest of combat.
  wild_shape: {
    onResolve(ctx) {
      const pv = num(ctx.params, 'pv', 4);
      ctx.source.maxPV += pv;
      ctx.source.currentPV += pv;
      applyMod(ctx.source, 'skill', num(ctx.params, 'skill', 8), 'restOfCombat', 'Forma salvatge');
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

  // Sacrifice PV for a large rest-of-combat skill buff.
  sacrifice: {
    onResolve(ctx) {
      ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'cost', 3), ctx.source);
      applyMod(ctx.source, 'skill', num(ctx.params, 'amount', 12), 'restOfCombat', 'Màgia de sang');
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
