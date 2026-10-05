import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The fire empire's rank and file: spear lines with firebenders behind them.
 * Alone, a soldier is a spear; in a line, every spear covers the next.
 */
const SOLDAT_EFFECTS: Record<string, EffectHandler> = {
  // Formació de llances: a blocked blow runs onto the line's spears.
  spear_line: {
    onDefend(ctx) {
      if (!ctx.target || !ctx.target.isAlive()) return;
      ctx.engine.log('defense', `${ctx.target.name} topa amb les llances: perd 2 PV.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.target, 2, ctx.source);
    },
    aiWeight() { return 0.5; },
  },
  // Foc concentrat: every other soldier still standing adds to the volley.
  volley: {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      const line = ctx.engine.alliesOf(ctx.source, false).length;
      ctx.attackMods.rollBonus += Math.min(3, line);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 1.4 : 0.4; },
  },
};

const SOLDAT_SKILL: SkillDefinition = {
  id: 'soldat-del-foc', displayName: 'Soldat del foc', classCss: 'soldat-foc', category: 'enemy',
  description: "Llances al davant, foc al darrere. Sol no és res; en formació, cada llança cobreix la següent.",
  iconPath: ICON + 'lorc/spartan-helmet.svg',
  actions: [
    action({ id: 'llanca', name: 'Llança', skillId: 'soldat-del-foc', unlock: 1, type: ActionType.Atac, speed: 1, dice: d(1, 6), desc: '', icon: 'lorc/spear-hook.svg' }),
    action({ id: 'raig-de-foc', name: 'Raig de foc', skillId: 'soldat-del-foc', unlock: 2, type: ActionType.Atac, speed: 0, dice: d(2, 4), desc: '', icon: 'lorc/flamer.svg' }),
    action({
      id: 'formacio-de-llances', name: 'Formació de llances', skillId: 'soldat-del-foc',
      unlock: 3, type: ActionType.Defensa, speed: 2, dice: d(3, 4),
      effects: [{ type: 'spear_line' }],
      desc: "Si bloqueges, l'atacant perd 2 PV.",
      icon: 'lorc/spears.svg',
    }),
    action({
      id: 'foc-concentrat', name: 'Foc concentrat', skillId: 'soldat-del-foc',
      unlock: 4, type: ActionType.Atac, speed: -1, dice: d(2, 6),
      effects: [{ type: 'volley' }],
      desc: '+1 per cada altre soldat viu, fins a +3.',
      icon: 'lorc/fire-ray.svg',
    }),
  ],
  effects: SOLDAT_EFFECTS,
};

export const SOLDAT_DEL_FOC: EnemyDefinition = {
  id: 'soldat-del-foc', displayName: 'Soldat del foc', classCss: 'soldat-foc', iconPath: ICON + 'lorc/spartan-helmet.svg',
  /** Iron plate: what a metalbender bends straight through. */
  naturalArmor: 1,
  /** ~70 kg plus kit — a soldier is the reference body. */
  bulk: 1.0,
  skills: [SOLDAT_SKILL],
};
