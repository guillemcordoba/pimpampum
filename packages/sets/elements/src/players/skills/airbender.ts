import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Mestre de l'aire — airbending is baguazhang: circle, evade, never be where
 * the blow lands. The monks taught it would never be used to destroy, so its
 * blows are light, its cards are the fastest in the game, and its signature
 * protects everyone at once.
 *
 * The monasteries are gone. One of their novices survived and became el
 * Senyor de la Por: his first card is this kit's first card, turned (see
 * `enemies/creatures/senyor-de-la-por.ts`).
 */
export const PALMELL_D_AIRE_ICON = 'lorc/wind-slap.svg';

export const AIRBENDER: SkillDefinition = {
  id: 'airbender', displayName: "Mestre de l'aire", classCss: 'aire', category: 'player',
  description: "Els monjos ensenyaven a deixar anar: la por, la ràbia, el cos que vol aturar el cop. No hi siguis quan arribi.",
  iconPath: ICON_PREFIX + 'lorc/whirlwind.svg',
  actions: [
    action({
      id: 'palmell-d-aire', name: "Palmell d'aire", skillId: 'airbender',
      unlock: 1, type: ActionType.Atac, speed: 4, dice: d(1, 6),
      desc: '',
      icon: PALMELL_D_AIRE_ICON,
    }),
    action({
      id: 'esquivar-en-espiral', name: 'Esquivar en espiral', skillId: 'airbender',
      unlock: 2, type: ActionType.Defensa, speed: 4, dice: d(3, 4),
      effects: [{ type: 'buff_on_block', params: { kind: 'speed', amount: 3, duration: 'nextTurn' } }],
      desc: 'Si bloqueges, {V}+3 el torn següent.',
      icon: 'lorc/dodge.svg',
    }),
    action({
      id: 'escuter-d-aire', name: "Escúter d'aire", skillId: 'airbender',
      unlock: 3, type: ActionType.Focus, speed: 5,
      effects: [{ type: 'vanish', params: { attack: 3 } }],
      desc: "Aquest torn ningú no t'ataca. El torn següent, {A}+3.",
      icon: 'lorc/wind-hole.svg',
    }),
    action({
      id: 'cicl-o', name: 'Cicló', skillId: 'airbender',
      unlock: 4, type: ActionType.Atac, speed: 1, dice: d(2, 4), targetCount: 6,
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/tornado.svg',
    }),
    action({
      id: 'esfera-d-aire', name: "Esfera d'aire", skillId: 'airbender',
      unlock: 5, type: ActionType.Defensa, speed: 5, dice: d(3, 6), targetCount: 3,
      desc: 'Protegeix fins a tres aliats.',
      icon: 'lorc/vortex.svg',
    }),
  ],
};
