import { ActionType, Character, EffectContext, EffectHandler, STATUS_KINDS, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { BURN_KEY } from '../effects/cremat.js';
import { warded } from '../effects/generic.js';

/**
 * MESTRE DE L'AIGUA — the user's design ("Maestre de l'aigua — conceptes de
 * cartes", 2026-11-01, and the cards they picked on 2026-11-02): the
 * defensive, healing bender, fire's opposite. A plain wall, a fog that hides
 * whoever it saved, eight arms over the whole party; a spring that heals and
 * puts out burns, and the tide that raises everyone; an ice trap, the
 * forbidden bloodbending; and the tsunami. The numbers are this file's, on the
 * dice ladder (intentions.md).
 */

const SKILL_ID = 'waterbender';

/** `defender` covers `who` for the rest of the round, with this card's dice. */
function guardWith(defender: Character, who: Character, ctx: EffectContext): void {
  who.guards.push({ defender, action: ctx.action });
}

const THICK_FOG_KEY = 'boira-espessa';
const HIDDEN_NEXT_ROUND: StatusBehavior = {
  untargetable: ref => ref.entry.remaining <= 1,
  // The engine's untargetable kind, one round late: priced as that kind.
  positionValue: (ref, board) => STATUS_KINDS.untargetable.positionValue!(ref, board),
};

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

  // 5 · Boira espessa: the blow the defense held was lost in the fog, and so
  // is whoever it covered — next round no enemy can aim at them.
  thick_fog: {
    onDefend(ctx) {
      const hidden = ctx.targets[0];
      if (!hidden?.isAlive()) return;
      // Set this round: its end takes one, and the next round is the hidden one.
      hidden.setStatus(THICK_FOG_KEY, 1, 2, undefined, HIDDEN_NEXT_ROUND);
      ctx.engine.log('defense', `La boira s'empassa ${hidden.name}: el torn següent ningú no el troba.`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // 7 · Marea de vida: one roll heals the whole party, the fallen too.
  tide_of_life: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const amount = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice);
      for (const a of ctx.engine.rosterOf(ctx.source)) ctx.engine.heal(a, amount);
      ctx.engine.log('focus', `La marea de ${ctx.source.name} cobreix tot el grup: +${amount} PV a cadascú.`, ctx.source.team);
    },
    aiWeight(ctx) {
      const pvs = [ctx.actor, ...ctx.allies].map(a => a.currentPV / a.maxPV);
      return pvs.filter(p => p < 0.7).length >= 2 ? 1.4 : pvs.some(p => p < 0.5) ? 0.8 : -1;
    },
  },

  // 3 · Trampa de gel (with the generic `not_twice_running`): the chosen
  // enemy is frozen — it loses its next turn.
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
      effects: [{ type: 'not_twice_running', params: { card: 'trampa-de-gel' } }, { type: 'ice_trap' }],
      desc: "L'enemic que triïs queda congelat: perd el torn següent. No la pots jugar dos torns seguits.",
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
      id: 'boira-espessa', name: 'Boira espessa', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'thick_fog' }],
      desc: 'Si aguanta, el torn següent cap enemic no pot atacar qui defenses.',
      icon: 'delapouite/fog.svg',
    }),
    action({
      id: 'llanca-de-gel', name: 'Llança de gel', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, dice: d(3, 4),
      desc: '',
      icon: 'lorc/ice-spear.svg',
    }),
    action({
      id: 'marea-de-vida', name: 'Marea de vida', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus, dice: d(3, 4, 1),
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'tide_of_life' }],
      desc: 'Puges 1 nivell de fatiga. Cura tot el teu grup, també els caiguts.',
      icon: 'lorc/grouped-drops.svg',
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
