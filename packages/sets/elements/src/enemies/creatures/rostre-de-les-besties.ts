import { ActionType, Character, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { num } from '../../players/effects/helpers.js';
import { EnemyDefinition, ICON } from '../types.js';
import { createEnemyFrom } from '../factory.js';
import { BESTIA_DE_LA_POR } from './bestia-de-la-por.js';

/**
 * The fourth body (Pain's Animal path): it calls the beasts that fear makes —
 * as tough as half of itself, so they grow with whatever the encounter made
 * of their summoner.
 */
const BESTIES_EFFECTS: Record<string, EffectHandler> = {
  summon_fear_beast: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const cap = num(ctx.params, 'maxTeam', 9);
      if (ctx.engine.rosterOf(ctx.source).length >= cap) return;
      const beast: Character = createEnemyFrom(BESTIA_DE_LA_POR, { pv: Math.max(3, Math.round(ctx.source.maxPV / 2)) });
      ctx.engine.addCombatant(ctx.source.team, beast);
      ctx.engine.log('focus', `${ctx.source.name} invoca una bèstia de la por.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length < 7 ? 1.2 : -5; },
  },
};

const BESTIES_SKILL: SkillDefinition = {
  id: 'rostre-de-les-besties', displayName: 'Rostre de les Bèsties', classCss: 'por', category: 'enemy',
  description: 'El quart cos del Senyor de la Por: crida les bèsties que fa la por.',
  iconPath: ICON + 'lorc/wolf-howl.svg',
  actions: [
    action({ id: 'mossegada-del-rostre', name: 'Mossegada', skillId: 'rostre-de-les-besties', unlock: 1, type: ActionType.Atac, speed: 2, dice: d(1, 6), desc: '', icon: 'lorc/fangs.svg' }),
    action({
      id: 'invocar-la-bestia', name: 'Invocar la bèstia de la por', skillId: 'rostre-de-les-besties',
      unlock: 2, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'summon_fear_beast', params: { maxTeam: 9 } }],
      desc: 'Una bèstia de la por entra al combat, amb la meitat dels teus PV.',
      icon: 'lorc/beast-eye.svg',
    }),
  ],
  effects: BESTIES_EFFECTS,
};

export const ROSTRE_DE_LES_BESTIES: EnemyDefinition = {
  id: 'rostre-de-les-besties', displayName: 'Rostre de les Bèsties', classCss: 'por', iconPath: ICON + 'lorc/wolf-howl.svg',
  bulk: 1.0,
  skills: [BESTIES_SKILL],
};
