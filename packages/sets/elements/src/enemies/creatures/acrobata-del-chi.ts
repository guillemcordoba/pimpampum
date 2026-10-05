import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The circus acrobat turned chi-blocker: never still, never where you aim, and
 * every touch numbs something. What she takes from a bender is the bending.
 */
const ACROBATA_SKILL: SkillDefinition = {
  id: 'acrobata-del-chi', displayName: 'Acròbata del chi', classCss: 'chi', category: 'enemy',
  description: 'Mai quieta, mai on apuntes. Cada toc adorm alguna cosa, i el que li pren a un mestre és el domini.',
  iconPath: ICON + 'lorc/juggler.svg',
  actions: [
    action({
      id: 'cops-rapids', name: 'Cops ràpids', skillId: 'acrobata-del-chi',
      unlock: 1, type: ActionType.Atac, speed: 4, dice: d(1, 4),
      effects: [{ type: 'strike_twice' }],
      desc: 'Colpeja dues vegades.',
      icon: 'lorc/punch.svg',
    }),
    action({
      id: 'salt-enrere', name: 'Salt enrere', skillId: 'acrobata-del-chi',
      unlock: 2, type: ActionType.Defensa, speed: 5, dice: d(3, 4),
      effects: [{ type: 'self_guard' }],
      desc: 'Només et protegeix a tu.',
      icon: 'lorc/backward-time.svg',
    }),
    action({
      id: 'tallar-el-domini', name: 'Tallar el domini', skillId: 'acrobata-del-chi',
      unlock: 3, type: ActionType.Atac, speed: 3, dice: d(1, 6),
      effects: [{ type: 'lock_on_hit', params: { types: [ActionType.Focus], turns: 2 } }],
      desc: "Si encerta, l'objectiu no pot jugar Focus durant 2 torns.",
      icon: 'lorc/nerve.svg',
    }),
  ],
};

export const ACROBATA_DEL_CHI: EnemyDefinition = {
  id: 'acrobata-del-chi', displayName: 'Acròbata del chi', classCss: 'chi', iconPath: ICON + 'lorc/juggler.svg',
  /** ~45 kg — a slight acrobat. */
  bulk: 0.86,
  skills: [ACROBATA_SKILL],
};
