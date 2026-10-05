import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/** What the Rostre de les Bèsties calls: a beast made of fear, whose claws
 *  leave a hero alone. Never fielded on its own. */
const BESTIA_SKILL: SkillDefinition = {
  id: 'bestia-de-la-por', displayName: 'Bèstia de la por', classCss: 'por', category: 'enemy',
  description: 'Una bèstia feta de por. Qui toca, queda sol.',
  iconPath: ICON + 'lorc/beast-eye.svg',
  actions: [
    action({
      id: 'urpa-de-la-por', name: 'Urpa de la por', skillId: 'bestia-de-la-por',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(2, 4),
      effects: [{ type: 'isolate_on_hit' }],
      desc: "Si encerta, ningú no pot protegir l'objectiu el torn següent.",
      icon: 'lorc/claw-slashes.svg',
    }),
  ],
};

export const BESTIA_DE_LA_POR: EnemyDefinition = {
  id: 'bestia-de-la-por', displayName: 'Bèstia de la por', classCss: 'por', iconPath: ICON + 'lorc/beast-eye.svg',
  /** ~100 kg of shadow. */
  bulk: 1.13,
  skills: [BESTIA_SKILL],
};
