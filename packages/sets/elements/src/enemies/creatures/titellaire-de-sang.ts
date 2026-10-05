import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The old woman of the inn (Hama): a waterbender who learnt, in a prison
 * without water, that a body is mostly water. Under the full moon she works
 * people like puppets — and turns friends against each other.
 */
const TITELLAIRE_SKILL: SkillDefinition = {
  id: 'titellaire-de-sang', displayName: 'Titellaire de sang', classCss: 'aigua', category: 'enemy',
  description: "Va aprendre, en una presó sense aigua, que un cos és sobretot aigua. Sota la lluna plena, mou la gent com titelles.",
  iconPath: ICON + 'lorc/puppet.svg',
  actions: [
    action({ id: 'fuet-de-gel', name: 'Fuet de gel', skillId: 'titellaire-de-sang', unlock: 1, type: ActionType.Atac, speed: 2, dice: d(2, 6), desc: '', icon: 'lorc/water-bolt.svg' }),
    action({ id: 'agulles-de-gel', name: 'Agulles de gel', skillId: 'titellaire-de-sang', unlock: 2, type: ActionType.Atac, speed: 0, dice: d(2, 4), targetCount: 6, desc: 'Afecta tots els enemics.', icon: 'lorc/ice-spear.svg' }),
    action({
      id: 'titella-de-sang', name: 'Titella de sang', skillId: 'titellaire-de-sang',
      unlock: 3, type: ActionType.Focus, speed: -2,
      effects: [{ type: 'turn_on_allies' }],
      desc: 'Tria un enemic: el torn següent, els seus atacs van contra els seus aliats.',
      icon: 'lorc/puppet.svg',
    }),
  ],
};

export const TITELLAIRE_DE_SANG: EnemyDefinition = {
  id: 'titellaire-de-sang', displayName: 'Titellaire de sang', classCss: 'aigua', iconPath: ICON + 'lorc/puppet.svg',
  /** ~45 kg — a frail old woman, which is the disguise. */
  bulk: 0.86,
  skills: [TITELLAIRE_SKILL],
};
