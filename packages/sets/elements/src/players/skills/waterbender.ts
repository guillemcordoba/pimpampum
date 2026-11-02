import { ActionType, Character, EffectContext, EffectHandler, applyKind } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { BURN_KEY } from '../effects/cremat.js';
import { warded } from '../effects/generic.js';

/**
 * MESTRE DE L'AIGUA — the user's design ("Maestre de l'aigua — conceptes de
 * cartes", 2026-11-01): the defensive, healing bender, fire's opposite. Three
 * defenses that grow from a plain wall to an ice shell to eight arms over the
 * whole party; a spring that heals and puts out burns; fog, an ice trap, the
 * forbidden bloodbending; and the tsunami. The numbers are this file's, on the
 * dice ladder (intentions.md).
 */

const SKILL_ID = 'waterbender';

/** `defender` covers `who` for the rest of the round, with this card's dice. */
function guardWith(defender: Character, who: Character, ctx: EffectContext): void {
  who.guards.push({ defender, action: ctx.action });
}

const WATER_EFFECTS: Record<string, EffectHandler> = {
  // 4 · Font curativa (with the generic `heal`): the healed ally's Cremat
  // goes out too.
  douse: {
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.hasStatus(BURN_KEY)) return;
      t.clearStatus(BURN_KEY);
      ctx.engine.log('focus', `L'aigua apaga el foc de ${t.name}.`, ctx.source.team);
    },
  },

  // 7 · Boira: next round no enemy can aim at the bender's allies — only at
  // the bender, the one left outside the fog.
  fog: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      // Set in the Focus step: the round's end takes one, the next round remains.
      for (const a of ctx.engine.alliesOf(ctx.source, false)) applyKind(a, 'untargetable', 'boira', 1, 2);
      ctx.engine.log('focus', `${ctx.source.name} aixeca una boira espessa sobre els seus aliats.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length ? 0.6 : -1; },
  },

  // 3 · Trampa de gel: the chosen enemy is frozen — it loses its next turn.
  ice_trap: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      t.skipTurns = Math.max(t.skipTurns, 1);
      ctx.engine.log('focus', `El gel atrapa ${t.name}: queda congelat i perd el torn següent.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length ? 0.8 : 0; },
  },

  // 8 · Forma de pop: one defense over every ally at once.
  octopus_form: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      for (const ally of ctx.engine.alliesOf(ctx.source, false)) guardWith(ctx.source, ally, ctx);
      ctx.engine.log('defense', `${ctx.source.name} estén vuit braços d'aigua sobre tot el grup.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 0.9 : 0.2; },
  },
};

export const WATERBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: "Mestre de l'aigua", classCss: 'aigua', category: 'player',
  description: "L'aigua protegeix, cura i espera: quan s'alça, ho arrossega tot.",
  iconPath: 'icons/000000/transparent/1x1/lorc/water-splash.svg',
  actions: [
    action({
      id: 'fuet-d-aigua', name: "Fuet d'aigua", skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, dice: d(1, 4),
      desc: '',
      icon: 'lorc/whiplash.svg',
    }),
    action({
      id: 'mur-d-aigua', name: "Mur d'aigua", skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(2, 4),
      desc: '',
      icon: 'lorc/splashy-stream.svg',
    }),
    action({
      id: 'trampa-de-gel', name: 'Trampa de gel', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'ice_trap' }],
      desc: "Puges 1 nivell de fatiga. L'enemic que triïs queda congelat: perd el torn següent.",
      icon: 'lorc/frozen-block.svg',
    }),
    action({
      id: 'font-curativa', name: 'Font curativa', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Focus, dice: d(2, 4, 2),
      effects: [{ type: 'heal' }, { type: 'douse' }],
      desc: 'Cura un aliat i li apaga Cremat.',
      icon: 'lorc/heart-drop.svg',
    }),
    action({
      id: 'cupula-de-gel', name: 'Cúpula de gel', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Defensa, dice: d(2, 6, 2),
      desc: '',
      icon: 'lorc/ice-shield.svg',
    }),
    action({
      id: 'llanca-de-gel', name: 'Llança de gel', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, dice: d(3, 4),
      desc: '',
      icon: 'lorc/ice-spear.svg',
    }),
    action({
      id: 'boira', name: 'Boira', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus,
      effects: [{ type: 'fog' }],
      desc: 'El torn següent, els enemics no poden atacar els teus aliats.',
      icon: 'delapouite/fog.svg',
    }),
    action({
      id: 'forma-de-pop', name: 'Forma de pop', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Defensa, dice: d(2, 8),
      effects: [{ type: 'octopus_form' }],
      desc: 'Defensa tots els aliats.',
      icon: 'lorc/octopus.svg',
    }),
    action({
      id: 'control-de-la-sang', name: 'Control de la sang', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus,
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'turn_on_allies' }],
      desc: "Puges 1 nivell de fatiga. El torn següent, els atacs de l'enemic que triïs van contra els seus aliats.",
      icon: 'lorc/puppet.svg',
    }),
    action({
      id: 'tsunami', name: 'Tsunami', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(5, 4), targetCount: 99,
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/big-wave.svg',
    }),
  ],
  effects: WATER_EFFECTS,
};
