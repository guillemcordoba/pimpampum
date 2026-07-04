import { ActionType, AIStrategy } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const STONE_GOLEM_SKILL: SkillDefinition = {
  id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', category: 'enemy',
  description: 'La força implacable de la pedra.',
  iconPath: ICON + 'lorc/fist.svg',
  actions: [
    action({ id: 'cop-de-pedra', name: 'Cop de pedra', skillId: 'stone-golem', unlock: 1, type: ActionType.Atac, speed: -1, damage: d(1, 6), desc: 'Un cop contundent de pedra.', icon: 'lorc/fist.svg' }),
    action({ id: 'destrossa', name: 'Destrossa', skillId: 'stone-golem', unlock: 1, type: ActionType.Atac, speed: -3, damage: d(1, 8), fatigueCost: 2, effects: [{ type: 'double_wound', params: { amount: 3 } }], desc: 'Cop devastador que causa 2 ferides si fa mal.', icon: 'lorc/thor-fist.svg' }),
    action({ id: 'terratremol', name: 'Terratrèmol', skillId: 'stone-golem', unlock: 1, type: ActionType.Atac, speed: -2, damage: d(1, 4), targetCount: 3, fatigueCost: 2, desc: 'Colpeja el terra amb força, afectant fins a 3 enemics.', icon: 'lorc/quake-stomp.svg' }),
    action({ id: 'mur-de-pedra', name: 'Mur de pedra', skillId: 'stone-golem', unlock: 1, type: ActionType.Defensa, speed: -1, rollBonus: 2, effects: [{ type: 'retaliate_wound', params: { amount: 1 } }], desc: 'El cos de pedra fa mal als atacants que colpegen el gòlem.', icon: 'delapouite/stone-wall.svg' }),
    action({ id: 'enduriment', name: 'Enduriment', skillId: 'stone-golem', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'defense', amount: 2, target: 'self', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'attack', amount: 1, target: 'self', duration: 'restOfCombat' } },
    ], desc: 'Endureix el cos de pedra permanentment: {D}+2, {A}+1.', icon: 'lorc/stone-sphere.svg' }),
  ],
};

export const STONE_GOLEM: EnemyModule = {
  template: { id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', iconPath: ICON + 'delapouite/rock-golem.svg', role: 'elit', difficulty: 1.14, skills: ['stone-golem'], suggestedLevel: 35, aiStrategy: AIStrategy.Protect },
  skills: [STONE_GOLEM_SKILL],
};
