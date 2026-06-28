import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Nigromant — a doom-mark curse-caster. Marca de la perdició condemns a foe
 * (`condemnat`: disadvantage on all rolls, −3 speed, no Focus, reapable);
 * Mà de la tomba reaps every doomed enemy through armour and defenses;
 * Putrefacció is a contagious decay; Xuclar la vida drains to self-heal;
 * Invocar l'ombra de l'infern condemns the whole enemy party. No pets, no
 * defense — a Power-corner attrition controller. See `nigromant-effects.ts`
 * and the engine's condemnat hooks (rollD20For / getEffectiveSpeed / focus-lockout).
 */
export const NIGROMANT: SkillDefinition = {
  id: 'nigromant', displayName: 'Nigromant', classCss: 'nigromant', category: 'player',
  description: 'Llançador de malediccions: condemna els enemics, els podreix i els xucla la vida.',
  iconPath: ICON_PREFIX + 'lorc/grim-reaper.svg',
  actions: [
    action({
      id: 'marca-de-la-perdicio', name: 'Marca de la perdició', skillId: 'nigromant',
      unlock: 1, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna un enemic (2 torns): tira amb desavantatge i té −3 de velocitat.',
      icon: 'lorc/cursed-star.svg',
    }),
    action({
      id: 'ma-de-la-tomba', name: 'Mà de la tomba', skillId: 'nigromant',
      unlock: 12, type: ActionType.Atac, speed: 1, damage: d(1, 4), targetCount: 99,
      effects: [{ type: 'reap', params: {} }],
      desc: 'Afecta tots els enemics condemnats. Ignora defenses i armadura.',
      icon: 'lorc/evil-hand.svg',
    }),
    action({
      id: 'profecia-de-la-fi', name: 'Profecia de la fi', skillId: 'nigromant',
      unlock: 25, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'cancel_action', params: {} }],
      desc: "Cancel·la l'acció d'un enemic.",
      icon: 'lorc/dead-eye.svg',
    }),
    action({
      id: 'putrefaccio', name: 'Putrefacció', skillId: 'nigromant',
      unlock: 40, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'plague', params: { damage: 2, turns: 3 } }],
      desc: "L'objectiu perd 2 PV al final de cada torn durant 3 torns. Cada torn, d20 < 10: s'estén a un nou enemic.",
      icon: 'lorc/virus.svg',
    }),
    action({
      id: 'xuclar-la-vida', name: 'Xuclar la vida', skillId: 'nigromant',
      unlock: 55, type: ActionType.Atac, speed: 0, damage: d(1, 8),
      effects: [{ type: 'lifedrain', params: { ratio: 1 } }],
      desc: 'Recuperes tants PV com el mal infligit.',
      icon: 'lorc/life-tap.svg',
    }),
    action({
      id: 'invocar-ombra-infern', name: "Invocar l'ombra de l'infern", skillId: 'nigromant',
      unlock: 72, type: ActionType.Focus, speed: -5, fatigueCost: 3, targetCount: 99,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna tots els enemics (2 torns): tiren amb desavantatge i tenen −3 de velocitat.',
      icon: 'lorc/tentacles-skull.svg',
    }),
  ],
};
