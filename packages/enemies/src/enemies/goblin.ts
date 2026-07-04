import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const GOBLIN_SKILL: SkillDefinition = {
  id: 'goblin', displayName: 'Goblin', classCss: 'goblin', category: 'enemy',
  description: 'Lluita en horda: febles sols, perillosos en grup.',
  iconPath: ICON + 'delapouite/goblin-head.svg',
  actions: [
    action({ id: 'atac-horda', name: 'Atac de la horda', skillId: 'goblin', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(0, 0), effects: [{ type: 'crossfire', params: { kind: 'damage', max: 10 } }], desc: '{DAMAGE}+1 per cada aliat que també ataqui aquest torn.', icon: 'delapouite/goblin-head.svg' }),
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'goblin', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4), desc: '', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'protegir-clan', name: 'Protegir el clan', skillId: 'goblin', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 3, desc: '', icon: 'willdabeast/round-shield.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'goblin', unlock: 1, type: ActionType.Focus, speed: 2, effects: [{ type: 'nimble_escape', params: { amount: 5 } }], desc: "Esquives tots els atacs aquest torn. El següent torn, {A}+5 per cada goblin que s'hagi amagat.", icon: 'lorc/hidden.svg' }),
  ],
};

export const GOBLIN: EnemyModule = {
  template: { id: 'goblin', displayName: 'Goblin', classCss: 'goblin', iconPath: ICON + 'delapouite/goblin-head.svg', role: 'horda', difficulty: 0.77, skills: ['goblin'], suggestedLevel: 20 },
  skills: [GOBLIN_SKILL],
};
