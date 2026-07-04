import { StatusBehavior } from '@pimpampum/engine';

/**
 * Shared generic status behaviours, attached to status instances by the
 * generic handlers (poison_on_hit, dot, regen, …). Skill-specific behaviours
 * live next to their skill's handlers in `skills/*.ts`.
 */

/** Damage-over-time: the holder loses `value` PV at the end of each round.
 *  (`data.dot` stays on the entry as the marker `cleanse` strips.) */
export const DOT: StatusBehavior = {
  onRoundEnd(ctx) {
    if (ctx.entry.value <= 0 || !ctx.holder.isAlive()) return;
    ctx.engine.log('poison', `${ctx.holder.name} pateix ${ctx.entry.value} de dany (${ctx.key}).`, ctx.holder.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.entry.value, undefined);
  },
};

/** Regeneration: the holder recovers `value` PV at the end of each round. */
export const REGEN: StatusBehavior = {
  onRoundEnd(ctx) {
    if (ctx.entry.value <= 0 || !ctx.holder.isAlive()) return;
    ctx.engine.heal(ctx.holder, ctx.entry.value);
  },
};
