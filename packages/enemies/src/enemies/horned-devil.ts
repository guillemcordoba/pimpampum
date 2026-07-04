import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const HORNED_DEVIL_SKILL: SkillDefinition = {
  id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', category: 'enemy',
  description: "Forques brutals i flames de l'avern.",
  iconPath: ICON + 'delapouite/devil-mask.svg',
  actions: [
    action({ id: 'forquilla-del-diable', name: 'Forquilla del diable', skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 8), effects: [{ type: 'undefendable_on_hit', params: { turns: 2 } }], desc: "Si fa ferida, l'enemic no pot ser defensat durant 2 torns.", icon: 'lorc/trident.svg' }),
    action({ id: 'sentencia-infernal', name: 'Sentència infernal', skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: -4, damage: d(2, 6), fatigueCost: 2, effects: [{ type: 'double_wound', params: { amount: 4 } }], desc: "Si fa ferida, l'enemic perd 2 vides en total.", icon: 'lorc/flaming-trident.svg' }),
    action({ id: 'defensa-diabolica', name: 'Defensa diabòlica', skillId: 'horned-devil', unlock: 1, type: ActionType.Defensa, speed: 1, rollBonus: 4, effects: [{ type: 'retaliate_wound', params: { amount: 1 } }], desc: "Si bloqueges un atac, l'atacant perd una vida.", icon: 'lorc/spiked-armor.svg' }),
    action({ id: 'ale-de-l-infern', name: "Alè de l'infern", skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 4), targetCount: 3, fatigueCost: 2, desc: 'Crema tres enemics amb un alè de foc infernal.', icon: 'lorc/fire-breath.svg' }),
    action({ id: 'pilar-de-foc', name: 'Pilar de foc', skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: -2, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'attack', amount: 3, duration: 2 } }], desc: "Si fa ferida, l'enemic perd {A}-3 durant 2 torns.", icon: 'lorc/fire-zone.svg' }),
    action({ id: 'flames-de-l-avern', name: "Flames de l'avern", skillId: 'horned-devil', unlock: 1, type: ActionType.Focus, speed: -3, fatigueCost: 2, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemies', duration: 'restOfCombat' } }], desc: "Invoca les flames de l'avern. Tots els enemics perden {D}-2 permanentment.", icon: 'lorc/flame-tunnel.svg' }),
  ],
};

export const HORNED_DEVIL: EnemyModule = {
  template: { id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', iconPath: ICON + 'delapouite/devil-mask.svg', role: 'solitari', difficulty: 1.2, skills: ['horned-devil'], suggestedLevel: 40 },
  skills: [HORNED_DEVIL_SKILL],
};
