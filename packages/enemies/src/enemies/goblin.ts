import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const GOBLIN_SKILL: SkillDefinition = {
  id: 'goblin', displayName: 'Goblin', classCss: 'goblin', category: 'enemy',
  description: 'Lluita en horda: febles sols, perillosos en grup.',
  iconPath: ICON + 'delapouite/goblin-head.svg',
  actions: [
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'goblin', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(1, 2), desc: '', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'punyalada-traidora', name: 'Punyalada traïdora', skillId: 'goblin', unlock: 2, type: ActionType.Atac, speed: -1, dice: d(1, 6), effects: [{ type: 'flanking' }], desc: "Si un altre goblin ha atacat el mateix objectiu aquest torn, l'atac és indefensable.", icon: 'lorc/backstab.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'goblin', unlock: 3, type: ActionType.Focus, speed: 2, effects: [{ type: 'nimble_escape', params: { amount: 2 } }], desc: 'Esquives tots els atacs aquest torn. El següent torn, {A}+2.', icon: 'lorc/hidden.svg' }),
    action({ id: 'allau-de-la-horda', name: 'Allau de la horda', skillId: 'goblin', unlock: 4, type: ActionType.Atac, speed: -2, fatigueCost: 2, effects: [{ type: 'crossfire', params: { count: 'attackers', amount: 2 } }], desc: '+2 {A} per cada enemic que ataca.', icon: 'lorc/all-for-one.svg' }),
  ],
};

export const GOBLIN: EnemyModule = {
  template: { id: 'goblin', displayName: 'Goblin', classCss: 'goblin', iconPath: ICON + 'delapouite/goblin-head.svg', role: 'horda', threat: 0.240, skills: ['goblin'], basePV: 16, suggestedLevel: 4, levelThreat: { 2: 0.58, 3: 0.59 }, equipment: ['escut'] },
  skills: [GOBLIN_SKILL],
};
