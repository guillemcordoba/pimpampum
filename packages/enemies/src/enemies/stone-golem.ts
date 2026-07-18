import { ActionType, AIStrategy } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const STONE_GOLEM_SKILL: SkillDefinition = {
  id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', category: 'enemy',
  description: 'La força implacable de la pedra.',
  iconPath: ICON + 'lorc/fist.svg',
  actions: [
    action({ id: 'cop-de-pedra', name: 'Cop de pedra', skillId: 'stone-golem', unlock: 1, type: ActionType.Atac, speed: -1, dice: d(2, 6), desc: '', icon: 'lorc/fist.svg' }),
    action({ id: 'destrossa', name: 'Destrossa', skillId: 'stone-golem', unlock: 5, type: ActionType.Atac, speed: -3, dice: d(2, 8), fatigueCost: 2, effects: [{ type: 'double_wound', params: { amount: 3 } }], desc: "Si fa ferida, l'enemic perd 3 PV addicionals.", icon: 'lorc/thor-fist.svg' }),
    action({ id: 'terratremol', name: 'Terratrèmol', skillId: 'stone-golem', unlock: 3, type: ActionType.Atac, speed: -2, dice: d(1, 8), targetCount: 3, fatigueCost: 2, desc: 'Colpeja el terra amb força, afectant fins a 3 enemics.', icon: 'lorc/quake-stomp.svg' }),
    action({ id: 'mur-de-pedra', name: 'Mur de pedra', skillId: 'stone-golem', unlock: 2, type: ActionType.Defensa, speed: -1, dice: d(2, 6), rollBonus: 1, effects: [{ type: 'retaliate_wound', params: { amount: 1 } }], desc: 'Qui el colpeja perd 1 PV.', icon: 'delapouite/stone-wall.svg' }),
    action({ id: 'enduriment', name: 'Enduriment', skillId: 'stone-golem', unlock: 4, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'defense', amount: 2, target: 'self', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'attack', amount: 1, target: 'self', duration: 'restOfCombat' } },
    ], desc: 'Endureix el cos de pedra permanentment: {D}+2, {A}+1.', icon: 'lorc/stone-sphere.svg' }),
  ],
};

export const STONE_GOLEM: EnemyModule = {
  template: { id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', iconPath: ICON + 'delapouite/rock-golem.svg', role: 'elit', threat: 0.186, skills: ['stone-golem'], basePV: 17, suggestedLevel: 5, aiStrategy: AIStrategy.Protect },
  skills: [STONE_GOLEM_SKILL],
};
