import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Bloquejador de chi — no bending at all: seven pressure points, and the
 * strongest bender is just a person with a numb arm. Quick, light blows that
 * each take something out of the target's hand for a turn, climbing from a
 * flurry to a full shutdown.
 */
export const CHI_BLOCKER: SkillDefinition = {
  id: 'chi-blocker', displayName: 'Bloquejador de chi', classCss: 'chi', category: 'player',
  description: 'Set punts de pressió, i el mestre més poderós és només una persona amb un braç adormit.',
  iconPath: ICON_PREFIX + 'lorc/fist.svg',
  actions: [
    action({
      id: 'cops-de-punt', name: 'Cops de punt', skillId: 'chi-blocker',
      unlock: 1, type: ActionType.Atac, speed: 4, dice: d(1, 4),
      effects: [{ type: 'strike_twice' }],
      desc: 'Colpeja dues vegades.',
      icon: 'lorc/punch.svg',
    }),
    action({
      id: 'salt-acrobatic', name: 'Salt acrobàtic', skillId: 'chi-blocker',
      unlock: 2, type: ActionType.Defensa, speed: 5, dice: d(3, 4),
      effects: [{ type: 'lock_on_block', params: { types: [ActionType.Atac] } }],
      desc: "Si bloqueges, l'atacant no pot jugar Atacs el torn següent.",
      icon: 'lorc/acrobatic.svg',
    }),
    action({
      id: 'bloqueig-de-chi', name: 'Bloqueig de chi', skillId: 'chi-blocker',
      unlock: 3, type: ActionType.Atac, speed: 3, dice: d(2, 4),
      effects: [{ type: 'slip_guard' }, { type: 'lock_on_hit', params: { types: [ActionType.Focus, ActionType.Defensa], turns: 2 } }],
      desc: "No es pot defensar. Si encerta, l'objectiu no pot jugar Focus ni Defenses durant 2 torns.",
      icon: 'lorc/nerve.svg',
    }),
    action({
      id: 'cama-adormida', name: 'Braç adormit', skillId: 'chi-blocker',
      unlock: 4, type: ActionType.Atac, speed: 2, dice: d(2, 6),
      effects: [{ type: 'lock_on_hit', params: { types: [ActionType.Atac], turns: 2 } }],
      desc: "Si encerta, l'objectiu no pot jugar Atacs durant 2 torns.",
      icon: 'lorc/leg.svg',
    }),
    action({
      id: 'desconnexio', name: 'Desconnexió', skillId: 'chi-blocker',
      unlock: 5, type: ActionType.Atac, speed: 3, dice: d(2, 4),
      effects: [{ type: 'stun_on_hit', params: { turns: 1 } }],
      desc: "Si encerta, l'objectiu perd el torn següent.",
      icon: 'lorc/knockout.svg',
    }),
  ],
};
