import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const HORNED_DEVIL_SKILL: SkillDefinition = {
  id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', category: 'enemy',
  description: "Forques brutals i flames de l'avern.",
  iconPath: ICON + 'delapouite/devil-mask.svg',
  actions: [
    action({ id: 'forquilla-del-diable', name: 'Forquilla del diable', skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 6), effects: [{ type: 'undefendable_on_hit', params: { turns: 2 } }], desc: "Si fa ferida, l'enemic no pot ser defensat durant 2 torns.", icon: 'lorc/trident.svg' }),
    action({ id: 'sentencia-infernal', name: 'Sentència infernal', skillId: 'horned-devil', unlock: 5, type: ActionType.Atac, speed: -4, dice: d(3, 6), fatigueCost: 2, effects: [{ type: 'double_wound', params: { amount: 4 } }], desc: "Si fa ferida, l'enemic perd 4 PV addicionals.", icon: 'lorc/flaming-trident.svg' }),
    action({ id: 'defensa-diabolica', name: 'Defensa diabòlica', skillId: 'horned-devil', unlock: 3, type: ActionType.Defensa, speed: 1, dice: d(2, 8), rollBonus: 2, effects: [{ type: 'debuff_on_block', params: { kind: 'attack', amount: 3, duration: 'nextTurn' } }], desc: "Si bloqueges un atac, l'atacant té {A}−3 el proper torn.", icon: 'lorc/spiked-armor.svg' }),
    action({ id: 'ale-de-l-infern', name: "Alè de l'infern", skillId: 'horned-devil', unlock: 2, type: ActionType.Atac, speed: 0, dice: d(1, 6), targetCount: 3, fatigueCost: 2, desc: 'Afecta a 3 enemics.', icon: 'lorc/fire-breath.svg' }),
    action({ id: 'pilar-de-foc', name: 'Pilar de foc', skillId: 'horned-devil', unlock: 4, type: ActionType.Atac, speed: -2, dice: d(2, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'attack', amount: 3, duration: 2 } }], desc: "Si impacta, l'enemic té {A}−3 durant 2 torns.", icon: 'lorc/fire-zone.svg' }),
    action({ id: 'flames-de-l-avern', name: "Flames de l'avern", skillId: 'horned-devil', unlock: 6, type: ActionType.Focus, speed: -5, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -4, target: 'enemies', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -4, target: 'enemies', duration: 'restOfCombat' } },
    ], desc: 'Tots els enemics tenen {A}−4 i {D}−4 per la resta del combat.', icon: 'lorc/flame-tunnel.svg' }),
  ],
};

export const HORNED_DEVIL: EnemyModule = {
  template: { id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', iconPath: ICON + 'delapouite/devil-mask.svg', role: 'solitari', threat: 0.203, skills: ['horned-devil'], basePV: 34, suggestedLevel: 6 },
  skills: [HORNED_DEVIL_SKILL],
};
