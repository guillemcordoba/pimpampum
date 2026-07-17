import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const GOBLIN_SKILL: SkillDefinition = {
  id: 'goblin', displayName: 'Goblin', classCss: 'goblin', category: 'enemy',
  description: 'Lluita en horda: febles sols, perillosos en grup.',
  iconPath: ICON + 'delapouite/goblin-head.svg',
  actions: [
    action({ id: 'atac-horda', name: 'Atac de la horda', skillId: 'goblin', unlock: 2, type: ActionType.Atac, speed: 0, dice: d(1, 4), effects: [{ type: 'crossfire', params: { max: 5 } }], desc: '{A}+1 per cada altre aliat viu (màx. +5).', icon: 'delapouite/goblin-head.svg' }),
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'goblin', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(1, 6), desc: '', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'protegir-clan', name: 'Protegir el clan', skillId: 'goblin', unlock: 3, type: ActionType.Defensa, speed: 2, dice: d(2, 6), rollBonus: 2, desc: '', icon: 'willdabeast/round-shield.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'goblin', unlock: 4, type: ActionType.Focus, speed: 2, dice: d(2, 6), effects: [{ type: 'nimble_escape', params: { amount: 2 } }], desc: "Esquives tots els atacs aquest torn (2d6). El següent torn, {A}+2 per cada goblin que s'hagi amagat.", icon: 'lorc/hidden.svg' }),
  ],
};

export const GOBLIN: EnemyModule = {
  template: { id: 'goblin', displayName: 'Goblin', classCss: 'goblin', iconPath: ICON + 'delapouite/goblin-head.svg', role: 'horda', threat: 0.129, skills: ['goblin'], basePV: 6, suggestedLevel: 4 },
  skills: [GOBLIN_SKILL],
};
