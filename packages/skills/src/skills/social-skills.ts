import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const FURTIVITAT: SkillDefinition = {
  id: 'furtivitat', displayName: 'Furtivitat', classCss: 'murri', category: 'player',
  description: "Emboscades, esquives i control des de l'ombra.",
  iconPath: 'icons/000000/transparent/1x1/lorc/hidden.svg',
  actions: [
    action({ id: 'el-lusio', name: 'El·lusió', skillId: 'furtivitat', unlock: 1, type: ActionType.Focus, speed: 12, rollBonus: 8, effects: [{ type: 'evasion', params: {} }, { type: 'skill_mod', params: { amount: 6, target: 'self', duration: 'nextTurn' } }], desc: 'Esquives tots els atacs aquest torn i et prepares pel següent.', icon: 'lorc/ghost.svg' }),
    action({ id: 'clon-de-fum', name: 'Clon de fum', skillId: 'furtivitat', unlock: 10, type: ActionType.Defensa, speed: 11, rollBonus: 1, effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 4 } }], desc: "Un clon de fum desvia l'atac i alenteix l'agressor.", icon: 'lorc/two-shadows.svg' }),
    action({ id: 'emboscada-coordinada', name: 'Emboscada coordinada', skillId: 'furtivitat', unlock: 25, type: ActionType.Focus, speed: 11, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 8, target: 'ally', duration: 'thisTurn' } }], desc: "Prepares una emboscada: un aliat ataca molt millor aquest torn.", icon: 'lorc/hidden.svg' }),
    action({ id: 'bomba-de-fum', name: 'Bomba de fum', skillId: 'furtivitat', unlock: 35, type: ActionType.Focus, speed: 8, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: -6, target: 'enemies', duration: 1 } }], desc: 'Una bomba de fum desorienta tots els enemics el següent torn.', icon: 'lorc/dust-cloud.svg' }),
  ],
};

export const MUSICA_ENCANTADA: SkillDefinition = {
  id: 'musica-encantada', displayName: 'Música Encantada', classCss: 'trobador', category: 'player',
  description: 'Cançons que fereixen i confonen els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/lyre.svg',
  actions: [
    action({ id: 'acord-dissonant', name: 'Acord dissonant', skillId: 'musica-encantada', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 4), effects: [{ type: 'debuff_on_hit', params: { amount: 5, duration: 'nextTurn' } }], desc: 'Un acord que fereix i desconcentra.', icon: 'lorc/sonic-boom.svg' }),
    action({ id: 'canco-hipnotica', name: 'Cançó hipnòtica', skillId: 'musica-encantada', unlock: 20, type: ActionType.Atac, speed: 6, damage: d(1, 4), effects: [{ type: 'stun_on_hit', params: { turns: 1 } }], desc: "Una melodia que adorm l'enemic colpejat.", icon: 'lorc/oily-spiral.svg' }),
    action({ id: 'requiem', name: 'Rèquiem', skillId: 'musica-encantada', unlock: 40, type: ActionType.Focus, speed: 3, effects: [{ type: 'dot', params: { damage: 3, turns: 1, target: 'enemies', name: 'rèquiem' } }], desc: 'Una melodia fúnebre que fereix tots els enemics.', icon: 'lorc/death-note.svg' }),
  ],
};

export const INSPIRACIO: SkillDefinition = {
  id: 'inspiracio', displayName: 'Inspiració', classCss: 'trobador', category: 'player',
  description: 'Cants que curen i enforteixen els companys.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/musical-notes.svg',
  actions: [
    action({ id: 'harmonia-protectora', name: 'Harmonia protectora', skillId: 'inspiracio', unlock: 1, type: ActionType.Defensa, speed: 9, rollBonus: 1, targetCount: 3, desc: 'Una harmonia que protegeix diversos aliats.', icon: 'lorc/bell-shield.svg' }),
    action({ id: 'veu-del-valor', name: 'Veu del valor', skillId: 'inspiracio', unlock: 15, type: ActionType.Focus, speed: 7, effects: [{ type: 'heal', params: { amount: 2, target: 'ally' } }, { type: 'skill_mod', params: { amount: 6, target: 'ally', duration: 'restOfCombat' } }], desc: 'Cures i inspires un aliat ferit la resta del combat.', icon: 'lorc/rally-the-troops.svg' }),
    action({ id: 'balada-heroica', name: 'Balada heroica', skillId: 'inspiracio', unlock: 30, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { amount: 6, target: 'allies', duration: 'restOfCombat' } }], desc: "Una balada que enforteix tots els aliats la resta del combat.", icon: 'delapouite/musical-notes.svg' }),
  ],
};

export const SOCIAL_SKILLS: SkillDefinition[] = [FURTIVITAT, MUSICA_ENCANTADA, INSPIRACIO];
