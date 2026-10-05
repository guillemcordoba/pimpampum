import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The eyeless tracker: it hunts by scent and never loses one, and one touch of
 * its tongue leaves a grown bender lying stiff in the road.
 */
const SHIRSHU_SKILL: SkillDefinition = {
  id: 'shirshu', displayName: 'Shirshu', classCss: 'shirshu', category: 'enemy',
  description: "Cec, i no perd mai un rastre. Un toc de la llengua i el mestre queda estès al camí, rígid.",
  iconPath: ICON + 'lorc/mole.svg',
  actions: [
    action({ id: 'urpada', name: 'Urpada', skillId: 'shirshu', unlock: 1, type: ActionType.Atac, speed: 1, dice: d(3, 6), desc: '', icon: 'lorc/claw-slashes.svg' }),
    action({
      id: 'olfacte', name: 'Olfacte', skillId: 'shirshu',
      unlock: 2, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'mark', params: { amount: 2, turns: 2 } }],
      desc: 'Tria un enemic: durant 2 torns, els atacs contra ell +2.',
      icon: 'lorc/sniffing-dog.svg',
    }),
    action({
      id: 'llengua-paralitzant', name: 'Llengua paralitzant', skillId: 'shirshu',
      unlock: 3, type: ActionType.Atac, speed: 3, dice: d(2, 6),
      effects: [{ type: 'stun_on_hit', params: { turns: 1 } }],
      desc: "Si encerta, l'objectiu perd el torn següent.",
      icon: 'lorc/tongue.svg',
    }),
  ],
};

export const SHIRSHU: EnemyDefinition = {
  id: 'shirshu', displayName: 'Shirshu', classCss: 'shirshu', iconPath: ICON + 'lorc/mole.svg',
  /** ~600 kg — a mount two people ride. */
  bulk: 2.05,
  skills: [SHIRSHU_SKILL],
};
