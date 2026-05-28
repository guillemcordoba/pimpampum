import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const ESGRIMA: SkillDefinition = {
  id: 'esgrima', displayName: 'Esgrima', classCss: 'guerrer', category: 'player',
  description: "L'art de l'espasa: atacs precisos i posicions defensives.",
  iconPath: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  actions: [
    action({ id: 'tall-espasa', name: "Tall d'espasa", skillId: 'esgrima', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 6), desc: "Un cop precís i potent amb l'espasa.", icon: 'lorc/broadsword.svg' }),
    action({ id: 'posicio-defensiva', name: 'Posició defensiva', skillId: 'esgrima', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 3, desc: 'Defensa un aliat.', icon: 'lorc/bordered-shield.svg' }),
    action({ id: 'atac-ampli', name: 'Atac ampli', skillId: 'esgrima', unlock: 20, type: ActionType.Atac, speed: -1, damage: d(1, 4), targetCount: 2, desc: "Ataca fins a 2 enemics amb un gran arc d'espasa.", icon: 'lorc/sword-spin.svg' }),
    action({ id: 'escomesa-furiosa', name: 'Escomesa furiosa', skillId: 'esgrima', unlock: 35, type: ActionType.Atac, speed: 2, damage: d(1, 4), effects: [{ type: 'second_attack', params: { dice: d(1, 4), target: 'random' } }], desc: 'Ataca i realitza immediatament un segon atac contra un enemic aleatori.', icon: 'lorc/spinning-sword.svg' }),
  ],
};

export const TACTICA_MILITAR: SkillDefinition = {
  id: 'tactica-militar', displayName: 'Tàctica Militar', classCss: 'guerrer', category: 'player',
  description: 'Lideratge i resistència al camp de batalla.',
  iconPath: 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
  actions: [
    action({ id: 'segon-ale', name: 'Segon alè', skillId: 'tactica-militar', unlock: 1, type: ActionType.Focus, speed: 3, effects: [
      { type: 'heal', params: { amount: 1, target: 'self' } },
      { type: 'skill_mod', params: { kind: 'defense', amount: 2, target: 'self', duration: 'thisTurn' } },
    ], desc: 'Cura 1 vida i guanya {D}+2 aquest torn.', icon: 'lorc/energy-breath.svg' }),
    action({ id: 'crit-de-guerra', name: 'Crit de guerra', skillId: 'tactica-militar', unlock: 25, type: ActionType.Focus, speed: -4, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: 0, dice: d(1, 4), target: 'team', duration: 'restOfCombat' } },
    ], desc: 'Tu i tots els aliats guanyeu {A}+1d4 per la resta del combat.', icon: 'lorc/shouting.svg' }),
  ],
};

export const COMBAT_SALVATGE: SkillDefinition = {
  id: 'combat-salvatge', displayName: 'Combat Salvatge', classCss: 'barbar', category: 'player',
  description: 'Cops brutals que sacrifiquen defensa per potència.',
  iconPath: 'icons/000000/transparent/1x1/lorc/battle-axe.svg',
  actions: [
    action({ id: 'gran-escomesa', name: 'Gran escomesa', skillId: 'combat-salvatge', unlock: 1, type: ActionType.Atac, speed: -1, damage: d(1, 6), targetCount: 2, desc: "Colpeja fins a 2 enemics amb un gran arc de destral.", icon: 'lorc/battle-axe.svg' }),
    action({ id: 'atac-temerari', name: 'Atac Temerari', skillId: 'combat-salvatge', unlock: 20, type: ActionType.Atac, speed: -1, damage: d(1, 10), effects: [{ type: 'reckless', params: { attack: 0, defense: 3 } }], desc: '{D}-3 aquest torn i el següent.', icon: 'lorc/hammer-drop.svg' }),
    action({ id: 'frenesi', name: 'Frenesia', skillId: 'combat-salvatge', unlock: 35, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'frenzy', params: { per: 1, dice: d(1, 4) } }], desc: '{A}+1d4 per cada vida perduda.', icon: 'lorc/flame-claws.svg' }),
  ],
};

export const FURIA: SkillDefinition = {
  id: 'furia', displayName: 'Fúria', classCss: 'barbar', category: 'player',
  description: 'Ràbia desfermada que potencia el guerrer.',
  iconPath: 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
  actions: [
    action({ id: 'rabia', name: 'Ràbia', skillId: 'furia', unlock: 1, type: ActionType.Focus, speed: -5, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: 2, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'speed', amount: 3, target: 'self', duration: 'restOfCombat' } },
    ], desc: '{A}+1d6+2 i {V}+3 per la resta del combat.', icon: 'lorc/wolf-howl.svg' }),
    action({ id: 'venjanca', name: 'Venjança', skillId: 'furia', unlock: 20, type: ActionType.Defensa, speed: 5, rollBonus: 1, effects: [
      { type: 'buff_on_block_fail', params: { kind: 'attack', amount: 4, duration: 'restOfCombat' } },
      { type: 'buff_on_block_fail', params: { kind: 'speed', amount: 2, duration: 'restOfCombat' } },
    ], desc: 'Si rep dany, {A}+4 i {V}+2 per la resta del combat.', icon: 'lorc/spiked-armor.svg' }),
    action({ id: 'rugit-intimidant', name: 'Rugit intimidant', skillId: 'furia', unlock: 30, type: ActionType.Focus, speed: 1, effects: [
      { type: 'contested_stun', params: { turns: 1, target: 'enemies' } },
    ], desc: "Per cada oponent: **d20+{A} teva > d20+habilitat enemiga**: queda atordit aquest torn.", icon: 'lorc/shouting.svg' }),
  ],
};

export const ARTS_MARCIALS: SkillDefinition = {
  id: 'arts-marcials', displayName: 'Arts Marcials', classCss: 'monjo', category: 'player',
  description: 'Cops ràpids, esquives i contraatacs del monjo.',
  iconPath: 'icons/000000/transparent/1x1/lorc/punch.svg',
  actions: [
    action({ id: 'cop-de-puny', name: 'Cop de puny', skillId: 'arts-marcials', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4), effects: [
      { type: 'buff_on_hit', params: { kind: 'attack', amount: 2, duration: 'nextTurn' } },
    ], desc: 'Si fa mal, rep {A}+2 el torn següent.', icon: 'lorc/punch.svg' }),
    action({ id: 'contracop', name: 'Contracop', skillId: 'arts-marcials', unlock: 10, type: ActionType.Defensa, speed: 2, rollBonus: 3, effects: [{ type: 'counter', params: { dice: d(1, 4) } }], desc: "Si l'atac falla, contraataca l'atacant amb {A}+1d4.", icon: 'lorc/grapple.svg' }),
    action({ id: 'puntada-voladora', name: 'Puntada voladora', skillId: 'arts-marcials', unlock: 20, type: ActionType.Atac, speed: -1, damage: d(1, 6), effects: [{ type: 'piercing', params: {} }], desc: "Ignora les cartes de Defensa — sempre colpeja l'objectiu original.", icon: 'delapouite/high-kick.svg' }),
    action({ id: 'rafega-de-cops', name: 'Ràfega de cops', skillId: 'arts-marcials', unlock: 30, type: ActionType.Atac, speed: 1, damage: d(1, 4, -1), effects: [{ type: 'second_attack', params: { dice: d(1, 4, -1), target: 'same' } }], desc: 'Ataca el mateix enemic dues vegades.', icon: 'lorc/fulguro-punch.svg' }),
    action({ id: 'cop-de-silenci', name: 'Cop de silenci', skillId: 'arts-marcials', unlock: 40, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'silence_on_hit', params: { turns: 2 } }], desc: 'Si fa mal, les cartes Focus del defensor es cancel·len automàticament els proper 2 torns.', icon: 'lorc/silence.svg' }),
  ],
};

export const KI: SkillDefinition = {
  id: 'ki', displayName: 'Ki', classCss: 'monjo', category: 'player',
  description: "Domini de l'energia interior.",
  iconPath: 'icons/000000/transparent/1x1/lorc/meditation.svg',
  actions: [
    action({ id: 'concentracio-ki', name: 'Concentració de ki', skillId: 'ki', unlock: 1, type: ActionType.Focus, speed: 1, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 2, target: 'self', duration: 3 } }], desc: '{A}+2 durant 3 torns.', icon: 'lorc/meditation.svg' }),
    action({ id: 'postura-del-vent', name: 'Postura del vent', skillId: 'ki', unlock: 25, type: ActionType.Focus, speed: 2, rollBonus: 5, effects: [
      { type: 'evasion', params: {} },
      { type: 'skill_mod', params: { kind: 'attack', amount: 3, target: 'self', duration: 'nextTurn' } },
    ], desc: 'Esquiva tots els atacs aquest torn. {A}+3 el torn següent.', icon: 'lorc/whirlwind.svg' }),
  ],
};

export const TIR_AMB_ARC: SkillDefinition = {
  id: 'tir-amb-arc', displayName: 'Tir amb Arc', classCss: 'murri', category: 'player',
  description: 'Atacs a distància, ràpids i múltiples.',
  iconPath: 'icons/000000/transparent/1x1/lorc/high-shot.svg',
  actions: [
    action({ id: 'ballesta', name: 'Ballesta', skillId: 'tir-amb-arc', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 6), desc: 'Un tret precís de ballesta.', icon: 'carl-olsen/crossbow.svg' }),
    action({ id: 'dagues-llancades', name: 'Dagues', skillId: 'tir-amb-arc', unlock: 15, type: ActionType.Atac, speed: 3, damage: d(1, 4), targetCount: 2, desc: 'Afecta a 2 enemics que triïs.', icon: 'lorc/daggers.svg' }),
  ],
};

export const ALQUIMIA: SkillDefinition = {
  id: 'alquimia', displayName: 'Alquímia', classCss: 'murri', category: 'player',
  description: 'Verins, bombes i preparats alquímics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/round-bottom-flask.svg',
  actions: [
    action({ id: 'foc-alquimic', name: 'Foc alquímic', skillId: 'alquimia', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 6), desc: 'Un vial inflamable.', icon: 'lorc/fire-bottle.svg' }),
    action({ id: 'enverinar-arma', name: 'Enverinar arma', skillId: 'alquimia', unlock: 20, type: ActionType.Focus, speed: -4, effects: [{ type: 'weapon_buff', params: { amount: 1, count: 3, turns: -1 } }], desc: 'Tria 3 aliats (pot ser tu). Durant la resta del combat, els seus atacs físics fan perdre una vida addicional.', icon: 'lorc/poison-bottle.svg' }),
  ],
};

export const MARTIAL_SKILLS: SkillDefinition[] = [
  ESGRIMA, TACTICA_MILITAR, COMBAT_SALVATGE, FURIA, ARTS_MARCIALS, KI, TIR_AMB_ARC, ALQUIMIA,
];
