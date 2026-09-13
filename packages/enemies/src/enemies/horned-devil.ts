import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyDefinition, ICON } from '../types.js';

const HORNED_DEVIL_SKILL: SkillDefinition = {
  id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', category: 'enemy',
  description: "Forques brutals i flames de l'avern.",
  iconPath: ICON + 'delapouite/devil-mask.svg',
  actions: [
    action({ id: 'forquilla-del-diable', name: 'Forquilla del diable', skillId: 'horned-devil', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 6), effects: [{ type: 'undefendable_on_hit', params: { turns: 2 } }], desc: "Si fa ferida, l'enemic no pot ser defensat durant 2 torns.", icon: 'lorc/trident.svg' }),
    action({ id: 'defensa-diabolica', name: 'Defensa diabòlica', skillId: 'horned-devil', unlock: 3, type: ActionType.Defensa, speed: 1, dice: d(3, 6), effects: [
      { type: 'debuff_on_block', params: { kind: 'attack', amount: 3, duration: 'nextTurn' } },
      { type: 'retaliate_wound', params: { amount: 2 } },
    ], desc: "Si bloqueges un atac, l'atacant rep 2 de dany ignorant l'armadura i té {A}−3 el proper torn.", icon: 'lorc/spiked-armor.svg' }),
    action({ id: 'ale-de-l-infern', name: "Alè de l'infern", skillId: 'horned-devil', unlock: 2, type: ActionType.Atac, speed: 0, dice: d(1, 6), targetCount: 3, desc: 'Afecta a 3 enemics.', icon: 'lorc/fire-breath.svg' }),
    action({ id: 'pilar-de-foc', name: 'Pilar de foc', skillId: 'horned-devil', unlock: 4, type: ActionType.Atac, speed: -2, dice: d(2, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'attack', amount: 3, duration: 2 } }], desc: "Si impacta, l'enemic té {A}−3 durant 2 torns.", icon: 'lorc/fire-zone.svg' }),
    action({ id: 'flames-de-l-avern', name: "Flames de l'avern", skillId: 'horned-devil', unlock: 5, type: ActionType.Focus, speed: -5, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -4, target: 'enemies', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -4, target: 'enemies', duration: 'restOfCombat' } },
    ], desc: 'Tots els enemics tenen {A}−4 i {D}−4 per la resta del combat.', icon: 'lorc/flame-tunnel.svg' }),
  ],
};

export const HORNED_DEVIL: EnemyDefinition = {
  id: 'horned-devil', displayName: 'Diable Banyut', classCss: 'diable-banyut', iconPath: ICON + 'delapouite/devil-mask.svg',
  /** ~295 kg — a cornugon is 9 ft, 600 lb (3e) / 700 lb (PF). */
  bulk: 1.62,
  skills: [HORNED_DEVIL_SKILL],
};
