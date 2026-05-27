import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const PIROMANCIA: SkillDefinition = {
  id: 'piromancia', displayName: 'Piromància', classCss: 'mag', category: 'player',
  description: 'Màgia de foc i llamps, devastadora en àrea.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
  actions: [
    action({ id: 'bola-de-foc', name: 'Bola de foc', skillId: 'piromancia', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 6), desc: 'Una esfera de foc explosiva.', icon: 'lorc/fireball.svg' }),
    action({ id: 'cadena-de-llamps', name: 'Cadena de llamps', skillId: 'piromancia', unlock: 25, type: ActionType.Atac, speed: 6, damage: d(1, 4), targetCount: 2, desc: 'Un llamp que salta entre 2 enemics.', icon: 'lorc/lightning-helix.svg' }),
  ],
};

export const CRIOMANCIA: SkillDefinition = {
  id: 'criomancia', displayName: 'Criomància', classCss: 'mag', category: 'player',
  description: 'Màgia de gel, escuts i control arcà.',
  iconPath: 'icons/000000/transparent/1x1/lorc/ice-bolt.svg',
  actions: [
    action({ id: 'missils-arcans', name: 'Míssils arcans', skillId: 'criomancia', unlock: 1, type: ActionType.Atac, speed: 9, damage: d(1, 4), effects: [{ type: 'piercing', params: {} }], desc: 'Projectils que ignoren les defenses.', icon: 'lorc/missile-swarm.svg' }),
    action({ id: 'pantalla-protectora', name: 'Pantalla protectora', skillId: 'criomancia', unlock: 15, type: ActionType.Defensa, speed: 10, rollBonus: 2, targetCount: 2, desc: 'Una barrera de gel que protegeix 2 aliats.', icon: 'lorc/magic-shield.svg' }),
    action({ id: 'contrahechis', name: 'Contrahexís', skillId: 'criomancia', unlock: 30, type: ActionType.Focus, speed: 11, effects: [{ type: 'stun', params: { turns: 1, target: 'enemy' } }], desc: "Anul·la l'acció d'un enemic aquest torn.", icon: 'lorc/magic-gate.svg' }),
    action({ id: 'polimorfisme', name: 'Polimorfisme', skillId: 'criomancia', unlock: 45, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { amount: -12, target: 'enemy', duration: 2 } }], desc: 'Transformes un enemic en una bestiola indefensa 2 torns.', icon: 'lorc/frog.svg' }),
  ],
};

export const MAGIA_ARCANA: SkillDefinition = {
  id: 'magia-arcana', displayName: 'Màgia Arcana', classCss: 'clergue', category: 'player',
  description: 'Màgia de suport: curació, benediccions i malediccions.',
  iconPath: 'icons/000000/transparent/1x1/lorc/holy-symbol.svg',
  actions: [
    action({ id: 'toc-de-la-mort', name: 'Toc de la mort', skillId: 'magia-arcana', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 4), effects: [{ type: 'debuff_on_hit', params: { amount: 8, duration: 'nextTurn' } }], desc: "L'enemic colpejat lluita pitjor el torn següent.", icon: 'lorc/death-zone.svg' }),
    action({ id: 'curacio', name: 'Curació', skillId: 'magia-arcana', unlock: 10, type: ActionType.Focus, speed: 8, effects: [{ type: 'heal', params: { amount: 3, target: 'ally' } }], desc: 'Cura un aliat (o a tu mateix) 3 PV.', icon: 'delapouite/healing.svg' }),
    action({ id: 'benediccio', name: 'Benedicció', skillId: 'magia-arcana', unlock: 20, type: ActionType.Focus, speed: 8, effects: [{ type: 'skill_mod', params: { amount: 5, target: 'allies', duration: 'thisTurn' } }], desc: "Tots els aliats lluiten millor aquest torn.", icon: 'lorc/beams-aura.svg' }),
    action({ id: 'drenatge-vital', name: 'Drenatge vital', skillId: 'magia-arcana', unlock: 30, type: ActionType.Atac, speed: 6, damage: d(1, 6), effects: [{ type: 'lifedrain', params: { ratio: 0.33 } }], desc: 'Absorbeixes la vitalitat de l\'enemic.', icon: 'lorc/bleeding-eye.svg' }),
    action({ id: 'invocacio-espiritual', name: 'Invocació espiritual', skillId: 'magia-arcana', unlock: 40, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: 6, target: 'team', duration: 'restOfCombat' } }], desc: "Esperits protegeixen tot l'equip la resta del combat.", icon: 'lorc/angel-wings.svg' }),
  ],
};

export const MAGIA_DE_SANG: SkillDefinition = {
  id: 'magia-de-sang', displayName: 'Màgia de Sang', classCss: 'fetiller', category: 'player',
  description: 'Poder a canvi de la pròpia vida.',
  iconPath: 'icons/000000/transparent/1x1/lorc/droplets.svg',
  actions: [
    action({ id: 'explosio', name: 'Explosió', skillId: 'magia-de-sang', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 8), targetCount: 3, desc: 'Una explosió arcana que abasta diversos enemics.', icon: 'lorc/explosion-rays.svg' }),
    action({ id: 'barrera-arcana', name: 'Barrera arcana', skillId: 'magia-de-sang', unlock: 15, type: ActionType.Defensa, speed: 10, rollBonus: 1, effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 6 } }], desc: "Si bloqueges, l'atacant queda alentit.", icon: 'lorc/shield-reflect.svg' }),
    action({ id: 'ritual-de-sang', name: 'Ritual de sang', skillId: 'magia-de-sang', unlock: 30, type: ActionType.Focus, speed: 3, effects: [{ type: 'sacrifice', params: { cost: 3, amount: 12 } }], desc: 'Sacrifiques part de la teva vida per un poder immens.', icon: 'lorc/drop.svg' }),
  ],
};

export const MAGIA_FOSCA: SkillDefinition = {
  id: 'magia-fosca', displayName: 'Màgia Fosca', classCss: 'fetiller', category: 'player',
  description: 'Energia corruptora que drena i debilita.',
  iconPath: 'icons/000000/transparent/1x1/lorc/magic-swirl.svg',
  actions: [
    action({ id: 'dard-arca', name: 'Dard arcà', skillId: 'magia-fosca', unlock: 1, type: ActionType.Atac, speed: 9, damage: d(1, 6), desc: 'Un dard d\'energia negra.', icon: 'lorc/magic-palm.svg' }),
    action({ id: 'raig-corrosiu', name: 'Raig corrosiu', skillId: 'magia-fosca', unlock: 20, type: ActionType.Atac, speed: 7, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 6, duration: 'nextTurn' } }], desc: "Corroeix les defenses de l'enemic.", icon: 'lorc/fire-ray.svg' }),
    action({ id: 'raig-vampiric', name: 'Raig vampíric', skillId: 'magia-fosca', unlock: 35, type: ActionType.Atac, speed: 8, damage: d(1, 4), effects: [{ type: 'lifedrain', params: { ratio: 0.4 } }], desc: 'Roba la vida de l\'enemic per a tu.', icon: 'lorc/drop.svg' }),
  ],
};

export const MAGIA_ARCANA_INNATA: SkillDefinition = {
  id: 'magia-arcana-innata', displayName: 'Màgia Arcana Innata', classCss: 'bruixot', category: 'player',
  description: 'Marques arcanes que es poden detonar.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/fire-spell-cast.svg',
  actions: [
    action({ id: 'raig-potenciat', name: 'Raig potenciat', skillId: 'magia-arcana-innata', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 8), effects: [{ type: 'mark_on_hit', params: { amount: 1 } }], desc: "Marca l'enemic amb una marca arcana.", icon: 'lorc/beam-wake.svg' }),
    action({ id: 'marca-bessona', name: 'Marca bessona', skillId: 'magia-arcana-innata', unlock: 20, type: ActionType.Atac, speed: 8, damage: d(1, 4), targetCount: 2, effects: [{ type: 'mark_on_hit', params: { amount: 1 } }], desc: 'Marca 2 enemics alhora.', icon: 'lorc/double-face-mask.svg' }),
    action({ id: 'absorcio-magica', name: 'Absorció màgica', skillId: 'magia-arcana-innata', unlock: 15, type: ActionType.Defensa, speed: 10, rollBonus: 1, effects: [{ type: 'debuff_on_block', params: { amount: 6 } }], desc: "En defensar, debilites l'atacant.", icon: 'lorc/magic-shield.svg' }),
    action({ id: 'detonacio-arcana', name: 'Detonació arcana', skillId: 'magia-arcana-innata', unlock: 35, type: ActionType.Focus, speed: 4, effects: [{ type: 'detonate', params: { perMark: 4 } }], desc: 'Detona totes les marques arcanes per fer dany.', icon: 'sbed/blast.svg' }),
  ],
};

export const MANIPULACIO_TEMPORAL: SkillDefinition = {
  id: 'manipulacio-temporal', displayName: 'Manipulació Temporal', classCss: 'bruixot', category: 'player',
  description: 'Control del temps per alentir els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/time-trap.svg',
  actions: [
    action({ id: 'distorsio-temporal', name: 'Distorsió temporal', skillId: 'manipulacio-temporal', unlock: 1, type: ActionType.Focus, speed: 6, effects: [{ type: 'skill_mod', params: { kind: 'speed', amount: -4, target: 'enemies', duration: 3 } }], desc: 'Tots els enemics queden alentits 3 torns.', icon: 'lorc/time-trap.svg' }),
  ],
};

export const ARCANE_SKILLS: SkillDefinition[] = [
  PIROMANCIA, CRIOMANCIA, MAGIA_ARCANA, MAGIA_DE_SANG, MAGIA_FOSCA, MAGIA_ARCANA_INNATA, MANIPULACIO_TEMPORAL,
];
