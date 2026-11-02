import { ActionType, EffectHandler, StatusBehavior, applyKind } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { HARM, applyMod, num } from '../effects/helpers.js';
import { warded } from '../effects/generic.js';

/**
 * MESTRE DE L'AIRE — the user's design ("Maestre de l'aire — conceptes de
 * cartes", 2026-11-01): the utility bender. Not a damage dealer nor a healer:
 * it controls the flow of the round — who acts first, who acts last, whom a
 * blow can reach — and sets up its allies. Five Focus, two defenses that turn
 * blows aside instead of soaking them, three attacks up to the tornado. The
 * numbers are this file's, on the dice ladder (intentions.md).
 */

const SKILL_ID = 'airbender';

// --- 6 · Escut d'aire -------------------------------------------------------

/** This round the wind turns blows aside: the holder takes half of what gets
 *  through. Lives and dies inside its round, so its price is 0 on purpose. */
const TURNED_ASIDE: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage <= 0) return damage;
    const half = Math.floor(damage / 2);
    ctx.engine.log('defense', `El vent aparta el cop contra ${ctx.holder.name}: ${half} de ${damage}.`, ctx.holder.team);
    return half;
  },
  positionValue() { return 0; },
};

// --- 7 · Coixí d'aire -------------------------------------------------------

/** This round every blow on the holder lands `value` softer. Lives and dies
 *  inside its round, so its price is 0 on purpose. */
const CUSHIONED: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage <= 0) return damage;
    return Math.max(0, damage - ctx.entry.value);
  },
  positionValue() { return 0; },
};

// --- 8 · Corrent ascendent --------------------------------------------------

/** Lifted on the wind this round: every blow on the holder finds only air.
 *  Lives and dies inside its round, so its price is 0 on purpose. */
const LIFTED: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage > 0) ctx.engine.log('defense', `El cop contra ${ctx.holder.name} només troba aire.`, ctx.holder.team);
    return 0;
  },
  positionValue() { return 0; },
};

/** A deflected blow is in flight (Ràfega desviadora). */
let deflecting = false;

const AIR_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Ventada: a foe it wounds is shoved back — its attack or Focus this
  // round comes last; a Defense, already braced, is not moved. (Delaying the
  // Defense too stripped every guard, fast, and won the round outright.)
  push_back: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || (ctx.damageDealt ?? 0) <= 0) return;
      const own = ctx.engine.plannedThisRound().find(p => p.actor === t && !p.resolved && !p.cancelled);
      if (!own || own.action.actionType === ActionType.Defensa) return;
      if (ctx.engine.delayPendingAction(t)) ctx.engine.log('attack', `${t.name} recula: actua l'últim aquest torn.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.5 : 0.2; },
  },

  // 2 · Ràfega desviadora: a blow the defense holds is turned, whole, on an
  // enemy the bender chooses — its total as it is. A blow already being turned
  // aside is not turned again (two of these facing each other would bounce one
  // blow back and forth forever; rules.md leaves loops to the cards).
  deflecting_gust: {
    onDefend(ctx) {
      const total = ctx.attackTotal ?? 0;
      if (total <= 0 || deflecting) return;
      const [t] = ctx.engine.chooseTargets(ctx.source, ctx.action, ctx.engine.enemiesOf(ctx.source), 1);
      if (!t) return;
      deflecting = true;
      try { ctx.engine.performExtraAttack(ctx.source, t, total, { label: `${ctx.source.name} desvia el cop` }); }
      finally { deflecting = false; }
    },
    aiWeight() { return 0.5; },
  },

  // 3 · Asfíxia: the chosen enemy, short of breath, has −`amount` on its
  // attacks for the next `turns` rounds.
  suffocate: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      const amount = num(ctx.params, 'amount', 3);
      applyMod(t, 'attack', -amount, num(ctx.params, 'turns', 2), ctx.action.name, undefined, HARM);
      ctx.engine.log('focus', `${ctx.source.name} buida l'aire dels pulmons de ${t.name}: −${amount} als atacs.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length ? 0.7 : 0; },
  },

  // 4 · Vent a favor: the chosen ally's card resolves right after this one —
  // in the fast step, before the normal defenses go up.
  tailwind: {
    getTargetRequirement() { return 'ally_other'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      if (ctx.engine.advancePendingAction(t)) {
        ctx.engine.log('focus', `El vent empeny ${t.name}: la seva carta es resol ara.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.allies.length ? 0.7 : -1; },
  },

  // 6 · Escut d'aire: the bender and whoever it defends take half of what
  // gets through this round.
  air_shield: {
    onResolve(ctx) {
      for (const t of new Set([ctx.source, ...ctx.targets.filter(t => t.team === ctx.source.team && t.isAlive())])) {
        t.setStatus('escut-d-aire', 1, 1, undefined, TURNED_ASIDE);
      }
    },
    aiWeight() { return 0.5; },
  },

  // 7 · Coixí d'aire: this round every blow on the bender's side lands
  // `amount` softer.
  air_cushion: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const amount = num(ctx.params, 'amount', 3);
      for (const a of ctx.engine.alliesOf(ctx.source, true)) a.setStatus('coixi-d-aire', amount, 1, undefined, CUSHIONED);
      ctx.engine.log('focus', `Un coixí d'aire envolta el grup: cada cop fa ${amount} menys.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length ? 0.6 : 0.3; },
  },

  // 8 · Corrent ascendent: the chosen ally rises on the wind — attacks on it
  // miss this round, and it loses its own card.
  updraft: {
    getTargetRequirement() { return 'ally_other'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      t.setStatus('aixecat', 1, 1, undefined, LIFTED);
      ctx.engine.cancelPendingAction(t);
      ctx.engine.log('focus', `Un corrent ascendent aixeca ${t.name} per sobre del combat.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.some(a => a.currentPV < a.maxPV * 0.4) ? 1 : 0.2; },
  },

  // 9 · Remolí: the chosen enemy is out of the fight next round — it plays no
  // card and nobody can aim at it.
  whirlwind: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      t.skipTurns = Math.max(t.skipTurns, 1);
      // Set in the Focus step: the round's end takes one, the next round remains.
      applyKind(t, 'untargetable', 'remoli', 1, 2);
      ctx.engine.log('focus', `Un remolí s'emporta ${t.name} fora del combat el torn següent.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.8 : 0.3; },
  },
};

export const AIRBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: "Mestre de l'aire", classCss: 'aire', category: 'player',
  description: "L'aire no xoca: decideix qui arriba primer, qui arriba tard i qui no arriba.",
  iconPath: 'icons/000000/transparent/1x1/lorc/tornado.svg',
  actions: [
    action({
      id: 'ventada', name: 'Ventada', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, fast: true, dice: d(1, 4), targetCount: 99,
      effects: [{ type: 'push_back' }],
      desc: 'Afecta tots els enemics. Els que fereix actuen els últims aquest torn, tret d\'una Defensa.',
      icon: 'lorc/wind-slap.svg',
    }),
    action({
      id: 'rafega-desviadora', name: 'Ràfega desviadora', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(2, 4),
      effects: [{ type: 'deflecting_gust' }],
      desc: "Si aguanta, l'atac va contra l'enemic que triïs, amb la mateixa tirada.",
      icon: 'lorc/whirlwind.svg',
    }),
    action({
      id: 'asfixia', name: 'Asfíxia', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'suffocate', params: { amount: 3, turns: 2 } }],
      desc: "L'enemic que triïs té −3 als atacs els 2 torns següents.",
      icon: 'delapouite/lungs.svg',
    }),
    action({
      id: 'vent-a-favor', name: 'Vent a favor', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Focus, fast: true,
      effects: [{ type: 'tailwind' }],
      desc: "La carta d'un aliat es resol just després d'aquesta.",
      icon: 'lorc/wind-hole.svg',
    }),
    action({
      id: 'fulles-de-vent', name: 'Fulles de vent', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, dice: d(2, 6, 1),
      effects: [{ type: 'piercing' }],
      desc: "Ignora l'armadura.",
      icon: 'lorc/air-zigzag.svg',
    }),
    action({
      id: 'escut-d-aire', name: "Escut d'aire", skillId: SKILL_ID,
      unlock: 6, type: ActionType.Defensa, dice: d(2, 4, 1),
      effects: [{ type: 'air_shield' }],
      desc: 'Aquest torn, tu i qui defenses rebeu la meitat del dany que us arribi.',
      icon: 'lorc/vortex.svg',
    }),
    action({
      id: 'coixi-d-aire', name: "Coixí d'aire", skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus, fast: true,
      effects: [{ type: 'air_cushion', params: { amount: 3 } }],
      desc: 'Aquest torn, cada cop contra el teu grup fa 3 menys de dany.',
      icon: 'lorc/feather.svg',
    }),
    action({
      id: 'corrent-ascendent', name: 'Corrent ascendent', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Focus, fast: true,
      effects: [{ type: 'updraft' }],
      desc: 'Un aliat: aquest torn, els atacs contra ell fallen, però perd la seva carta.',
      icon: 'lorc/crossed-air-flows.svg',
    }),
    action({
      id: 'remoli-de-vent', name: 'Remolí', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus,
      effects: [{ type: 'whirlwind' }],
      desc: "L'enemic que triïs queda fora del combat el torn següent: no juga carta i ningú no el pot atacar.",
      icon: 'lorc/tornado-discs.svg',
    }),
    action({
      id: 'tornado', name: 'Tornado', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(4, 4), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'stun_on_hit', params: { turns: 1 } }],
      desc: 'Puges 2 nivells de fatiga. Afecta tots els enemics. Els que fereix perden el torn següent.',
      icon: 'lorc/tornado.svg',
    }),
  ],
  effects: AIR_EFFECTS,
};
