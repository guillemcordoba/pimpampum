import { EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { num, str, tspec, resolveTargets, targetReq } from './helpers.js';

/**
 * SET-UP → EXECUTE (empower): the holder's NEXT attack is massively bigger,
 * then the charge is spent.
 *
 * This is the shape intentions.md asks the game to be built around: spend a
 * turn preparing, telegraph it, and if the opponent fails to answer, the
 * follow-up should be close to lethal. A flat "+3 next turn" modifier does not
 * produce that feeling — the payoff has to be a large fraction of a health
 * bar, which means multiplying or adding real dice to the attack TOTAL (which
 * is also the damage margin).
 *
 * `entry.value` carries the flat bonus; `data.mult` the multiplier.
 */
const CARREGAT: StatusBehavior = {
  onAttackAction(ctx) {
    const mult = Number(ctx.entry.data?.['mult'] ?? 1);
    const bonus = ctx.entry.value;
    // Spend it: this is a one-shot payoff, not a stance.
    ctx.holder.clearStatus(ctx.key);
    return { attackTotalMult: mult, attackRollBonus: bonus };
  },
};

/** Focus effects: resolved in speed order via onResolve. */
export const FOCUS_EFFECTS: Record<string, EffectHandler> = {
  /**
   * SET UP → EXECUTE. Charge the target's next attack: `amount` flat on the
   * attack total and/or `mult` multiplying it, spent the moment they swing.
   *
   * The payoff is deliberately large. A round spent charging is a round not
   * spent attacking or defending, and it is visible on the table — so the
   * opponent gets a full round to answer it. If they don't, the follow-up
   * should be close to lethal; that asymmetry is where the game's swing is
   * meant to live (intentions.md).
   */
  empower: {
    getTargetRequirement(params) { return targetReq(tspec(params, 'self')); },
    onResolve(ctx) {
      const amount = num(ctx.params, 'amount', 6);
      const mult = num(ctx.params, 'mult', 1);
      const turns = num(ctx.params, 'turns', 2);
      const name = str(ctx.params, 'name', 'carregat');
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'self'))) {
        t.setStatus(name, amount, turns, { mult }, CARREGAT);
        ctx.engine.log('focus', `${t.name} carrega el proper atac.`, t.team);
      }
    },
    // Only worth a turn when there is something left to hit, and pointless to
    // stack on top of a charge that hasn't been spent yet.
    aiWeight(ctx) {
      if (ctx.actor.hasStatus(str(ctx.params, 'name', 'carregat'))) return 0;
      return ctx.enemies.length > 0 ? 1.6 : 0;
    },
  },
};
