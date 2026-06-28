import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const XAMANISME_GOBLIN: SkillDefinition = {
  id: 'xamanisme-goblin', displayName: 'Xamanisme Goblin', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: ICON + 'delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(2, 4, -2), desc: 'Un llamp cru.', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Focus, speed: -3, fatigueCost: 2, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 3, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } }], desc: '{A}+1d6+3 per la resta del combat.', icon: 'lorc/daemon-skull.svg' }),
    action({ id: 'set-de-sang', name: 'Set de sang', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Focus, speed: -4, fatigueCost: 2, effects: [{ type: 'wound_wounded', params: { damage: 1 } }], desc: 'Cada enemic que hagi perdut una vida durant aquest combat perd una altra vida.', icon: 'skoll/blood.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: -4, damage: d(1, 4, -2), targetCount: 3, fatigueCost: 2, desc: 'Afecta a 3 enemics que triïs.', icon: 'lorc/flame-spin.svg' }),
    action({ id: 'absorvir-dolor', name: 'Absorvir dolor', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Defensa, speed: 3, rollBonus: 4, effects: [{ type: 'buff_on_block', params: { kind: 'defense', amount: 1, duration: 'restOfCombat', target: 'self' } }], desc: 'Si absorveix un atac, {D}+1 per la resta del combat.', icon: 'lorc/back-pain.svg' }),
  ],
};

export const GOBLIN_SHAMAN: EnemyModule = {
  template: { id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', iconPath: ICON + 'delapouite/skull-staff.svg', basePV: 8, skills: ['xamanisme-goblin'], suggestedLevel: 25 },
  skills: [XAMANISME_GOBLIN],
};
