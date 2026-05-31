import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const FURTIVITAT: SkillDefinition = {
  id: 'furtivitat', displayName: 'Furtivitat', classCss: 'murri', category: 'player',
  description: "Emboscades, esquives i control des de l'ombra.",
  iconPath: 'icons/000000/transparent/1x1/lorc/hidden.svg',
  actions: [
    action({ id: 'emboscada-coordinada', name: 'Emboscada coordinada', skillId: 'furtivitat', unlock: 1, type: ActionType.Focus, speed: 3, fatigueCost: 2, effects: [{ type: 'mark_target', params: { amount: 7, turns: 1 } }], desc: "Tria un enemic. Tots els aliats que l'ataquin aquest torn reben +1d8+2 a la seva tirada.", icon: 'lorc/hidden.svg' }),
    action({ id: 'bomba-de-fum', name: 'Bomba de fum', skillId: 'furtivitat', unlock: 10, type: ActionType.Focus, speed: -1, fatigueCost: 2, effects: [
      { type: 'skill_mod', params: { kind: 'speed', amount: -8, target: 'enemies', duration: 1 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -8, target: 'enemies', duration: 1 } },
    ], desc: 'Enemics {V}-8 i {D}-8 el següent torn.', icon: 'lorc/dust-cloud.svg' }),
    action({ id: 'clon-de-fum', name: 'Clon de fum', skillId: 'furtivitat', unlock: 20, type: ActionType.Defensa, speed: 2, rollBonus: 3, effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 3, duration: 'nextTurn' } }], desc: "L'atacant rep {V}-3 el següent torn.", icon: 'lorc/two-shadows.svg' }),
    action({ id: 'el-lusio', name: 'El·lusió', skillId: 'furtivitat', unlock: 30, type: ActionType.Focus, speed: 5, rollBonus: 5, fatigueCost: 2, effects: [
      { type: 'evasion', params: {} },
      { type: 'skill_mod', params: { kind: 'speed', amount: 5, target: 'self', duration: 'nextTurn' } },
      { type: 'skill_mod', params: { kind: 'attack', amount: 4, target: 'self', duration: 'nextTurn' } },
    ], desc: 'Esquiva tots els atacs rebuts aquest torn. {V}+5 i {A}+4 el següent torn.', icon: 'lorc/ghost.svg' }),
  ],
};

export const MUSICA_ENCANTADA: SkillDefinition = {
  id: 'musica-encantada', displayName: 'Música Encantada', classCss: 'trobador', category: 'player',
  description: 'Cançons que fereixen i confonen els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/lyre.svg',
  actions: [
    action({ id: 'acord-dissonant', name: 'Acord dissonant', skillId: 'musica-encantada', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 4), fatigueCost: 2, effects: [
      { type: 'debuff_on_hit', params: { kind: 'attack', amount: 1, target: 'enemies', duration: 'nextTurn' } },
      { type: 'debuff_on_hit', params: { kind: 'defense', amount: 1, target: 'enemies', duration: 'nextTurn' } },
      { type: 'debuff_on_hit', params: { kind: 'speed', amount: 1, target: 'enemies', duration: 'nextTurn' } },
    ], desc: 'Si fa mal, tots els enemics reben {A}-1, {A}-1, {D}-1 i {V}-1 el següent torn.', icon: 'lorc/sonic-boom.svg' }),
    action({ id: 'canco-hipnotica', name: 'Cançó hipnòtica', skillId: 'musica-encantada', unlock: 25, type: ActionType.Atac, speed: 0, damage: d(1, 4), fatigueCost: 2, effects: [{ type: 'stun_on_hit', params: { turns: 2 } }], desc: "Si l'atac impacta, l'enemic queda atordit durant els 2 propers torns.", icon: 'lorc/oily-spiral.svg' }),
    action({ id: 'requiem', name: 'Rèquiem', skillId: 'musica-encantada', unlock: 40, type: ActionType.Focus, speed: -4, fatigueCost: 2, effects: [{ type: 'wound_wounded', params: { damage: 1 } }], desc: 'Tots els enemics que hagin perdut vides en perden una altra.', icon: 'lorc/death-note.svg' }),
  ],
};

export const INSPIRACIO: SkillDefinition = {
  id: 'inspiracio', displayName: 'Inspiració', classCss: 'trobador', category: 'player',
  description: 'Cants que curen i enforteixen els companys.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/musical-notes.svg',
  actions: [
    action({ id: 'harmonia-protectora', name: 'Harmonia protectora', skillId: 'inspiracio', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 2, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: 2, target: 'team', duration: 'thisTurn' } }], desc: "Tot l'equip guanya {D}+2 aquest torn.", icon: 'lorc/bell-shield.svg' }),
    action({ id: 'veu-del-valor', name: 'Veu del valor', skillId: 'inspiracio', unlock: 15, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [
      { type: 'heal', params: { amount: 1, target: 'ally' } },
      { type: 'skill_mod', params: { kind: 'attack', amount: 2, target: 'ally', duration: 'restOfCombat' } },
    ], desc: 'Tria un aliat ferit. Cura 1 vida i guanya {A}+2 i {A}+2 per la resta del combat.', icon: 'lorc/rally-the-troops.svg' }),
    action({ id: 'balada-heroica', name: 'Balada heroica', skillId: 'inspiracio', unlock: 30, type: ActionType.Focus, speed: -3, fatigueCost: 2, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 2, target: 'allies', duration: 'restOfCombat' } }], desc: 'Tots els aliats guanyen {A}+2 i {A}+2 per la resta del combat.', icon: 'delapouite/musical-notes.svg' }),
  ],
};

export const SOCIAL_SKILLS: SkillDefinition[] = [FURTIVITAT, MUSICA_ENCANTADA, INSPIRACIO];
