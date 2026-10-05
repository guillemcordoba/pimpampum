import { ActionType, EffectHandler, FATIGUE_MAX_LEVEL } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { turnOnAllies, warded } from '../effects/generic.js';

/**
 * Mestre de l'aigua — waterbending is tai chi: it does not meet force, it
 * turns it. The kit wins exchanges by READING them (a redirect that returns
 * exactly what you out-read), heals because water is life, and ends in the art
 * every water tribe forbids.
 */

const AIGUA_EFFECTS: Record<string, EffectHandler> = {
  // Desviar el corrent: the blow is turned back on whoever threw it. The
  // margin by which the defense won IS the water that comes back — the better
  // the read, the harder the return.
  redirect_current: {
    onDefend(ctx) {
      if (!ctx.target || !ctx.target.isAlive()) return;
      const back = -(ctx.margin ?? 0);
      if (back <= 0) return;
      ctx.engine.log('defense', `${ctx.source.name} desvia el corrent: ${ctx.target.name} rep ${back}.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.target, back, ctx.source);
    },
    aiWeight() { return 0.6; },
  },

  // Domini de la sang: the forbidden art. The chosen enemy's blows land on
  // their own side next turn. The taboo is paid in exhaustion, as Entrar en
  // Fúria pays (a card whose text says so), and an Esgotat bender cannot.
  bloodbend: {
    getTargetRequirement() { return 'enemy'; },
    canPlay(actor) { return actor.fatigue < FATIGUE_MAX_LEVEL; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      ctx.source.setFatigue(ctx.source.fatigue + 1);
      if (!t || !t.isAlive()) return;
      if (warded(t)) {
        ctx.engine.log('focus', `${t.name} té el chakra obert: la sang no obeeix.`, ctx.source.team);
        return;
      }
      turnOnAllies(t);
      ctx.engine.log('focus', `${ctx.source.name} domina la sang de ${t.name}: el torn següent ataca els seus.`, ctx.source.team);
    },
    // Only worth it when there is someone for the puppet to hit.
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.3 : -3; },
  },
};

export const WATERBENDER: SkillDefinition = {
  id: 'waterbender', displayName: "Mestre de l'aigua", classCss: 'aigua', category: 'player',
  description: "Flueix: no aturis l'onada, gira-la. Cura, empresona en gel i, sota la lluna plena, domina la sang.",
  iconPath: ICON_PREFIX + 'lorc/water-splash.svg',
  actions: [
    action({
      id: 'fuet-d-aigua', name: "Fuet d'aigua", skillId: 'waterbender',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(2, 4),
      desc: '',
      icon: 'lorc/water-bolt.svg',
    }),
    action({
      id: 'desviar-el-corrent', name: 'Desviar el corrent', skillId: 'waterbender',
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 4),
      effects: [{ type: 'redirect_current' }],
      desc: "Si bloqueges, l'atacant rep la diferència.",
      icon: 'lorc/wave-crest.svg',
    }),
    action({
      id: 'aigua-sanadora', name: 'Aigua sanadora', skillId: 'waterbender',
      unlock: 3, type: ActionType.Focus, speed: 1, dice: d(2, 6),
      effects: [{ type: 'heal' }],
      desc: 'Tria un aliat: recupera 2d6 PV.',
      icon: 'lorc/healing.svg',
    }),
    action({
      id: 'preso-de-gel', name: 'Presó de gel', skillId: 'waterbender',
      unlock: 4, type: ActionType.Atac, speed: 0, dice: d(2, 6),
      effects: [{ type: 'lock_on_hit', params: { types: [ActionType.Atac] } }],
      desc: "Si encerta, l'objectiu no pot jugar Atacs el torn següent.",
      icon: 'lorc/ice-cube.svg',
    }),
    action({
      id: 'domini-de-la-sang', name: 'Domini de la sang', skillId: 'waterbender',
      unlock: 5, type: ActionType.Focus, speed: -2,
      effects: [{ type: 'bloodbend' }],
      desc: 'Tria un enemic: el torn següent, els seus atacs van contra els seus aliats. Puges un nivell de fatiga. Esgotat, no la pots jugar.',
      icon: 'lorc/bleeding-heart.svg',
    }),
  ],
  effects: AIGUA_EFFECTS,
};
