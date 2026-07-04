import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Màgia de gel — the winter witch: cold that cuts, numbs and stills the
 * field. Deliberately plain cards (an escalating frost-ladder design was
 * rejected — "just normal action cards"): a freezing breath that slows what
 * it touches, and one staff-strike that lays hoarfrost under the whole
 * enemy line. Everything rides generic handlers; no skill-specific effects.
 */
export const GEL: SkillDefinition = {
  id: 'gel', displayName: 'Màgia de gel', classCss: 'gel', category: 'player',
  description: "Bruixa de l'hivern: el fred talla, entumeix i atura el camp de batalla.",
  iconPath: ICON_PREFIX + 'lorc/frozen-orb.svg',
  actions: [
    action({
      id: 'ale-de-gebre', name: 'Alè de gebre', skillId: 'gel',
      unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 6),
      effects: [{ type: 'debuff_on_hit', params: { kind: 'speed', amount: 2, duration: 'nextTurn' } }],
      desc: "Si encertes, l'objectiu té −2 de velocitat el torn següent.",
      icon: 'lorc/ice-bolt.svg',
    }),
    action({
      id: 'paisatge-congelat', name: 'Paisatge congelat', skillId: 'gel',
      unlock: 20, type: ActionType.Focus, speed: -2, fatigueCost: 3,
      effects: [{ type: 'skill_mod', params: { kind: 'speed', amount: -3, duration: 2, target: 'enemies' } }],
      desc: 'Tots els enemics tenen −3 de velocitat durant 2 torns.',
      icon: 'lorc/icebergs.svg',
    }),
  ],
};

export const GEL_SKILLS: SkillDefinition[] = [GEL];
