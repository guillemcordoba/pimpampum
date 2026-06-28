import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const PETRIFICACIO: SkillDefinition = {
  id: 'petrificacio', displayName: 'Petrificació', classCss: 'basilisc', category: 'enemy',
  description: 'La mirada que converteix en pedra.',
  iconPath: ICON + 'lorc/gaze.svg',
  actions: [
    action({ id: 'esclafament', name: 'Esclafament', skillId: 'petrificacio', unlock: 1, type: ActionType.Atac, speed: -3, damage: d(2, 6), fatigueCost: 2, effects: [{ type: 'self_stun', params: { turns: 1 } }], desc: "L'atac més brutal. Saltes el proper torn.", icon: 'lorc/stoned-skull.svg' }),
    action({ id: 'mirada-petrificant', name: 'Mirada petrificant', skillId: 'petrificacio', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 3, effects: [{ type: 'contested_stun', params: { turns: 3, target: 'enemies' } }], desc: 'Per cada enemic: **d20+{A} teva > d20+habilitat enemiga**: queda petrificat (salta els 3 propers torns).', icon: 'lorc/gaze.svg' }),
  ],
};

const VERI: SkillDefinition = {
  id: 'veri', displayName: 'Verí', classCss: 'basilisc', category: 'enemy',
  description: 'Atacs verinosos i regeneració reptiliana.',
  iconPath: ICON + 'lorc/snake-bite.svg',
  actions: [
    action({ id: 'mossegada-verinosa', name: 'Mossegada verinosa', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 8), effects: [{ type: 'poison_on_hit', params: { damage: 1, turns: 1, name: 'verí' } }], desc: "Si fa ferida, l'enemic perd una vida addicional al final del següent torn.", icon: 'lorc/snake-bite.svg' }),
    action({ id: 'cop-de-cua', name: 'Cop de cua', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 8), targetCount: 3, fatigueCost: 2, desc: 'Colpeja fins a 3 enemics amb la cua.', icon: 'lorc/spiked-tail.svg' }),
    action({ id: 'escames-impenetrables', name: 'Escames impenetrables', skillId: 'veri', unlock: 1, type: ActionType.Defensa, speed: 4, rollBonus: 4, desc: '', icon: 'lorc/lizardman.svg' }),
    action({ id: 'regeneracio', name: 'Regeneració', skillId: 'veri', unlock: 1, type: ActionType.Focus, speed: -4, effects: [{ type: 'heal', params: { amount: 2, target: 'self' } }], desc: 'Cura 2 vides.', icon: 'lorc/snake.svg' }),
  ],
};

export const BASILISK: EnemyModule = {
  template: { id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', iconPath: ICON + 'delapouite/spiked-dragon-head.svg', basePV: 24, skills: ['petrificacio', 'veri'], suggestedLevel: 45 },
  skills: [PETRIFICACIO, VERI],
};
