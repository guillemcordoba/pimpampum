import { ActionType, Character, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { isolate, lock, warded } from '../../players/effects/generic.js';
import { applyMod } from '../../players/effects/helpers.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The first of the Senyor de la Por's six bodies (Pain's Deva path): it pushes
 * everything away and pulls one victim in. Its push is airbending, the oldest
 * kind — and like Pain's, it needs a breath before it can push again: bait it,
 * then strike in the gap.
 */

/** Pulled in: the holder's blows all go to the body that pulled them. */
const ATRET: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    const puller = ctx.entry.data?.['puller'];
    return puller instanceof Character && puller.isAlive() && intended.team !== ctx.holder.team ? puller : intended;
  },
  positionValue() { return -0.08; },
};

const EMPENTA_EFFECTS: Record<string, EffectHandler> = {
  // Empenta universal: a blocked attacker is thrown back (−3 speed next turn),
  // and the push leaves the body without a guard next turn — its breath.
  universal_push: {
    onDefend(ctx) {
      if (ctx.target?.isAlive()) applyMod(ctx.target, 'speed', -3, 'nextTurn', ctx.action.name);
    },
    postRound(ctx) {
      lock(ctx.source, [ActionType.Defensa], 1, ctx.action.name);
      ctx.engine.log('defense', `${ctx.source.name} ha de recuperar l'alè: el torn següent no pot empènyer.`, ctx.source.team);
    },
    aiWeight() { return 0.8; },
  },

  // Atracció: one hero is torn out of formation — nobody can protect them, and
  // their blows can only reach the body that holds them.
  attraction: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      isolate(t);
      t.setStatus('atret', 1, 2, { puller: ctx.source, harm: 1 }, ATRET);
      ctx.engine.log('focus', `${ctx.source.name} estira ${t.name} cap a ell: sol, i només pot atacar-lo a ell.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.2 : 0.3; },
  },
};

const EMPENTA_SKILL: SkillDefinition = {
  id: 'rostre-de-l-empenta', displayName: "Rostre de l'Empenta", classCss: 'por', category: 'enemy',
  description: "El primer cos del Senyor de la Por: ho empeny tot lluny i n'estira un cap a ell.",
  iconPath: ICON + 'lorc/wind-slap.svg',
  actions: [
    action({
      id: 'empenta-universal', name: 'Empenta universal', skillId: 'rostre-de-l-empenta',
      unlock: 1, type: ActionType.Defensa, speed: 6, dice: d(3, 6),
      effects: [{ type: 'self_guard' }, { type: 'universal_push' }],
      desc: "Només et protegeix a tu. Si bloqueges, l'atacant {V}−3 el torn següent. El torn següent no pots jugar Defenses.",
      icon: 'lorc/wind-slap.svg',
    }),
    action({
      id: 'atraccio', name: 'Atracció', skillId: 'rostre-de-l-empenta',
      unlock: 2, type: ActionType.Focus, speed: 3,
      effects: [{ type: 'attraction' }],
      desc: "Tria un enemic: el torn següent ningú no el pot protegir, i només et pot atacar a tu.",
      icon: 'lorc/magnet.svg',
    }),
  ],
  effects: EMPENTA_EFFECTS,
};

export const ROSTRE_DE_L_EMPENTA: EnemyDefinition = {
  id: 'rostre-de-l-empenta', displayName: "Rostre de l'Empenta", classCss: 'por', iconPath: ICON + 'lorc/wind-slap.svg',
  /** A borrowed body — a grown man. */
  bulk: 1.0,
  skills: [EMPENTA_SKILL],
};
