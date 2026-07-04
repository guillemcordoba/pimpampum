import { ActionType, createCharacter, Character } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';
import { pvForLevel } from '../generator.js';

const WOLF_SKILL: SkillDefinition = {
  id: 'wolf', displayName: 'Llop', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: ICON + 'lorc/wolf-head.svg',
  actions: [
    action({ id: 'mossegada-manada', name: 'Mossegada de la manada', skillId: 'wolf', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'pack', params: { per: 1, max: 99, kind: 'damage' } }], desc: '{DAMAGE}+1 per cada llop viu.', icon: 'delapouite/neck-bite.svg' }),
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'wolf', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4), desc: '', icon: 'delapouite/claws.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'wolf', unlock: 1, type: ActionType.Focus, speed: -2, fatigueCost: 2, consumable: true, effects: [{ type: 'summon', params: { factory: makeWolf } }], desc: 'Un sol ús. Crida un llop nou al combat. S\'interromp si rep un atac.', icon: 'lorc/wolf-howl.svg' }),
  ],
};

/** Build a summoned wolf at a modest fixed level (used by the Udol action).
 *  Summoned wolves answer the howl — they don't get to lead one themselves,
 *  which bounds the pack (no summon-stall chains). */
function makeWolf(): Character {
  const level = 20;
  return createCharacter({
    name: 'Llop', classCss: 'llop', category: 'enemy', pv: pvForLevel(level),
    skills: { 'wolf': level },
    actions: WOLF_SKILL.actions.filter(a => a.id !== 'udol'),
    iconPath: ICON + 'lorc/wolf-head.svg',
  });
}

export const WOLF: EnemyModule = {
  template: { id: 'wolf', displayName: 'Llop', classCss: 'llop', iconPath: ICON + 'lorc/wolf-head.svg', role: 'horda', difficulty: 2.81, skills: ['wolf'], suggestedLevel: 18 },
  skills: [WOLF_SKILL],
};
