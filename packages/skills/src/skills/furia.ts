import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';

/**
 * Fúria — a D&D-style barbarian whose power is raw, escalating wrath, not technique.
 * Weapon-agnostic like the Mestre d'Armes: every attack deals the WIELDED weapon's
 * dice (`weapon_damage`), but here the fury is what lands and amplifies it — reckless
 * swings, the rage STATE (+5 dealt / −5 taken), wound-scaling, and a last-stand
 * capstone. See furia-effects.ts (enter_rage / fear_roar / rage_from_pain / last_stand)
 * and the engine's furia / aguantant / indestructible status reads.
 */
export const FURIA: SkillDefinition = {
  id: 'furia', displayName: 'Fúria', classCss: 'barbar', category: 'player',
  description: "Bàrbar de fúria desfermada: el dany surt de l'arma que empunyes, però la ràbia és el que colpeja i devasta. Tot atac, autodestructiu.",
  iconPath: ICON_PREFIX + 'delapouite/barbarian.svg',
  actions: [
    action({
      id: 'atac-temerari', name: 'Atac temerari', skillId: 'furia',
      unlock: 1, type: ActionType.Atac, speed: 2,
      effects: [{ type: 'weapon_damage' }, { type: 'reckless', params: { attack: 10, defense: 20, thisTurn: false } }],
      desc: '{A}+10. El torn següent, {D}−20.',
      icon: 'lorc/axe-swing.svg',
    }),
    action({
      id: 'entrar-en-furia', name: 'Entrar en Fúria', skillId: 'furia',
      unlock: 12, type: ActionType.Focus, speed: 2, fatigueCost: 3,
      effects: [{ type: 'enter_rage', params: { value: 5, turns: 3 } }],
      desc: '+5 de dany i −5 de dany rebut durant 3 torns.',
      icon: 'delapouite/enrage.svg',
    }),
    action({
      id: 'embat-sagnant', name: 'Embat sagnant', skillId: 'furia',
      unlock: 28, type: ActionType.Atac, speed: 1,
      effects: [{ type: 'weapon_damage' }, { type: 'frenzy', params: { per: 1, amount: 1 } }],
      desc: '{A}+1 per cada PV perdut.',
      icon: 'skoll/blood.svg',
    }),
    action({
      id: 'rugit-de-guerra', name: 'Rugit de guerra', skillId: 'furia',
      unlock: 42, type: ActionType.Focus, speed: 4,
      effects: [{ type: 'fear_roar' }],
      desc: "Cada enemic fa un salvament; qui falla perd l'acció d'aquest torn.",
      icon: 'lorc/screaming.svg',
    }),
    action({
      id: 'aguantar-el-cop', name: 'Aguantar el cop', skillId: 'furia',
      unlock: 58, type: ActionType.Defensa, speed: 2,
      effects: [{ type: 'rage_from_pain' }],
      desc: '{D} 0: reps tot el dany i guanyes +{A} permanent igual al dany rebut.',
      icon: 'lorc/muscle-up.svg',
    }),
    action({
      id: 'furia-implacable', name: 'Fúria implacable', skillId: 'furia',
      unlock: 75, type: ActionType.Atac, speed: 1, fatigueCost: 2,
      effects: [
        { type: 'weapon_damage', params: { times: 2 } },
        { type: 'precision', params: { levelMultiplier: 2 } },
        { type: 'last_stand', params: { turns: 3 } },
      ],
      desc: 'Baixes a 1 PV i et tornes indestructible (mínim 1 PV) durant 3 torns.',
      icon: 'delapouite/mighty-force.svg',
    }),
  ],
};

export const FURIA_SKILLS: SkillDefinition[] = [FURIA];
