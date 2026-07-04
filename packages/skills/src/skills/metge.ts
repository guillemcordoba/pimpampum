import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * Metge de campanya — a battlefield medic: bandages under fire and combat
 * stimulants. A complementary support skill (caps at ~20). Cures de camp uses
 * the generic roll-heal (interruptible like any Focus — a medic hit while
 * working loses the patient); Injecció d'adrenalina makes an ally's attack
 * action execute twice via the `adrenalina` status behaviour (generic
 * attackRepeats seam) at the price of +4 fatigue on the receiver — the crash
 * is the fatigue cliff itself: adrenaline borrows energy, it doesn't create it.
 */
// The stimmed ally's attack action runs one extra full pass over its
// still-living targets. Consumed on use; expires at round end otherwise.
const ADRENALINA: StatusBehavior = {
  attackRepeats(ctx) {
    ctx.holder.clearStatus('adrenalina');
    ctx.engine.log('info', `L'adrenalina dispara ${ctx.holder.name}: ataca una segona vegada!`, ctx.holder.team);
    return 1;
  },
};

const METGE_EFFECTS: Record<string, EffectHandler> = {
  // Injecció d'adrenalina: stim another ally. This turn their Atac action
  // executes twice (ADRENALINA behaviour above); the +`fatigue` is charged
  // on the spot. Only Atac doubles — adrenaline makes you hit things, not
  // concentrate better. Unused, the surge fizzles at end of round.
  adrenaline: {
    getTargetRequirement() { return 'ally_other'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const fatigue = num(ctx.params, 'fatigue', 4);
      target.setStatus('adrenalina', 1, 1, undefined, ADRENALINA);
      target.fatigue += fatigue;
      ctx.engine.log('focus', `${target.name} rep una injecció d'adrenalina: atacarà dues vegades aquest torn (+${fatigue} fatiga, ${target.getFatigueStateName()}).`, target.team);
    },
    aiWeight(ctx) { return ctx.allies.length > 0 ? 1.2 : 0; },
  },
};

export const METGE: SkillDefinition = {
  id: 'metge', displayName: 'Metge de campanya', classCss: 'metge', category: 'player',
  description: 'Metge de camp de batalla: embenatges sota foc i estimulants de combat.',
  iconPath: ICON_PREFIX + 'delapouite/first-aid-kit.svg',
  actions: [
    action({
      id: 'cures-de-camp', name: 'Cures de camp', skillId: 'metge',
      unlock: 1, type: ActionType.Focus, speed: 0,
      effects: [{ type: 'heal', params: { mode: 'roll' } }],
      desc: 'Cura un aliat o tu mateix: (d20 + habilitat) ÷ 4 PV.',
      icon: 'lorc/bandage-roll.svg',
    }),
    action({
      id: 'injeccio-adrenalina', name: "Injecció d'adrenalina", skillId: 'metge',
      unlock: 20, type: ActionType.Focus, speed: 5,
      effects: [{ type: 'adrenaline', params: { fatigue: 4 } }],
      desc: "Un aliat executa la seva acció d'atac dues vegades aquest torn, i és ell qui rep els +4 de fatiga.",
      icon: 'lorc/syringe.svg',
    }),
  ],
  effects: METGE_EFFECTS,
};

export const METGE_SKILLS: SkillDefinition[] = [METGE];
