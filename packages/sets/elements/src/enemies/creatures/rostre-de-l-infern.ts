import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The sixth body (Pain's Naraka path): it calls the king of hell, who gives
 * back a fallen body. The heroes' lesson is Naruto's: kill this one first, or
 * the others keep standing back up.
 */
const INFERN_EFFECTS: Record<string, EffectHandler> = {
  king_of_hell: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const fallen = ctx.engine.rosterOf(ctx.source).filter(c => !c.isAlive() && c !== ctx.source);
      if (!fallen.length) {
        ctx.engine.log('focus', `El rei de l'infern no troba ningú a qui tornar.`, ctx.source.team);
        return;
      }
      const back = fallen.reduce((best, c) => (c.maxPV > best.maxPV ? c : best));
      ctx.engine.heal(back, Math.ceil(back.maxPV / 2));
      ctx.engine.log('focus', `El rei de l'infern torna ${back.name} al combat.`, ctx.source.team);
    },
    // Worth everything when a body is down, nothing otherwise.
    aiWeight(ctx) { return ctx.allies.length < 6 ? 2 : -5; },
  },
};

const INFERN_SKILL: SkillDefinition = {
  id: 'rostre-de-l-infern', displayName: "Rostre de l'Infern", classCss: 'por', category: 'enemy',
  description: "El sisè cos del Senyor de la Por: crida el rei de l'infern, que torna els cossos caiguts.",
  iconPath: ICON + 'lorc/crowned-skull.svg',
  actions: [
    action({ id: 'cop-de-l-infern', name: 'Cop', skillId: 'rostre-de-l-infern', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(1, 4), desc: '', icon: 'lorc/punch.svg' }),
    action({
      id: 'rei-de-l-infern', name: "Rei de l'infern", skillId: 'rostre-de-l-infern',
      unlock: 2, type: ActionType.Focus, speed: -3,
      effects: [{ type: 'king_of_hell' }],
      desc: 'El cos aliat caigut amb més PV torna al combat amb la meitat dels seus PV.',
      icon: 'lorc/crowned-skull.svg',
    }),
  ],
  effects: INFERN_EFFECTS,
};

export const ROSTRE_DE_L_INFERN: EnemyDefinition = {
  id: 'rostre-de-l-infern', displayName: "Rostre de l'Infern", classCss: 'por', iconPath: ICON + 'lorc/crowned-skull.svg',
  bulk: 1.0,
  skills: [INFERN_SKILL],
};
