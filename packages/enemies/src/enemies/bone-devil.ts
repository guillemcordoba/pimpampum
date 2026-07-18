import { ActionType, AIStrategy } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const BONE_DEVIL_SKILL: SkillDefinition = {
  id: 'bone-devil', displayName: "Diable d'Os", classCss: 'diable-dos', category: 'enemy',
  description: 'Atacs òssis verinosos i por sobrenatural.',
  iconPath: ICON + 'lorc/daemon-skull.svg',
  actions: [
    action({ id: 'fiblo-verinos', name: 'Fibló verinós', skillId: 'bone-devil', unlock: 3, type: ActionType.Atac, speed: 0, dice: d(2, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 2, duration: 'restOfCombat' } }], desc: "Si fa ferida, l'enemic perd {D}-2 permanentment.", icon: 'lorc/poison-gas.svg' }),
    action({ id: 'esgarrapada', name: 'Esgarrapada', skillId: 'bone-devil', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(2, 4), desc: '', icon: 'lorc/claw-slashes.svg' }),
    action({ id: 'defensa-esqueletica', name: 'Defensa esquelètica', skillId: 'bone-devil', unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(2, 6), rollBonus: 2, desc: '', icon: 'lorc/ribcage.svg' }),
    action({ id: 'udol-de-terror', name: 'Udol de terror', skillId: 'bone-devil', unlock: 4, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'speed', amount: -2, target: 'enemies', duration: 2 } },
    ], desc: 'Tots els enemics reben {A}−2, {D}−2, {V}−2 durant 2 torns.', icon: 'lorc/screaming.svg' }),
  ],
};

export const BONE_DEVIL: EnemyModule = {
  template: { id: 'bone-devil', displayName: "Diable d'Os", classCss: 'diable-dos', iconPath: ICON + 'lorc/daemon-skull.svg', role: 'elit', threat: 0.101, skills: ['bone-devil'], basePV: 13, suggestedLevel: 4, aiStrategy: AIStrategy.Power },
  skills: [BONE_DEVIL_SKILL],
};
