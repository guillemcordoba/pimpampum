import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyDefinition, ICON } from '../types.js';

const GOBLIN_SHAMAN_SKILL: SkillDefinition = {
  id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: ICON + 'delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'goblin-shaman', unlock: 3, type: ActionType.Atac, speed: 0, dice: d(2, 6), desc: '', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'goblin-shaman', unlock: 4, type: ActionType.Focus, speed: -3, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: 0, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } },
      { type: 'weapon_buff', params: { amount: 3, target: 'self', name: 'possessió' } },
    ], desc: '{A}+1d6+3 per la resta del combat.', icon: 'lorc/daemon-skull.svg' }),
    action({ id: 'sang-encesa', name: 'Sang encesa', skillId: 'goblin-shaman', unlock: 2, type: ActionType.Focus, speed: -4, effects: [
      { type: 'weapon_buff', params: { amount: 2, target: 'allies', turns: -1, name: 'sang-encesa' } },
      { type: 'dot', params: { damage: 2, target: 'allies', turns: -1, name: 'sagnia' } },
    ], desc: 'Tots els aliats: {A}+2 la resta del combat, però perden 2 PV cada torn.', icon: 'skoll/blood.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'goblin-shaman', unlock: 1, type: ActionType.Atac, speed: -4, dice: d(1, 6), targetCount: 3, desc: 'Afecta a 3 enemics que triïs.', icon: 'lorc/flame-spin.svg' }),
  ],
};

export const GOBLIN_SHAMAN: EnemyDefinition = {
  id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', iconPath: ICON + 'delapouite/skull-staff.svg',
  /** ~18 kg — goblin stock, older and leaner. */
  bulk: 0.64,
  skills: [GOBLIN_SHAMAN_SKILL],
};
