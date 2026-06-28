import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const MALDAT_OSSIA: SkillDefinition = {
  id: 'maldat-ossia', displayName: 'Maldat Òssia', classCss: 'diable-dos', category: 'enemy',
  description: 'Atacs òssis verinosos i defenses esquelètiques.',
  iconPath: ICON + 'lorc/ribcage.svg',
  actions: [
    action({ id: 'fiblo-verinos', name: 'Fibló verinós', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 2, duration: 'restOfCombat' } }], desc: "Si fa ferida, l'enemic perd {D}-2 permanentment.", icon: 'lorc/poison-gas.svg' }),
    action({ id: 'esgarrapada', name: 'Esgarrapada', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4), desc: 'Una esgarrapada ràpida.', icon: 'lorc/claw-slashes.svg' }),
    action({ id: 'defensa-esqueletica', name: 'Defensa esquelètica', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Defensa, speed: 3, rollBonus: 4, desc: '', icon: 'lorc/ribcage.svg' }),
  ],
};

const TERROR: SkillDefinition = {
  id: 'terror', displayName: 'Terror', classCss: 'diable-dos', category: 'enemy',
  description: 'Por sobrenatural que debilita els enemics.',
  iconPath: ICON + 'lorc/screaming.svg',
  actions: [
    action({ id: 'udol-de-terror', name: 'Udol de terror', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'speed', amount: -2, target: 'enemies', duration: 2 } },
    ], desc: 'Tots els enemics reben {A}-2, {A}-2, {D}-2, {V}-2 durant 2 torns.', icon: 'lorc/screaming.svg' }),
    action({ id: 'marca-de-la-mort', name: 'Marca de la mort', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: -1, fatigueCost: 2, effects: [{ type: 'doom_mark', params: { amount: 1, turns: -1 } }], desc: 'Marca un enemic. La pròxima ferida que rebi li costa una vida addicional.', icon: 'lorc/death-zone.svg' }),
  ],
};

export const BONE_DEVIL: EnemyModule = {
  template: { id: 'bone-devil', displayName: "Diable d'Os", classCss: 'diable-dos', iconPath: ICON + 'lorc/daemon-skull.svg', basePV: 12, skills: ['maldat-ossia', 'terror'], suggestedLevel: 30 },
  skills: [MALDAT_OSSIA, TERROR],
};
