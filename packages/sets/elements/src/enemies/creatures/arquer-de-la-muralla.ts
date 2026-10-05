import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The wall's archers (the Yuyan): they do not kill, they PIN — an arrow through
 * a sleeve into a wall leaves a bender unable to swing or to guard. Their
 * threat is the turn you lose, not the wound.
 */
const ARQUER_EFFECTS: Record<string, EffectHandler> = {
  // Fletxa precisa: through the gaps in any armour.
  precise_shot: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.ignoreArmor = true; },
    aiWeight() { return 0.6; },
  },
};

const ARQUER_SKILL: SkillDefinition = {
  id: 'arquer-de-la-muralla', displayName: 'Arquer de la muralla', classCss: 'arquer', category: 'enemy',
  description: "No maten: claven. Una fletxa per la màniga contra la paret, i el mestre més temut no pot ni moure el braç.",
  iconPath: ICON + 'lorc/bowman.svg',
  actions: [
    action({
      id: 'fletxa-precisa', name: 'Fletxa precisa', skillId: 'arquer-de-la-muralla',
      unlock: 1, type: ActionType.Atac, speed: 5, dice: d(1, 6),
      effects: [{ type: 'precise_shot' }],
      desc: "Ignora l'armadura.",
      icon: 'lorc/arrowhead.svg',
    }),
    action({
      id: 'clavar-a-la-paret', name: 'Clavar a la paret', skillId: 'arquer-de-la-muralla',
      unlock: 2, type: ActionType.Atac, speed: 3, dice: d(1, 4),
      effects: [{ type: 'lock_on_hit', params: { types: [ActionType.Atac, ActionType.Defensa] } }],
      desc: "Si encerta, l'objectiu no pot jugar Atacs ni Defenses el torn següent.",
      icon: 'lorc/pierced-body.svg',
    }),
    action({
      id: 'pluja-de-fletxes', name: 'Pluja de fletxes', skillId: 'arquer-de-la-muralla',
      unlock: 3, type: ActionType.Atac, speed: -1, dice: d(1, 6), targetCount: 3,
      desc: 'Afecta tres enemics.',
      icon: 'lorc/arrow-cluster.svg',
    }),
  ],
  effects: ARQUER_EFFECTS,
};

export const ARQUER_DE_LA_MURALLA: EnemyDefinition = {
  id: 'arquer-de-la-muralla', displayName: 'Arquer de la muralla', classCss: 'arquer', iconPath: ICON + 'lorc/bowman.svg',
  /** ~65 kg — a lean archer. */
  bulk: 0.98,
  skills: [ARQUER_SKILL],
};
