import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { warded } from '../../players/effects/generic.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The third body (Pain's Human path): a hand on your head, and your soul half
 * out of your body. Slow — it has to keep its hand there — so hurt it first.
 */
const ANIMA_EFFECTS: Record<string, EffectHandler> = {
  tear_soul: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      t.skipTurns += 2;
      ctx.engine.log('focus', `${ctx.source.name} arrenca mitja ànima de ${t.name}: perd 2 torns.`, ctx.source.team);
    },
    aiWeight() { return 1.3; },
  },
};

const ANIMA_SKILL: SkillDefinition = {
  id: 'rostre-de-l-anima', displayName: "Rostre de l'Ànima", classCss: 'por', category: 'enemy',
  description: "El tercer cos del Senyor de la Por: una mà al cap, i l'ànima mig fora del cos.",
  iconPath: ICON + 'lorc/spectre.svg',
  actions: [
    action({ id: 'toc', name: 'Toc', skillId: 'rostre-de-l-anima', unlock: 1, type: ActionType.Atac, speed: 1, dice: d(1, 6), desc: '', icon: 'lorc/hand.svg' }),
    action({
      id: 'arrencar-l-anima', name: "Arrencar l'ànima", skillId: 'rostre-de-l-anima',
      unlock: 2, type: ActionType.Focus, speed: -2,
      effects: [{ type: 'tear_soul' }],
      desc: 'Tria un enemic: perd els 2 torns següents.',
      icon: 'lorc/soul-vessel.svg',
    }),
  ],
  effects: ANIMA_EFFECTS,
};

export const ROSTRE_DE_L_ANIMA: EnemyDefinition = {
  id: 'rostre-de-l-anima', displayName: "Rostre de l'Ànima", classCss: 'por', iconPath: ICON + 'lorc/spectre.svg',
  bulk: 1.0,
  skills: [ANIMA_SKILL],
};
