import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const PIROMANCIA: SkillDefinition = {
  id: 'piromancia', displayName: 'Piromància', classCss: 'mag', category: 'player',
  description: 'Màgia de foc i llamps, devastadora en àrea.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
  actions: [
    action({ id: 'bola-de-foc', name: 'Bola de foc', skillId: 'piromancia', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 6), desc: 'Una esfera de foc explosiva.', icon: 'lorc/fireball.svg' }),
    action({ id: 'cadena-de-llamps', name: 'Cadena de llamps', skillId: 'piromancia', unlock: 20, type: ActionType.Atac, speed: -1, damage: d(1, 4, -1), targetCount: 2, desc: 'Afecta a 2 enemics que triïs.', icon: 'lorc/lightning-helix.svg' }),
  ],
};

export const CRIOMANCIA: SkillDefinition = {
  id: 'criomancia', displayName: 'Criomància', classCss: 'mag', category: 'player',
  description: 'Màgia de gel, escuts i control arcà.',
  iconPath: 'icons/000000/transparent/1x1/lorc/ice-bolt.svg',
  actions: [
    action({ id: 'missils-arcans', name: 'Míssils arcans', skillId: 'criomancia', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 4, -1), effects: [{ type: 'piercing', params: {} }], desc: "Ignora les cartes de Defensa — sempre colpeja l'objectiu original.", icon: 'lorc/missile-swarm.svg' }),
    action({ id: 'pantalla-protectora', name: 'Pantalla protectora', skillId: 'criomancia', unlock: 10, type: ActionType.Defensa, speed: 2, rollBonus: 3, targetCount: 2, desc: 'Defensa a 2 jugadors que triïs.', icon: 'lorc/magic-shield.svg' }),
    action({ id: 'contrahechis', name: 'Contrahechís', skillId: 'criomancia', unlock: 25, type: ActionType.Focus, speed: 3, effects: [{ type: 'stun', params: { turns: 1, target: 'enemy' } }], desc: "Tria un enemic. Si juga una carta màgica o de Focus, s'anul·la. No afecta atacs físics ni defenses.", icon: 'lorc/magic-gate.svg' }),
    action({ id: 'polimorfisme', name: 'Polimorfisme', skillId: 'criomancia', unlock: 40, type: ActionType.Focus, speed: -3, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -4, target: 'enemy', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -3, target: 'enemy', duration: 2 } },
    ], desc: "Transforma un enemic en un gripau. L'enemic té {A}-4, {A}-4 i {D}-3 els dos pròxims torns.", icon: 'lorc/frog.svg' }),
  ],
};

export const MAGIA_ARCANA: SkillDefinition = {
  id: 'magia-arcana', displayName: 'Màgia Arcana', classCss: 'clergue', category: 'player',
  description: 'Màgia de suport: curació, benediccions i malediccions.',
  iconPath: 'icons/000000/transparent/1x1/lorc/holy-symbol.svg',
  actions: [
    action({ id: 'toc-de-la-mort', name: 'Toc de la mort', skillId: 'magia-arcana', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 4), effects: [
      { type: 'debuff_on_hit', params: { kind: 'attack', amount: 4, duration: 'nextTurn' } },
    ], desc: 'El jugador atacat té {A}-2 i {A}-2 el següent torn.', icon: 'lorc/death-zone.svg' }),
    action({ id: 'curacio', name: 'Curació', skillId: 'magia-arcana', unlock: 10, type: ActionType.Focus, speed: 2, effects: [{ type: 'heal', params: { amount: 2, target: 'ally' } }], desc: 'Tria un aliat. Cura 2 vides.', icon: 'delapouite/healing.svg' }),
    action({ id: 'mantell-divi', name: 'Mantell diví', skillId: 'magia-arcana', unlock: 15, type: ActionType.Defensa, speed: 2, rollBonus: 3, effects: [{ type: 'debuff_on_block', params: { kind: 'attack', amount: 2, duration: 'nextTurn' } }], desc: "L'atacant rep {A}-2 el següent torn.", icon: 'lorc/shining-claw.svg' }),
    action({ id: 'drenatge-vital', name: 'Drenatge vital', skillId: 'magia-arcana', unlock: 25, type: ActionType.Atac, speed: -1, damage: d(1, 6), effects: [{ type: 'lifedrain', params: { ratio: 0.5 } }], desc: 'Si fa mal, cura 1 vida.', icon: 'lorc/bleeding-eye.svg' }),
    action({ id: 'benediccio', name: 'Benedicció', skillId: 'magia-arcana', unlock: 30, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 2, target: 'allies', duration: 'thisTurn' } }], desc: 'Tots els aliats reben {A}+2 i {A}+2 aquest torn.', icon: 'lorc/beams-aura.svg' }),
    action({ id: 'invocacio-espiritual', name: 'Invocació espiritual', skillId: 'magia-arcana', unlock: 40, type: ActionType.Focus, speed: -4, effects: [
      { type: 'skill_mod', params: { kind: 'defense', amount: 0, dice: d(1, 6), target: 'team', duration: 'restOfCombat' } },
    ], desc: 'Tu i tots els aliats guanyeu {D}+1d6 per la resta del combat.', icon: 'lorc/angel-wings.svg' }),
    action({ id: 'maledicccio-mortal', name: 'Maledicció mortal', skillId: 'magia-arcana', unlock: 50, type: ActionType.Focus, speed: -3, effects: [
      { type: 'mark_target', params: { amount: 3, turns: -1 } },
    ], desc: "Tria un enemic. Tu i tots els aliats rebeu +1d4 atacant-lo per la resta del combat.", icon: 'lorc/cursed-star.svg' }),
  ],
};

export const MAGIA_DE_SANG: SkillDefinition = {
  id: 'magia-de-sang', displayName: 'Màgia de Sang', classCss: 'fetiller', category: 'player',
  description: 'Poder a canvi de la pròpia vida.',
  iconPath: 'icons/000000/transparent/1x1/lorc/droplets.svg',
  actions: [
    action({ id: 'explosio', name: 'Explosió', skillId: 'magia-de-sang', unlock: 1, type: ActionType.Atac, speed: -2, damage: d(1, 8), targetCount: 99, effects: [{ type: 'self_damage', params: { amount: 1 } }], desc: 'Atac a tots els personatges (aliats inclosos). Després, et fas 1 ferida a tu mateix.', icon: 'lorc/explosion-rays.svg' }),
    action({ id: 'barrera-arcana', name: 'Barrera arcana', skillId: 'magia-de-sang', unlock: 15, type: ActionType.Defensa, speed: 2, rollBonus: 3, effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 3, duration: 'nextTurn' } }], desc: "Si bloqueges un atac, l'atacant rep {V}-3 el pròxim torn.", icon: 'lorc/shield-reflect.svg' }),
    action({ id: 'magia-de-sang-ritual', name: 'Màgia de sang', skillId: 'magia-de-sang', unlock: 25, type: ActionType.Focus, speed: -3, effects: [
      { type: 'sacrifice', params: { cost: 1, amount: 3, kind: 'attack' } },
      { type: 'skill_mod', params: { kind: 'speed', amount: 2, target: 'self', duration: 'restOfCombat' } },
    ], desc: 'Sacrifica 1 vida. Guanyes {A}+3 i {V}+2 per la resta del combat.', icon: 'lorc/drop.svg' }),
  ],
};

export const MAGIA_FOSCA: SkillDefinition = {
  id: 'magia-fosca', displayName: 'Màgia Fosca', classCss: 'fetiller', category: 'player',
  description: 'Energia corruptora que drena i debilita.',
  iconPath: 'icons/000000/transparent/1x1/lorc/magic-swirl.svg',
  actions: [
    action({ id: 'dard-arca', name: 'Dard arcà', skillId: 'magia-fosca', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 6), desc: "Un dard d'energia negra.", icon: 'lorc/magic-palm.svg' }),
    action({ id: 'raig-corrosiu', name: 'Raig corrosiu', skillId: 'magia-fosca', unlock: 15, type: ActionType.Atac, speed: 0, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 2, duration: 'nextTurn' } }], desc: "Si fa mal, l'enemic rep {D}-2 el pròxim torn.", icon: 'lorc/fire-ray.svg' }),
    action({ id: 'raig-vampiric', name: 'Raig vampíric', skillId: 'magia-fosca', unlock: 25, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'lifedrain', params: { ratio: 0.5 } }], desc: 'Si fa mal, recuperes 1 vida.', icon: 'lorc/drop.svg' }),
  ],
};

export const MAGIA_ARCANA_INNATA: SkillDefinition = {
  id: 'magia-arcana-innata', displayName: 'Màgia Arcana Innata', classCss: 'bruixot', category: 'player',
  description: 'Marques arcanes que es poden detonar.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/fire-spell-cast.svg',
  actions: [
    action({ id: 'robatori-arca', name: 'Robatori arcà', skillId: 'magia-arcana-innata', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'spell_leech_on_hit', params: {} }], desc: "Si fa mal, roba un modificador de l'enemic.", icon: 'lorc/hand.svg' }),
    action({ id: 'marca-bessona', name: 'Marca bessona', skillId: 'magia-arcana-innata', unlock: 15, type: ActionType.Atac, speed: 0, damage: d(1, 4), targetCount: 2, effects: [{ type: 'mark_on_hit', params: { amount: 1 } }], desc: 'Ataca 2 enemics. Els marca amb una marca arcana.', icon: 'lorc/double-face-mask.svg' }),
    action({ id: 'raig-potenciat', name: 'Raig potenciat', skillId: 'magia-arcana-innata', unlock: 20, type: ActionType.Atac, speed: -1, damage: d(1, 8), effects: [{ type: 'mark_on_hit', params: { amount: 1 } }], desc: "Marca l'enemic amb una marca arcana.", icon: 'lorc/beam-wake.svg' }),
    action({ id: 'absorcio-magica', name: 'Absorció màgica', skillId: 'magia-arcana-innata', unlock: 25, type: ActionType.Defensa, speed: 2, rollBonus: 3, effects: [
      { type: 'buff_on_block', params: { kind: 'attack', amount: 2, duration: 'nextTurn', target: 'self' } },
      { type: 'debuff_on_block', params: { kind: 'attack', amount: 2, duration: 'nextTurn' } },
    ], desc: "En defensar d'un atac, guanyes {A}+2 i l'atacant perd {A}+2 el següent torn.", icon: 'lorc/magic-shield.svg' }),
    action({ id: 'detonacio-arcana', name: 'Detonació arcana', skillId: 'magia-arcana-innata', unlock: 35, type: ActionType.Focus, speed: -3, effects: [{ type: 'detonate', params: { perMark: 1 } }], desc: 'Detona totes les marques arcanes. Cada marca causa 1 ferida.', icon: 'sbed/blast.svg' }),
  ],
};

export const MANIPULACIO_TEMPORAL: SkillDefinition = {
  id: 'manipulacio-temporal', displayName: 'Manipulació Temporal', classCss: 'bruixot', category: 'player',
  description: 'Control del temps per alentir els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/time-trap.svg',
  actions: [
    action({ id: 'distorsio-temporal', name: 'Distorsió temporal', skillId: 'manipulacio-temporal', unlock: 1, type: ActionType.Focus, speed: -4, effects: [{ type: 'skill_mod', params: { kind: 'speed', amount: -2, target: 'enemies', duration: 3 } }], desc: 'Tots els enemics reben {V}-2 durant 3 torns.', icon: 'lorc/time-trap.svg' }),
  ],
};

export const ARCANE_SKILLS: SkillDefinition[] = [
  PIROMANCIA, CRIOMANCIA, MAGIA_ARCANA, MAGIA_DE_SANG, MAGIA_FOSCA, MAGIA_ARCANA_INNATA, MANIPULACIO_TEMPORAL,
];
