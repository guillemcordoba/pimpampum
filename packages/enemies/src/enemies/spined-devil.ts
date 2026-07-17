import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const SPINED_DEVIL_SKILL: SkillDefinition = {
  id: 'spined-devil', displayName: 'Diable Espinós', classCss: 'diable-espinos', category: 'enemy',
  description: 'Foc demoníac que crema i persisteix.',
  iconPath: ICON + 'lorc/fire-ray.svg',
  actions: [
    action({ id: 'mossegada-en-vol', name: 'Mossegada en vol', skillId: 'spined-devil', unlock: 1, type: ActionType.Atac, speed: 4, dice: d(2, 4, -1), rollBonus: 2, desc: '', icon: 'lorc/bat-wing.svg' }),
    action({ id: 'cortina-de-foc', name: 'Cortina de foc', skillId: 'spined-devil', unlock: 2, type: ActionType.Defensa, speed: 2, dice: d(2, 6), rollBonus: 2, desc: '', icon: 'lorc/fire-shield.svg' }),
    action({ id: 'foc-persistent', name: 'Foc persistent', skillId: 'spined-devil', unlock: 3, type: ActionType.Focus, speed: 0, effects: [{ type: 'dot', params: { damage: 3, turns: 3, target: 'enemy', name: 'foc persistent' } }], desc: "L'enemic seleccionat perd 3 PV al final de cada torn durant 3 torns.", icon: 'lorc/flame-spin.svg' }),
  ],
};

export const SPINED_DEVIL: EnemyModule = {
  template: { id: 'spined-devil', displayName: 'Diable Espinós', classCss: 'diable-espinos', iconPath: ICON + 'lorc/imp.svg', role: 'elit', threat: 0.069, skills: ['spined-devil'], basePV: 7, suggestedLevel: 3 },
  skills: [SPINED_DEVIL_SKILL],
};
