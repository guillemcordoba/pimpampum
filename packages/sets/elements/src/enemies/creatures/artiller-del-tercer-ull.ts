import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The hired hunter with a third eye (Combustion Man): a metal arm, a relentless
 * nose for his quarry, and an explosion that levels a hillside — if he gets it
 * off. Hit him before it leaves his forehead and it never does: his blast is a
 * Focus, and a Focus dies with the first wound.
 */
const ARTILLER_EFFECTS: Record<string, EffectHandler> = {
  third_eye_blast: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const dice = ctx.action.dice;
      if (!dice) return;
      ctx.engine.log('focus', `💥 ${ctx.source.name} fa esclatar el tercer ull!`, ctx.source.team);
      for (const t of ctx.engine.enemiesOf(ctx.source)) {
        ctx.engine.performExtraAttack(ctx.source, t, dice, { skillId: ctx.action.skillId, label: 'Explosió del tercer ull' });
      }
    },
    aiWeight(ctx) { return ctx.enemies.length >= 2 ? 1.5 : 0.6; },
  },
};

const ARTILLER_SKILL: SkillDefinition = {
  id: 'artiller-del-tercer-ull', displayName: 'Artiller del tercer ull', classCss: 'artiller', category: 'enemy',
  description: "Un braç de metall, un nas que no perd mai la presa, i una explosió que arrasa un turó — si arriba a sortir-li del front.",
  iconPath: ICON + 'lorc/third-eye.svg',
  actions: [
    action({ id: 'puny-de-metall', name: 'Puny de metall', skillId: 'artiller-del-tercer-ull', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 4), desc: '', icon: 'lorc/mailed-fist.svg' }),
    action({
      id: 'rastrejar', name: 'Rastrejar', skillId: 'artiller-del-tercer-ull',
      unlock: 2, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'mark', params: { amount: 2, turns: 2 } }],
      desc: 'Tria un enemic: durant 2 torns, els atacs contra ell +2.',
      icon: 'lorc/sniffing-dog.svg',
    }),
    action({
      id: 'explosio-del-tercer-ull', name: 'Explosió del tercer ull', skillId: 'artiller-del-tercer-ull',
      unlock: 3, type: ActionType.Focus, speed: -3, dice: d(2, 6),
      effects: [{ type: 'third_eye_blast' }],
      desc: 'Fa un atac de 2d6 contra cada enemic.',
      icon: 'lorc/mushroom-cloud.svg',
    }),
  ],
  effects: ARTILLER_EFFECTS,
};

export const ARTILLER_DEL_TERCER_ULL: EnemyDefinition = {
  id: 'artiller-del-tercer-ull', displayName: 'Artiller del tercer ull', classCss: 'artiller', iconPath: ICON + 'lorc/third-eye.svg',
  /** A metal arm and leg. */
  naturalArmor: 1,
  /** ~150 kg — a giant of a man, half of it iron. */
  bulk: 1.29,
  skills: [ARTILLER_SKILL],
};
