import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const ESGRIMA: SkillDefinition = {
  id: 'esgrima', displayName: 'Esgrima', classCss: 'guerrer', category: 'player',
  description: "L'art de l'espasa: atacs precisos i posicions defensives.",
  iconPath: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  actions: [
    action({ id: 'tall-espasa', name: "Tall d'espasa", skillId: 'esgrima', unlock: 1, type: ActionType.Atac, speed: 8, damage: d(1, 6), desc: "Un cop precís i potent amb l'espasa.", icon: 'lorc/broadsword.svg' }),
    action({ id: 'posicio-defensiva', name: 'Posició defensiva', skillId: 'esgrima', unlock: 1, type: ActionType.Defensa, speed: 11, rollBonus: 2, desc: 'Adopta una guàrdia sòlida i protegeix un aliat.', icon: 'lorc/bordered-shield.svg' }),
    action({ id: 'atac-ampli', name: 'Atac ampli', skillId: 'esgrima', unlock: 20, type: ActionType.Atac, speed: 6, damage: d(1, 6), targetCount: 2, desc: "Ataca fins a 2 enemics amb un gran arc d'espasa.", icon: 'lorc/sword-spin.svg' }),
    action({ id: 'escomesa-furiosa', name: 'Escomesa furiosa', skillId: 'esgrima', unlock: 35, type: ActionType.Atac, speed: 9, damage: d(1, 6), effects: [{ type: 'extra_dice', params: { dice: d(1, 4) } }], desc: 'Una combinació de cops encadenats.', icon: 'lorc/spinning-sword.svg' }),
  ],
};

export const TACTICA_MILITAR: SkillDefinition = {
  id: 'tactica-militar', displayName: 'Tàctica Militar', classCss: 'guerrer', category: 'player',
  description: 'Lideratge i resistència al camp de batalla.',
  iconPath: 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
  actions: [
    action({ id: 'segon-ale', name: 'Segon alè', skillId: 'tactica-militar', unlock: 10, type: ActionType.Focus, speed: 9, effects: [{ type: 'heal', params: { amount: 2, target: 'self' } }, { type: 'skill_mod', params: { kind: 'defense', amount: 6, target: 'self', duration: 'thisTurn' } }], desc: 'Recuperes 2 PV i et protegeixes aquest torn.', icon: 'lorc/energy-breath.svg' }),
    action({ id: 'crit-de-guerra', name: 'Crit de guerra', skillId: 'tactica-militar', unlock: 30, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { amount: 6, target: 'team', duration: 'restOfCombat' } }], desc: 'Tu i tots els aliats lluiteu millor la resta del combat.', icon: 'lorc/shouting.svg' }),
  ],
};

export const COMBAT_SALVATGE: SkillDefinition = {
  id: 'combat-salvatge', displayName: 'Combat Salvatge', classCss: 'barbar', category: 'player',
  description: 'Cops brutals que sacrifiquen defensa per potència.',
  iconPath: 'icons/000000/transparent/1x1/lorc/battle-axe.svg',
  actions: [
    action({ id: 'gran-escomesa', name: 'Gran escomesa', skillId: 'combat-salvatge', unlock: 1, type: ActionType.Atac, speed: 5, damage: d(1, 6), targetCount: 2, desc: "Colpeja fins a 2 enemics amb un gran arc de destral.", icon: 'lorc/battle-axe.svg' }),
    action({ id: 'atac-temerari', name: 'Atac Temerari', skillId: 'combat-salvatge', unlock: 20, type: ActionType.Atac, speed: 5, damage: d(1, 10), effects: [{ type: 'reckless', params: { attack: 6, defense: 6 } }], desc: 'Un atac demolidor que et deixa exposat aquest torn i el següent.', icon: 'lorc/hammer-drop.svg' }),
    action({ id: 'frenesi', name: 'Frenesí', skillId: 'combat-salvatge', unlock: 35, type: ActionType.Atac, speed: 8, damage: d(1, 6), effects: [{ type: 'frenzy', params: { per: 5, amount: 4 } }], desc: 'Com més ferit estàs, més fort colpeges.', icon: 'lorc/flame-claws.svg' }),
  ],
};

export const FURIA: SkillDefinition = {
  id: 'furia', displayName: 'Fúria', classCss: 'barbar', category: 'player',
  description: 'Ràbia desfermada que potencia el guerrer.',
  iconPath: 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
  actions: [
    action({ id: 'rabia', name: 'Ràbia', skillId: 'furia', unlock: 1, type: ActionType.Focus, speed: 2, effects: [{ type: 'skill_mod', params: { amount: 10, target: 'self', duration: 'restOfCombat' } }], desc: 'Entres en còlera: lluites molt millor la resta del combat.', icon: 'lorc/wolf-howl.svg' }),
    action({ id: 'venjanca', name: 'Venjança', skillId: 'furia', unlock: 20, type: ActionType.Defensa, speed: 12, rollBonus: 1, effects: [{ type: 'skill_mod', params: { amount: 8, target: 'self', duration: 'nextTurn' } }], desc: 'Resisteix i prepara una resposta brutal el torn següent.', icon: 'lorc/spiked-armor.svg' }),
    action({ id: 'rugit-intimidant', name: 'Rugit intimidant', skillId: 'furia', unlock: 30, type: ActionType.Focus, speed: 7, effects: [{ type: 'stun', params: { turns: 1, target: 'enemy' } }], desc: 'Un crit que paralitza un enemic de por.', icon: 'lorc/screaming.svg' }),
  ],
};

export const ARTS_MARCIALS: SkillDefinition = {
  id: 'arts-marcials', displayName: 'Arts Marcials', classCss: 'monjo', category: 'player',
  description: 'Cops ràpids, esquives i contraatacs del monjo.',
  iconPath: 'icons/000000/transparent/1x1/lorc/punch.svg',
  actions: [
    action({ id: 'cop-de-puny', name: 'Cop de puny', skillId: 'arts-marcials', unlock: 1, type: ActionType.Atac, speed: 11, damage: d(1, 4), desc: 'Un cop ràpid i precís.', icon: 'lorc/punch.svg' }),
    action({ id: 'contracop', name: 'Contracop', skillId: 'arts-marcials', unlock: 10, type: ActionType.Defensa, speed: 10, rollBonus: 1, effects: [{ type: 'counter', params: { dice: d(1, 6) } }], desc: "Si bloqueges l'atac, contraataques l'agressor.", icon: 'lorc/grapple.svg' }),
    action({ id: 'puntada-voladora', name: 'Puntada voladora', skillId: 'arts-marcials', unlock: 20, type: ActionType.Atac, speed: 6, damage: d(1, 6), effects: [{ type: 'piercing', params: {} }], desc: "Ignora les defenses i colpeja directament.", icon: 'delapouite/high-kick.svg' }),
    action({ id: 'rafega-de-cops', name: 'Ràfega de cops', skillId: 'arts-marcials', unlock: 30, type: ActionType.Atac, speed: 8, damage: d(1, 4), effects: [{ type: 'extra_dice', params: { dice: d(1, 4) } }], desc: 'Una allau de cops sobre el mateix enemic.', icon: 'lorc/fulguro-punch.svg' }),
    action({ id: 'cop-de-silenci', name: 'Cop de silenci', skillId: 'arts-marcials', unlock: 45, type: ActionType.Atac, speed: 8, damage: d(1, 4), effects: [{ type: 'silence_on_hit', params: { turns: 2 } }], desc: 'Un cop als punts vitals que impedeix concentrar-se (sense Focus 2 torns).', icon: 'lorc/silence.svg' }),
  ],
};

export const KI: SkillDefinition = {
  id: 'ki', displayName: 'Ki', classCss: 'monjo', category: 'player',
  description: "Domini de l'energia interior.",
  iconPath: 'icons/000000/transparent/1x1/lorc/meditation.svg',
  actions: [
    action({ id: 'concentracio-ki', name: 'Concentració de ki', skillId: 'ki', unlock: 1, type: ActionType.Focus, speed: 9, effects: [{ type: 'skill_mod', params: { amount: 6, target: 'self', duration: 3 } }], desc: 'Canalitzes el ki: lluites millor durant 3 torns.', icon: 'lorc/meditation.svg' }),
    action({ id: 'postura-del-vent', name: 'Postura del vent', skillId: 'ki', unlock: 20, type: ActionType.Focus, speed: 12, rollBonus: 8, effects: [{ type: 'evasion', params: {} }, { type: 'skill_mod', params: { amount: 6, target: 'self', duration: 'nextTurn' } }], desc: 'Esquives els atacs aquest torn i et prepares pel següent.', icon: 'lorc/whirlwind.svg' }),
  ],
};

export const TIR_AMB_ARC: SkillDefinition = {
  id: 'tir-amb-arc', displayName: 'Tir amb Arc', classCss: 'murri', category: 'player',
  description: 'Atacs a distància, ràpids i múltiples.',
  iconPath: 'icons/000000/transparent/1x1/lorc/high-shot.svg',
  actions: [
    action({ id: 'ballesta', name: 'Ballesta', skillId: 'tir-amb-arc', unlock: 1, type: ActionType.Atac, speed: 10, damage: d(1, 6), desc: 'Un tret precís de ballesta.', icon: 'carl-olsen/crossbow.svg' }),
    action({ id: 'dagues-llancades', name: 'Dagues llançades', skillId: 'tir-amb-arc', unlock: 15, type: ActionType.Atac, speed: 11, damage: d(1, 4), targetCount: 2, desc: 'Llances dagues a 2 enemics.', icon: 'lorc/daggers.svg' }),
    action({ id: 'volea', name: 'Volea', skillId: 'tir-amb-arc', unlock: 35, type: ActionType.Atac, speed: 7, damage: d(1, 4), targetCount: 3, desc: 'Una pluja de fletxes sobre 3 enemics.', icon: 'lorc/striking-arrows.svg' }),
  ],
};

export const ALQUIMIA: SkillDefinition = {
  id: 'alquimia', displayName: 'Alquímia', classCss: 'murri', category: 'player',
  description: 'Verins, bombes i preparats alquímics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/round-bottom-flask.svg',
  actions: [
    action({ id: 'foc-alquimic', name: 'Foc alquímic', skillId: 'alquimia', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 6), effects: [{ type: 'poison_on_hit', params: { damage: 2, turns: 2, name: 'foc alquímic' } }], desc: 'Un vial inflamable que continua cremant.', icon: 'lorc/fire-bottle.svg' }),
    action({ id: 'enverinar-arma', name: 'Enverinar arma', skillId: 'alquimia', unlock: 20, type: ActionType.Focus, speed: 4, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 4, target: 'team', duration: 'restOfCombat' } }], desc: "Unta les armes de l'equip amb verí (millors atacs).", icon: 'lorc/poison-bottle.svg' }),
  ],
};

export const MARTIAL_SKILLS: SkillDefinition[] = [
  ESGRIMA, TACTICA_MILITAR, COMBAT_SALVATGE, FURIA, ARTS_MARCIALS, KI, TIR_AMB_ARC, ALQUIMIA,
];
