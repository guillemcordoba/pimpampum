import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/** The second body (Pain's Asura path): iron limbs, blades and a missile. */
const FERRO_SKILL: SkillDefinition = {
  id: 'rostre-de-ferro', displayName: 'Rostre de Ferro', classCss: 'por', category: 'enemy',
  description: 'El segon cos del Senyor de la Por: braços de ferro, fulles i un míssil.',
  iconPath: ICON + 'lorc/robot-grab.svg',
  actions: [
    action({ id: 'bracos-de-ferro', name: 'Braços de ferro', skillId: 'rostre-de-ferro', unlock: 1, type: ActionType.Atac, speed: 1, dice: d(1, 6), targetCount: 3, desc: 'Afecta tres enemics.', icon: 'lorc/mechanical-arm.svg' }),
    action({ id: 'missil', name: 'Míssil', skillId: 'rostre-de-ferro', unlock: 2, type: ActionType.Atac, speed: -2, dice: d(2, 6), desc: '', icon: 'lorc/missile-swarm.svg' }),
  ],
};

export const ROSTRE_DE_FERRO: EnemyDefinition = {
  id: 'rostre-de-ferro', displayName: 'Rostre de Ferro', classCss: 'por', iconPath: ICON + 'lorc/robot-grab.svg',
  /** Iron grafted onto the corpse. */
  naturalArmor: 1,
  bulk: 1.0,
  skills: [FERRO_SKILL],
};
