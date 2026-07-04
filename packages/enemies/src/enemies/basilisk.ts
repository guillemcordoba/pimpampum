import { ActionType, AIStrategy } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const BASILISK_SKILL: SkillDefinition = {
  id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', category: 'enemy',
  description: 'La mirada que petrifica i el verí que consumeix.',
  iconPath: ICON + 'delapouite/spiked-dragon-head.svg',
  actions: [
    action({ id: 'esclafament', name: 'Esclafament', skillId: 'basilisk', unlock: 1, type: ActionType.Atac, speed: -3, damage: d(2, 6), fatigueCost: 1, desc: '', icon: 'lorc/stoned-skull.svg' }),
    action({ id: 'mirada-petrificant', name: 'Mirada petrificant', skillId: 'basilisk', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [{ type: 'contested_stun', params: { turns: 3, target: 'enemies' } }], desc: 'Per cada enemic: **d20+{A} teva > d20+habilitat enemiga**: queda petrificat (salta els 3 propers torns).', icon: 'lorc/gaze.svg' }),
    action({ id: 'mossegada-verinosa', name: 'Mossegada verinosa', skillId: 'basilisk', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 8), effects: [{ type: 'poison_on_hit', params: { damage: 4, turns: 1, name: 'verí' } }], desc: "Si impacta, l'enemic perd 4 de vida addicional el següent torn.", icon: 'lorc/snake-bite.svg' }),
    action({ id: 'cop-de-cua', name: 'Cop de cua', skillId: 'basilisk', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 8), targetCount: 3, fatigueCost: 2, desc: 'Colpeja fins a 3 enemics amb la cua.', icon: 'lorc/spiked-tail.svg' }),
    action({ id: 'regeneracio', name: 'Regeneració', skillId: 'basilisk', unlock: 1, type: ActionType.Focus, speed: -3, effects: [{ type: 'heal', params: { amount: 10, target: 'self' } }], desc: 'Cura 10 vides.', icon: 'lorc/snake.svg' }),
  ],
};

export const BASILISK: EnemyModule = {
  template: { id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', iconPath: ICON + 'delapouite/spiked-dragon-head.svg', role: 'solitari', difficulty: 2.10, skills: ['basilisk'], suggestedLevel: 45, naturalArmor: 4, aiStrategy: AIStrategy.Power },
  skills: [BASILISK_SKILL],
};
