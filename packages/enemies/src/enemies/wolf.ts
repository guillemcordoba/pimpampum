import { ActionType, createCharacter, Character } from '@pimpampum/engine';
import { SkillDefinition, action, d, COP_DESESPERAT } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const WOLF_SKILL: SkillDefinition = {
  id: 'wolf', displayName: 'Llop', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: ICON + 'lorc/wolf-head.svg',
  actions: [
    action({ id: 'mossegada-manada', name: 'Mossegada de la manada', skillId: 'wolf', unlock: 2, type: ActionType.Atac, speed: 1, dice: d(1, 4), effects: [{ type: 'pack', params: { per: 1, max: 5, includeSelf: false } }], desc: '{A}+1 per cada altre llop viu (màx. +5).', icon: 'delapouite/neck-bite.svg' }),
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'wolf', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(1, 2), desc: '', icon: 'delapouite/claws.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'wolf', unlock: 3, type: ActionType.Focus, speed: -2, fatigueCost: 2, consumable: true, effects: [{ type: 'summon', params: { factory: makeWolf, maxTeam: 6 } }], desc: 'Crida un llop nou al combat, fins a un màxim de 6 llops que hagin participat en la batalla.', icon: 'lorc/wolf-howl.svg' }),
  ],
};

/** Build a summoned wolf (used by the Udol action). Summoned wolves answer the
 *  howl — they don't get to lead one themselves, which bounds the pack (no
 *  summon-stall chains). */
function makeWolf(): Character {
  return createCharacter({
    name: 'Llop', classCss: 'llop', category: 'enemy', pv: 5,
    skills: { 'wolf': 2 }, // knows urpa + pack bite; no udol (excluded below anyway)
    actions: [...WOLF_SKILL.actions.filter(a => a.id !== 'udol'), COP_DESESPERAT],
    iconPath: ICON + 'lorc/wolf-head.svg',
  });
}

export const WOLF: EnemyModule = {
  template: { id: 'wolf', displayName: 'Llop', classCss: 'llop', iconPath: ICON + 'lorc/wolf-head.svg', role: 'horda', threat: 0.037, skills: ['wolf'], basePV: 5, suggestedLevel: 3 },
  skills: [WOLF_SKILL],
};
