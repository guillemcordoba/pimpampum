import { EffectHandler } from '@pimpampum/engine';
import { num, tspec, resolveTargets, targetReq } from './helpers.js';

/**
 * Nigromant — a doom-mark curse-caster. The spine is the `condemnat` status
 * (applied by `condemn`): the doomed roll every d20 at disadvantage, act 3
 * slower, cannot take Focus actions, and are reapable by `reap`. Those three
 * penalties live in the engine (rollD20For / getEffectiveSpeed / focus-lockout);
 * the handlers here only apply the status and the attack riders.
 */
export const NIGROMANT_EFFECTS: Record<string, EffectHandler> = {
  // Apply the doom mark to the targets (Marca de la perdició: 1 / Invocar
  // l'ombra de l'infern: all enemies). `turns` defaults to 3.
  condemn: {
    onResolve(ctx) {
      const turns = num(ctx.params, 'turns', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) t.setStatus('condemnat', 1, turns);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      // Worth more when there are undoomed enemies left to mark.
      const undoomed = ctx.enemies.filter(e => !e.hasStatus('condemnat')).length;
      return undoomed > 0 ? 1.5 : 0.1;
    },
  },

  // Mà de la tomba: a reap that only strikes the doomed, ignoring armour and
  // defenses. Non-doomed targets are skipped entirely.
  reap: {
    modifyAttack(ctx) {
      if (!ctx.attackMods || !ctx.target) return;
      if (!ctx.target.hasStatus('condemnat')) { ctx.attackMods.skip = true; return; }
      ctx.attackMods.ignoreArmor = true;
      ctx.attackMods.ignoreDefense = true;
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      const doomed = ctx.enemies.filter(e => e.hasStatus('condemnat')).length;
      return doomed > 0 ? 2 + doomed * 1.5 : -10; // useless without doomed foes
    },
  },

  // Profecia de la fi: cancel one enemy's still-pending (slower) action.
  cancel_action: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        const ok = ctx.engine.cancelPendingAction(t);
        ctx.engine.log('focus', ok
          ? `${ctx.source.name} preveu i cancel·la l'acció de ${t.name}.`
          : `${ctx.source.name} no arriba a temps de cancel·lar ${t.name}.`, ctx.source.team);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1.4; },
  },

  // Putrefacció: a contagious decay. Ticks `damage`/turn (armour-ignored, via the
  // generic status dot) and spreads +1 enemy/round (engine spreadPlague).
  plague: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 3);
      const turns = num(ctx.params, 'turns', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        t.setStatus('putrefaccio', dmg, turns, { dot: dmg, turns });
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      const clean = ctx.enemies.filter(e => !e.hasStatus('putrefaccio')).length;
      return clean > 0 ? 1.3 : 0.2;
    },
  },
};
