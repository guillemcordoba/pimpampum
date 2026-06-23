import { EffectHandler, Character, DiceRoll } from '@pimpampum/engine';
import { num } from './helpers.js';

/** The skill all explosive ordnance belongs to (content may know its own ids). */
export const EXPLOSIVE_SKILL_ID = 'enginyer-explosius';
const CHARGE_STATUS = 'carregues';

/** Bandolier size: a finite per-combat pool, min(6, 3 + floor(skill/30)). */
export function maxCharges(actor: Character): number {
  const lvl = actor.getSkillLevel(EXPLOSIVE_SKILL_ID);
  return Math.min(6, 3 + Math.floor(lvl / 30));
}

/** Current càrregues; falls back to the full bandolier if not yet initialised. */
function charges(actor: Character): number {
  return actor.getStatusValue(CHARGE_STATUS, maxCharges(actor));
}

function setCharges(actor: Character, n: number): void {
  actor.setStatus(CHARGE_STATUS, Math.max(0, n), -1);
}

/**
 * Effect handlers for the Enginyer d'Explosius skill. The finite bandolier is the
 * signature: ordnance spends càrregues (no mid-combat refill), smoke is free.
 */
export const EXPLOSIVE_EFFECTS: Record<string, EffectHandler> = {
  // Spend `amount` càrregues to play. Gates availability, spends on play, and
  // seeds the bandolier at combat start so the pool shows from turn one.
  charge_cost: {
    onCombatStart(ctx) {
      if (!ctx.source.hasStatus(CHARGE_STATUS)) setCharges(ctx.source, maxCharges(ctx.source));
    },
    canPlay(actor, params) {
      return charges(actor) >= num(params, 'amount', 1);
    },
    onPlay(ctx) {
      setCharges(ctx.source, charges(ctx.source) - num(ctx.params, 'amount', 1));
    },
  },

  // Bomba de fum: a smoke screen blinds the enemy team for the rest of the round.
  // Each blinded enemy attack rolls d20 (in the engine); on ≤10 it hits a random
  // combatant instead of its target. Free — smoke is a separate pouch.
  smoke: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const turns = num(ctx.params, 'turns', 1);
      for (const e of ctx.engine.enemiesOf(ctx.source)) e.setStatus('encegat', 1, turns);
      ctx.engine.log('focus', 'Una cortina de fum encega els enemics!', ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 2 ? 1.5 : 0.4; },
  },

  // Camp minat: seed the ground with mines. Stored as a pool on the layer; an
  // attacking enemy trips one at d20 ≤ 10 (handled in the engine). Costs càrregues
  // via a paired charge_cost effect.
  lay_minefield: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const mines = num(ctx.params, 'mines', 3);
      const sides = num(ctx.params, 'damageSides', 6);
      ctx.source.setStatus('camp-minat', mines, -1, { damage: new DiceRoll(1, sides) });
      ctx.engine.log('focus', `${ctx.source.name} sembra ${mines} mines al terreny.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 1 ? 1.4 : 0; },
  },

  // Traca final: spend the ENTIRE bandolier in one chained blast hitting every
  // enemy for Nd6 (N = càrregues spent). Charges are spent only here on resolve,
  // so an interrupted focus keeps the bandolier intact.
  empty_bandolier: {
    canPlay(actor) { return charges(actor) >= 1; },
    onResolve(ctx) {
      const n = charges(ctx.source);
      if (n <= 0) return;
      setCharges(ctx.source, 0);
      const dice = new DiceRoll(n, num(ctx.params, 'sides', 6));
      ctx.engine.log('focus', `${ctx.source.name} encén la traca final amb ${n} càrregues!`, ctx.source.team);
      for (const e of ctx.engine.enemiesOf(ctx.source)) {
        ctx.engine.performExtraAttack(ctx.source, e, dice, { skillId: EXPLOSIVE_SKILL_ID, label: 'Traca final' });
      }
    },
    aiWeight(ctx) {
      // Hoard, then unleash: more value with a full bandolier and many targets.
      const n = charges(ctx.actor);
      return n >= 3 ? n * 0.5 * Math.max(1, ctx.enemies.length) : 0.2;
    },
  },
};
