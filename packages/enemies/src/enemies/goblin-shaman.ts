import { ActionType, AIStrategy } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const GOBLIN_SHAMAN_SKILL: SkillDefinition = {
  id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: ICON + 'delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'goblin-shaman', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 4), desc: '', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'goblin-shaman', unlock: 3, type: ActionType.Focus, speed: -3, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: 0, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } },
      { type: 'weapon_buff', params: { amount: 3, target: 'self', name: 'possessió' } },
    ], desc: '{A}+1d6 i {DAMAGE}+3 per la resta del combat.', icon: 'lorc/daemon-skull.svg' }),
    action({ id: 'set-de-sang', name: 'Set de sang', skillId: 'goblin-shaman', unlock: 4, type: ActionType.Focus, speed: -4, effects: [{ type: 'wound_wounded', params: { damage: 3 } }], desc: 'Cada enemic que hagi perdut PV durant aquest combat perd 3 PV, ignorant defenses i armadura.', icon: 'skoll/blood.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'goblin-shaman', unlock: 2, type: ActionType.Atac, speed: -4, dice: d(1, 4), targetCount: 3, fatigueCost: 2, desc: 'Afecta a 3 enemics que triïs.', icon: 'lorc/flame-spin.svg' }),
  ],
};

export const GOBLIN_SHAMAN: EnemyModule = {
  template: { id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', iconPath: ICON + 'delapouite/skull-staff.svg', role: 'elit', threat: 0.044, skills: ['goblin-shaman'], basePV: 9, suggestedLevel: 4, aiStrategy: AIStrategy.Power },
  skills: [GOBLIN_SHAMAN_SKILL],
};
