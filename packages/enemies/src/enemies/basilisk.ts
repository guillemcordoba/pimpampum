import { ActionType, AIStrategy, DiceRoll, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyModule, ICON } from '../types.js';

const BASILISK_EFFECTS: Record<string, EffectHandler> = {
  // Mirada petrificant: the basilisk's own contest — its gaze dice against
  // each enemy's resist dice (both printed for this card); losers freeze
  // solid for `turns`.
  petrify_gaze: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const turns = typeof ctx.params.turns === 'number' ? ctx.params.turns : 3;
      const resist = ctx.params.resist instanceof DiceRoll ? ctx.params.resist : undefined;
      for (const t of ctx.engine.enemiesOf(ctx.source)) {
        const gazeRaw = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'save')
          + ctx.source.getRollBonus(ctx.action.skillId);
        const saveRaw = ctx.engine.rollDiceFor(t, resist, 'save');
        const gaze = ctx.engine.adjustContestTotal(ctx.source, gazeRaw, saveRaw, 'save');
        const save = ctx.engine.adjustContestTotal(t, saveRaw, gaze, 'save');
        const ok = gaze > save;
        ctx.engine.log('focus', `🎲 Mirada petrificant contra ${t.name}: ${gaze} vs ${save} → ${ok ? 'petrificat' : 'resisteix'}.`, ctx.source.team);
        if (ok) t.skipTurns += turns;
      }
    },
    aiWeight(ctx) { return ctx.enemies.length >= 1 ? 1 : 0; },
  },
};

const BASILISK_SKILL: SkillDefinition = {
  id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', category: 'enemy',
  description: 'La mirada que petrifica i el verí que consumeix.',
  iconPath: ICON + 'delapouite/spiked-dragon-head.svg',
  actions: [
    action({ id: 'esclafament', name: 'Esclafament', skillId: 'basilisk', unlock: 3, type: ActionType.Atac, speed: -3, dice: d(3, 6), desc: '', icon: 'lorc/stoned-skull.svg' }),
    action({ id: 'mirada-petrificant', name: 'Mirada petrificant', skillId: 'basilisk', unlock: 4, type: ActionType.Focus, speed: -2, dice: d(3, 6), fatigueCost: 2, effects: [{ type: 'petrify_gaze', params: { turns: 3, resist: d(2, 6) } }], desc: 'Tira 3d6 contra 2d6 de cada enemic: qui perdi queda petrificat (salta els 3 propers torns).', icon: 'lorc/gaze.svg' }),
    action({ id: 'mossegada-verinosa', name: 'Mossegada verinosa', skillId: 'basilisk', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 8), effects: [{ type: 'poison_on_hit', params: { damage: 4, turns: 1, name: 'verí' } }], desc: "Si impacta, l'enemic perd 4 de vida addicional el següent torn.", icon: 'lorc/snake-bite.svg' }),
    action({ id: 'cop-de-cua', name: 'Cop de cua', skillId: 'basilisk', unlock: 2, type: ActionType.Atac, speed: 1, dice: d(2, 6), targetCount: 3, fatigueCost: 2, desc: 'Colpeja fins a 3 enemics amb la cua.', icon: 'lorc/spiked-tail.svg' }),
    action({ id: 'regeneracio', name: 'Regeneració', skillId: 'basilisk', unlock: 5, type: ActionType.Focus, speed: -3, effects: [{ type: 'heal', params: { amount: 10, target: 'self' } }], desc: 'Cura 10 vides.', icon: 'lorc/snake.svg' }),
  ],
  effects: BASILISK_EFFECTS,
};

export const BASILISK: EnemyModule = {
  template: { id: 'basilisk', displayName: 'Basilisc', classCss: 'basilisc', iconPath: ICON + 'delapouite/spiked-dragon-head.svg', role: 'solitari', threat: 0.508, skills: ['basilisk'], basePV: 43, suggestedLevel: 5, naturalArmor: 2, aiStrategy: AIStrategy.Power },
  skills: [BASILISK_SKILL],
};
