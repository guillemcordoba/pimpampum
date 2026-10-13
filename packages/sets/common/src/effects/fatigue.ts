import { EffectHandler, FATIGUE_MAX_LEVEL } from '@pimpampum/engine';
import { num } from './helpers.js';

/** Fatigue a card has cost and its holder pays at the end of the round. */
const PRICE_KEY = 'fatiga-per-pagar';

export const FATIGUE_EFFECTS: Record<string, EffectHandler> = {
  // The card's price: `levels` of fatigue (rules.md — the one brake a card
  // carries; never a once-per-combat cap), paid at the END of the round it
  // went off in, so the card's own rolls are not charged for it. Unplayable
  // when already exhausted; an interrupted card costs nothing.
  fatigue_cost: {
    canPlay(actor) { return actor.fatigue < FATIGUE_MAX_LEVEL; },
    onPlay(ctx) { ctx.source.setStatus(PRICE_KEY, ctx.source.getStatusValue(PRICE_KEY, 0) + num(ctx.params, 'levels', 1), 1); },
    postRound(ctx) {
      const owed = ctx.source.getStatusValue(PRICE_KEY, 0);
      if (owed <= 0) return;
      ctx.source.clearStatus(PRICE_KEY);
      ctx.source.setFatigue(ctx.source.fatigue + owed);
      ctx.engine.log('info', `${ctx.source.name} puja ${owed} nivell${owed > 1 ? 's' : ''} de fatiga.`, ctx.source.team);
    },
  },
};
