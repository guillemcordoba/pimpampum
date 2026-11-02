import { ActionType, Character, EffectHandler, StatusBehavior, applyKind } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { HARM, applyMod, num } from '../effects/helpers.js';
import { warded } from '../effects/generic.js';

/**
 * MESTRE DE L'AIRE — the user's design ("Maestre de l'aire — conceptes de
 * cartes", 2026-11-01): the utility bender. Not a damage dealer nor a healer:
 * it controls the flow of the round — who acts first, who acts last, whom a
 * blow can reach — and sets up its allies; at its top it turns the whole round
 * backwards and pulls the breath out of an enemy. The numbers are this file's,
 * on the dice ladder (intentions.md).
 */

const SKILL_ID = 'airbender';

// --- 9 · Asfíxia ---------------------------------------------------------------

const CHOKED_KEY = 'asfixia';
const CHOKING_KEY = 'asfixiant';

const CHOKED: StatusBehavior = {
  harmful: true,
  // The end of the round after the one the choke began: the breath is gone.
  onRoundEnd(ctx) {
    if (ctx.entry.remaining > 1 || !ctx.holder.isAlive()) return;
    const caster = ctx.entry.data?.['caster'] as Character | undefined;
    ctx.engine.log('focus', `${ctx.holder.name} s'ofega i cau.`, caster?.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.holder.currentPV, caster);
  },
  // Half of what the holder has left: the choke lands about as often as it is broken.
  positionValue: ref => -0.5 * ref.holder.currentPV / Math.max(1, ref.holder.maxPV),
};

const CHOKING: StatusBehavior = {
  // A wound on the bender breaks the hold.
  onPvLost(ctx) {
    const victim = ctx.entry.data?.['victim'] as Character | undefined;
    ctx.holder.clearStatus(CHOKING_KEY);
    if (!victim?.hasStatus(CHOKED_KEY)) return;
    victim.clearStatus(CHOKED_KEY);
    ctx.engine.log('focus', `${ctx.holder.name} perd la concentració: ${victim.name} torna a respirar.`, ctx.holder.team);
  },
  // A marker the choke reads, not a state of the fight.
  positionValue() { return 0; },
};

// --- 4 · Coixí d'aire -------------------------------------------------------

/** This round every blow on the holder lands `value` softer. Lives and dies
 *  inside its round, so its price is 0 on purpose. */
const CUSHIONED: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage <= 0) return damage;
    return Math.max(0, damage - ctx.entry.value);
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

  // 9 · Asfíxia: the bender pulls the air out of the chosen enemy's lungs;
  // unless someone wounds the bender by the end of next round, it falls.
  asphyxia: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      // Set in the Focus step: this round's end takes one, the next one's is the fall.
      t.setStatus(CHOKED_KEY, 1, 2, { caster: ctx.source }, CHOKED);
      ctx.source.setStatus(CHOKING_KEY, 1, 2, { victim: t }, CHOKING);
      ctx.engine.log('focus', `${ctx.source.name} buida l'aire dels pulmons de ${t.name}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length ? 0.7 : 0; },
  },

  // 5 · Fulles de vent: three blades, each its own blow at a chosen enemy;
  // blades beyond the enemies chosen go at the first again.
  three_blades: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.skip = true; },
    onAttackResolved(ctx) {
      const dice = ctx.action.dice;
      if (!dice) return;
      const blows = num(ctx.params, 'blows', 3);
      for (let b = 0; b < blows && ctx.source.isAlive(); b++) {
        const t = ctx.targets[b]?.isAlive() ? ctx.targets[b] : ctx.targets.find(a => a.isAlive());
        if (!t) break;
        ctx.engine.performExtraAttack(ctx.source, t, dice, {
          skillId: ctx.action.skillId, rollBonus: ctx.action.rollBonus ?? 0, label: `${ctx.source.name} «${ctx.action.name}» (${b + 1})`,
        });
      }
    },
    aiWeight() { return 0.5; },
  },

  // 3 · Vent a favor: the chosen ally's card resolves right after this one —
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

  // 4 · Coixí d'aire: this round every blow on the bender's side lands
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

  // 6 · Finta a contrapeu: the blow the defense holds was the feint's bait —
  // next round the attacker, wrong-footed, has −`amount` on its attacks and
  // on its defenses.
  wrong_foot: {
    onDefend(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || warded(t)) return;
      const amount = num(ctx.params, 'amount', 3);
      applyMod(t, 'attack', -amount, 'nextTurn', ctx.action.name, undefined, HARM);
      applyMod(t, 'defense', -amount, 'nextTurn', ctx.action.name, undefined, HARM);
      ctx.engine.log('defense', `${t.name} queda a contrapeu: −${amount} als atacs i a les defenses el torn següent.`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // 8 · Contracorrent: the rest of the round runs backwards — every card still
  // to resolve goes Focus first, then attacks, then defenses, each in its
  // commit order — so this round's normal defenses come up after the blows.
  counter_current: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const steps = [ActionType.Focus, ActionType.Atac, ActionType.Defensa];
      const rest = ctx.engine.plannedThisRound().filter(p => !p.resolved && !p.cancelled && p.actor !== ctx.source);
      const order = [...rest].sort((a, b) => steps.indexOf(a.action.actionType) - steps.indexOf(b.action.actionType));
      // Each advance lands right after this card, so the last to resolve goes first.
      for (const p of order.reverse()) ctx.engine.advancePendingAction(p.actor);
      ctx.engine.log('focus', `${ctx.source.name} gira el vent a contracorrent: el torn va al revés.`, ctx.source.team);
    },
    aiWeight() { return 0.3; },
  },

  // 7 · Remolí (with the generic `not_twice_running`): the chosen enemy is out
  // of the fight next round — it plays no card and nobody can aim at it.
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
      id: 'vent-a-favor', name: 'Vent a favor', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, fast: true,
      effects: [{ type: 'tailwind' }],
      desc: "La carta d'un aliat es resol just després d'aquesta.",
      icon: 'lorc/wind-hole.svg',
    }),
    action({
      id: 'coixi-d-aire', name: "Coixí d'aire", skillId: SKILL_ID,
      unlock: 4, type: ActionType.Focus, fast: true,
      effects: [{ type: 'air_cushion', params: { amount: 3 } }],
      desc: 'Aquest torn, cada cop contra el teu grup fa 3 menys de dany.',
      icon: 'lorc/feather.svg',
    }),
    action({
      id: 'fulles-de-vent', name: 'Fulles de vent', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, dice: d(1, 4), targetCount: 3,
      effects: [{ type: 'three_blades', params: { blows: 3 } }],
      desc: "Tres atacs, cadascun contra l'enemic que triïs.",
      icon: 'lorc/air-zigzag.svg',
    }),
    action({
      id: 'finta-a-contrapeu', name: 'Finta a contrapeu', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Defensa, dice: d(2, 6, 1),
      effects: [{ type: 'wrong_foot', params: { amount: 3 } }],
      desc: "Si aguanta, l'atacant té −3 als atacs i a les defenses el torn següent.",
      icon: 'lorc/foot-trip.svg',
    }),
    action({
      id: 'remoli-de-vent', name: 'Remolí', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus,
      effects: [{ type: 'not_twice_running', params: { card: 'remoli' } }, { type: 'whirlwind' }],
      desc: "L'enemic que triïs queda fora del combat el torn següent: no juga carta i ningú no el pot atacar. No el pots jugar dos torns seguits.",
      icon: 'lorc/tornado-discs.svg',
    }),
    action({
      id: 'contracorrent', name: 'Contracorrent', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Focus, fast: true,
      effects: [{ type: 'counter_current' }],
      desc: "Aquest torn, després del pas ràpid, l'ordre va al revés: Focus, Atacs i, al final, Defenses.",
      icon: 'lorc/divided-spiral.svg',
    }),
    action({
      id: 'asfixia', name: 'Asfíxia', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'asphyxia' }],
      desc: "Puges 2 nivells de fatiga. L'enemic que triïs s'ofega: si ningú no et fereix fins al final del torn següent, queda a 0 PV.",
      icon: 'delapouite/lungs.svg',
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
