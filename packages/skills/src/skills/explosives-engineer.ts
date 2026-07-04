import { ActionType, Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

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
 * Enginyer d'Explosius — a military demolitions engineer who fights from a finite
 * bandolier of càrregues (charges). Ordnance spends charges (no refill); smoke is
 * free. All handlers and the `encegat` / `camp-minat` status behaviours live
 * below, on this SkillDefinition.
 */
const ENGINYER_EFFECTS: Record<string, EffectHandler> = {
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
  // Each blinded enemy attack scatters via the `encegat` status behaviour below.
  // Free — smoke is a separate pouch.
  smoke: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const turns = num(ctx.params, 'turns', 1);
      for (const e of ctx.engine.enemiesOf(ctx.source)) e.setStatus('encegat', 1, turns, undefined, ENCEGAT);
      ctx.engine.log('focus', 'Una cortina de fum encega els enemics!', ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 2 ? 1.5 : 0.4; },
  },

  // Camp minat: seed the ground with mines. Stored as a pool on the layer; an
  // attacking enemy trips one via the `camp-minat` status behaviour below.
  // Costs càrregues via a paired charge_cost effect.
  lay_minefield: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const mines = num(ctx.params, 'mines', 3);
      const sides = num(ctx.params, 'damageSides', 6);
      ctx.source.setStatus('camp-minat', mines, -1, { damage: new DiceRoll(1, sides) }, CAMP_MINAT);
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

// Smoke: the blinded holder fires through the haze — on a d20 ≤ 10 the shot
// lands on a random living combatant instead of its intended target.
const ENCEGAT: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    if (ctx.engine.rollD20() > 10) return intended;
    const pool = [...ctx.engine.livingTeam(0), ...ctx.engine.livingTeam(1)].filter(c => c !== ctx.holder);
    if (pool.length === 0) return intended;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick !== intended) ctx.engine.log('info', `${ctx.holder.name} dispara a cegues dins el fum i apunta cap a ${pick.name}!`, ctx.holder.team);
    return pick;
  },
};

// Minefield pool on the layer (persists even if the layer has fallen): the
// first live minefield gives each attacking enemy a d20 ≤ 10 chance to trip a
// mine, take its blast (armour-ignored) and spend it. One check per attack.
const CAMP_MINAT: StatusBehavior = {
  onEnemyAttackAction(ctx, attacker) {
    if (ctx.entry.value <= 0) return false;
    if (ctx.engine.rollD20() <= 10) {
      const dice = ctx.entry.data?.['damage'] as DiceRoll | undefined;
      const dmg = dice ? dice.roll() : 1;
      ctx.engine.log('trap', `${attacker.name} trepitja una mina! (${dmg} dany)`, attacker.team);
      ctx.engine.applyPvLoss(attacker, dmg, undefined);
      ctx.entry.value--;
      if (ctx.entry.value <= 0) {
        ctx.holder.clearStatus('camp-minat');
        ctx.engine.log('info', 'El camp de mines s’esgota.', ctx.holder.team);
      }
    }
    return true; // one minefield check per attack
  },
};

export const ENGINYER_EXPLOSIUS: SkillDefinition = {
  id: 'enginyer-explosius', displayName: "Enginyer d'Explosius", classCss: 'enginyer', category: 'player',
  description: 'Enginyer militar de demolicions: un bandoler finit de càrregues, fum i mines.',
  iconPath: ICON_PREFIX + 'lord-berandas/bomber.svg',
  actions: [
    action({
      id: 'granada-de-fragmentacio', name: 'Granada de fragmentació', skillId: 'enginyer-explosius',
      unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), targetCount: 99,
      effects: [{ type: 'charge_cost', params: { amount: 1 } }],
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/grenade.svg',
    }),
    action({
      id: 'bomba-de-fum', name: 'Bomba de fum', skillId: 'enginyer-explosius',
      unlock: 10, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'smoke', params: { turns: 1 } }],
      desc: 'Cada enemic que ataca aquest torn tira un d20: amb 10 o menys, l’atac impacta un personatge a l’atzar.',
      icon: 'darkzaitzev/smoke-bomb.svg',
    }),
    action({
      id: 'explosiu-perforant', name: 'Explosiu perforant', skillId: 'enginyer-explosius',
      unlock: 30, type: ActionType.Atac, speed: 0, damage: d(1, 8),
      effects: [{ type: 'piercing', params: {} }, { type: 'charge_cost', params: { amount: 1 } }],
      desc: 'Ignora l’armadura.',
      icon: 'delapouite/dynamite.svg',
    }),
    action({
      id: 'camp-minat', name: 'Camp minat', skillId: 'enginyer-explosius',
      unlock: 50, type: ActionType.Focus, speed: -2, fatigueCost: 2,
      effects: [
        { type: 'charge_cost', params: { amount: 3 } },
        { type: 'lay_minefield', params: { mines: 3, damageSides: 6 } },
      ],
      desc: 'Sembra 3 mines. Cada enemic que ataca té un 50% (d20 ≤ 10) de trepitjar-ne una i rebre 1d6, ignorant l’armadura. Duren fins que s’esgoten.',
      icon: 'skoll/minefield.svg',
    }),
    action({
      id: 'traca-final', name: 'Traca final', skillId: 'enginyer-explosius',
      unlock: 65, type: ActionType.Focus, speed: -4, fatigueCost: 2,
      effects: [{ type: 'empty_bandolier', params: { sides: 6 } }],
      desc: 'Cada enemic rep Nd6, on N és el nombre de càrregues que et queden. Gasta totes les càrregues que et quedin.',
      icon: 'skoll/carpet-bombing.svg',
    }),
  ],
  effects: ENGINYER_EFFECTS,
};
