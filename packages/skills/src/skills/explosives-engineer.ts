import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Enginyer d'Explosius — a military demolitions engineer who fights from a finite
 * bandolier of càrregues (charges). Ordnance spends charges (no refill); smoke is
 * free. See the `charge_cost` / `smoke` / `lay_minefield` / `empty_bandolier`
 * effect handlers and the engine's encegat/minefield hooks.
 */
export const ENGINYER_EXPLOSIUS: SkillDefinition = {
  id: 'enginyer-explosius', displayName: "Enginyer d'Explosius", classCss: 'enginyer', category: 'player',
  description: 'Enginyer militar de demolicions: un bandoler finit de càrregues, fum i mines.',
  iconPath: ICON_PREFIX + 'lord-berandas/bomber.svg',
  actions: [
    action({
      id: 'granada-de-fragmentacio', name: 'Granada de fragmentació', skillId: 'enginyer-explosius',
      unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), targetCount: 99,
      effects: [{ type: 'charge_cost', params: { amount: 1 } }],
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/grenade.svg',
    }),
    action({
      id: 'bomba-de-fum', name: 'Bomba de fum', skillId: 'enginyer-explosius',
      unlock: 10, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'smoke', params: { turns: 1 } }],
      desc: 'Cada enemic que ataca aquest torn tira un d20: amb 10 o menys, l’atac impacta un personatge a l’atzar.',
      icon: 'darkzaitzev/smoke-bomb.svg',
    }),
    action({
      id: 'explosiu-perforant', name: 'Explosiu perforant', skillId: 'enginyer-explosius',
      unlock: 30, type: ActionType.Atac, speed: 0, damage: d(1, 8),
      effects: [{ type: 'piercing', params: {} }, { type: 'charge_cost', params: { amount: 1 } }],
      desc: 'Ignora l’armadura.',
      icon: 'delapouite/dynamite.svg',
    }),
    action({
      id: 'camp-minat', name: 'Camp minat', skillId: 'enginyer-explosius',
      unlock: 50, type: ActionType.Focus, speed: -2, fatigueCost: 2,
      effects: [
        { type: 'charge_cost', params: { amount: 3 } },
        { type: 'lay_minefield', params: { mines: 3, damageSides: 6 } },
      ],
      desc: 'Sembra 3 mines. Cada enemic que ataca té un 50% (d20 ≤ 10) de trepitjar-ne una i rebre 1d6, ignorant l’armadura. Duren fins que s’esgoten.',
      icon: 'skoll/minefield.svg',
    }),
    action({
      id: 'traca-final', name: 'Traca final', skillId: 'enginyer-explosius',
      unlock: 65, type: ActionType.Focus, speed: -4, fatigueCost: 2,
      effects: [{ type: 'empty_bandolier', params: { sides: 6 } }],
      desc: 'Cada enemic rep Nd6, on N és el nombre de càrregues que et queden. Gasta totes les càrregues que et quedin.',
      icon: 'skoll/carpet-bombing.svg',
    }),
  ],
};
