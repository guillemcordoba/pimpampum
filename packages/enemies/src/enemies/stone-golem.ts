import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, standingCoverAction } from '@pimpampum/skills';
import { EnemyDefinition, ICON } from '../types.js';

const STONE_GOLEM_SKILL: SkillDefinition = {
  id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', category: 'enemy',
  description: 'La força implacable de la pedra.',
  iconPath: ICON + 'lorc/fist.svg',
  actions: [
    action({ id: 'cop-de-pedra', name: 'Cop de pedra', skillId: 'stone-golem', unlock: 1, type: ActionType.Atac, speed: -1, dice: d(2, 6), desc: '', icon: 'lorc/fist.svg' }),
    action({ id: 'terratremol', name: 'Terratrèmol', skillId: 'stone-golem', unlock: 3, type: ActionType.Atac, speed: -2, dice: d(1, 8), targetCount: 3, fatigueCost: 2, desc: 'Colpeja el terra amb força, afectant fins a 3 enemics.', icon: 'lorc/quake-stomp.svg' }),
    standingCoverAction({ skillId: 'stone-golem', unlock: 2 }),
    action({ id: 'enduriment', name: 'Enduriment', skillId: 'stone-golem', unlock: 4, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'defense', amount: 8, target: 'self', duration: 'restOfCombat' } },
    ], desc: 'Endureix el cos de pedra permanentment: {D}+8.', icon: 'lorc/stone-sphere.svg' }),
  ],
};

export const STONE_GOLEM: EnemyDefinition = {
  id: 'stone-golem', displayName: 'Gòlem de Pedra', classCss: 'golem-de-pedra', iconPath: ICON + 'delapouite/rock-golem.svg',
  /** ~907 kg — 9 ft and 2000 lb of rock. */
  bulk: 2.35,
  skills: [STONE_GOLEM_SKILL],
};
