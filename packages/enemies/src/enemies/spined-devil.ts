import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const SPINED_DEVIL_SKILL: SkillDefinition = {
  id: 'spined-devil', displayName: 'Diable Espinós', classCss: 'diable-espinos', category: 'enemy',
  description: 'Foc demoníac que crema i persisteix.',
  iconPath: ICON + 'lorc/fire-ray.svg',
  actions: [
    action({ id: 'espina-de-foc', name: 'Espina de foc', skillId: 'spined-devil', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'crossfire', params: { max: 3 } }], desc: "Guanyes +1 a l'atac per cada aliat que també ataqui (màx +3).", icon: 'lorc/fire-ray.svg' }),
    action({ id: 'mossegada-en-vol', name: 'Mossegada en vol', skillId: 'spined-devil', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 4, -1), rollBonus: 4, fatigueCost: 2, effects: [{ type: 'evasion_after_attack', params: {} }], desc: "Després d'atacar, esquives tots els atacs aquest torn.", icon: 'lorc/bat-wing.svg' }),
    action({ id: 'cortina-de-foc', name: 'Cortina de foc', skillId: 'spined-devil', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 3, desc: '', icon: 'lorc/fire-shield.svg' }),
    action({ id: 'foc-persistent', name: 'Foc persistent', skillId: 'spined-devil', unlock: 1, type: ActionType.Focus, speed: 0, effects: [{ type: 'dot', params: { damage: 1, turns: 1, target: 'enemy', name: 'foc persistent' } }], desc: "L'enemic seleccionat perd una vida al començament del pròxim torn.", icon: 'lorc/flame-spin.svg' }),
  ],
};

export const SPINED_DEVIL: EnemyModule = {
  template: { id: 'spined-devil', displayName: 'Diable Espinós', classCss: 'diable-espinos', iconPath: ICON + 'lorc/imp.svg', role: 'elit', difficulty: 1.03, skills: ['spined-devil'], suggestedLevel: 22 },
  skills: [SPINED_DEVIL_SKILL],
};
