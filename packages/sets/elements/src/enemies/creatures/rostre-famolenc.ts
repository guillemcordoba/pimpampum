import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/** The fifth body (Pain's Preta path): it drinks what is thrown at it. */
const FAMOLENC_SKILL: SkillDefinition = {
  id: 'rostre-famolenc', displayName: 'Rostre Famolenc', classCss: 'por', category: 'enemy',
  description: "El cinquè cos del Senyor de la Por: es beu el que li llancen.",
  iconPath: ICON + 'lorc/vampire-dracula.svg',
  actions: [
    action({ id: 'cop-famolenc', name: 'Cop', skillId: 'rostre-famolenc', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(1, 6), desc: '', icon: 'lorc/punch.svg' }),
    action({
      id: 'absorbir', name: 'Absorbir', skillId: 'rostre-famolenc',
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 6),
      effects: [{ type: 'self_guard' }, { type: 'heal_on_block', params: { amount: 4 } }],
      desc: 'Només et protegeix a tu. Si bloqueges, recuperes 4 PV.',
      icon: 'lorc/vortex.svg',
    }),
  ],
};

export const ROSTRE_FAMOLENC: EnemyDefinition = {
  id: 'rostre-famolenc', displayName: 'Rostre Famolenc', classCss: 'por', iconPath: ICON + 'lorc/vampire-dracula.svg',
  bulk: 1.0,
  skills: [FAMOLENC_SKILL],
};
