import { ActionType, createCharacter, Character } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const INSTINT_MANADA: SkillDefinition = {
  id: 'instint-manada', displayName: 'Instint de Manada', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: ICON + 'lorc/wolf-head.svg',
  actions: [
    action({ id: 'mossegada-manada', name: 'Mossegada de la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'pack', params: { per: 4, max: 5 } }], desc: "Guanyes +1 a l'atac per cada 4 aliats vius.", icon: 'delapouite/neck-bite.svg' }),
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4, -1), desc: 'Un cop ràpid amb les urpes.', icon: 'delapouite/claws.svg' }),
    action({ id: 'protegir-manada', name: 'Protegir la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Defensa, speed: 1, rollBonus: 2, desc: '', icon: 'lorc/paw-front.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'instint-manada', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 2, effects: [{ type: 'summon', params: { factory: makeWolf } }], desc: 'Crida un llop nou al combat. S\'interromp si rep un atac.', icon: 'lorc/wolf-howl.svg' }),
  ],
};

/** Build a summoned wolf at a modest fixed level (used by the Udol action). */
function makeWolf(): Character {
  return createCharacter({
    name: 'Llop', classCss: 'llop', category: 'enemy', pv: 4,
    skills: { 'instint-manada': 20 },
    actions: INSTINT_MANADA.actions,
    iconPath: ICON + 'lorc/wolf-head.svg',
  });
}

export const WOLF: EnemyModule = {
  template: { id: 'wolf', displayName: 'Llop', classCss: 'llop', iconPath: ICON + 'lorc/wolf-head.svg', basePV: 4, skills: ['instint-manada'], suggestedLevel: 18 },
  skills: [INSTINT_MANADA],
};
