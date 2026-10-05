import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The great eel of the straits (the Unagi): it sweeps a whole deck with a
 * spout of water, and when it is hurt it dives where no one can follow.
 */
const SERP_SKILL: SkillDefinition = {
  id: 'serp-de-les-marees', displayName: 'Serp de les marees', classCss: 'serp', category: 'enemy',
  description: "Escombra tota una coberta amb un doll d'aigua; quan la fereixen, se'n va on ningú no la pot seguir.",
  iconPath: ICON + 'lorc/sea-serpent.svg',
  actions: [
    action({ id: 'mossegada-de-serp', name: 'Mossegada de serp', skillId: 'serp-de-les-marees', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(3, 8), desc: '', icon: 'lorc/fangs.svg' }),
    action({
      id: 'doll-d-aigua', name: "Doll d'aigua", skillId: 'serp-de-les-marees',
      unlock: 2, type: ActionType.Atac, speed: 1, dice: d(3, 6), targetCount: 6,
      effects: [{ type: 'debuff_on_hit', params: { kind: 'speed', amount: 2, duration: 'nextTurn' } }],
      desc: 'Afecta tots els enemics. Qui rebi dany, {V}−2 el torn següent.',
      icon: 'lorc/water-fountain.svg',
    }),
    action({
      id: 'submergir-se', name: "Submergir-se", skillId: 'serp-de-les-marees',
      unlock: 3, type: ActionType.Focus, speed: 3,
      effects: [{ type: 'vanish', params: { heal: 6 } }],
      desc: "Aquest torn ningú no t'ataca, i recuperes 6 PV. No la pots jugar dos torns seguits.",
      icon: 'lorc/water-drop.svg',
    }),
  ],
};

export const SERP_DE_LES_MAREES: EnemyDefinition = {
  id: 'serp-de-les-marees', displayName: 'Serp de les marees', classCss: 'serp', iconPath: ICON + 'lorc/sea-serpent.svg',
  /** ~5 t — an eel that can wrap a ship. */
  bulk: 4.15,
  skills: [SERP_SKILL],
};
