import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * Koh, the face stealer: an ancient spirit-centipede. Show him any emotion and
 * he takes your face. In a fight, the emotion is the swing — whoever strikes
 * at him and fails has shown him everything.
 */
function struckAtKoh(ctx: { engine: { round: number; history: ReadonlyArray<{ round: number; actor: unknown; targets: unknown[] }> }; source: unknown }, who: unknown): boolean {
  return ctx.engine.history.some(e => e.round === ctx.engine.round && e.actor === who && e.targets.includes(ctx.source));
}

const KOH_EFFECTS: Record<string, EffectHandler> = {
  // Rostre impassible: a blow he turns aside was a face shown — the attacker
  // stands frozen next turn.
  impassive_face: {
    onDefend(ctx) {
      if (!ctx.target || !ctx.target.isAlive()) return;
      ctx.target.skipTurns += 1;
      ctx.engine.log('defense', `${ctx.target.name} ha mostrat la cara a Koh: es queda glaçat el torn següent.`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

  // Robar el rostre: 2d6 to the chosen enemy; whoever attacked Koh this round
  // also loses their next turn.
  steal_face: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      const dmg = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'attack');
      ctx.engine.applyPvLoss(t, dmg, ctx.source);
      const shown = struckAtKoh(ctx, t);
      if (shown && t.isAlive()) t.skipTurns += 1;
      ctx.engine.log('focus', `Koh pren el rostre de ${t.name}: ${dmg} de dany${shown ? ' i perd el torn següent' : ''}.`, ctx.source.team);
    },
    aiWeight() { return 1.2; },
  },
};

const KOH_SKILL: SkillDefinition = {
  id: 'koh', displayName: 'Koh, el lladre de rostres', classCss: 'koh', category: 'enemy',
  description: "Un esperit antic amb cos de centpeus. Si mostres cap emoció davant seu, et pren la cara.",
  iconPath: ICON + 'lorc/centipede.svg',
  actions: [
    action({ id: 'mossegada-de-centpeus', name: 'Mossegada de centpeus', skillId: 'koh', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 6), desc: '', icon: 'lorc/fangs.svg' }),
    action({
      id: 'rostre-impassible', name: 'Rostre impassible', skillId: 'koh',
      unlock: 2, type: ActionType.Defensa, speed: 2, dice: d(3, 6),
      effects: [{ type: 'self_guard' }, { type: 'impassive_face' }],
      desc: "Només et protegeix a tu. Si bloqueges, l'atacant perd el torn següent.",
      icon: 'lorc/domino-mask.svg',
    }),
    action({
      id: 'robar-el-rostre', name: 'Robar el rostre', skillId: 'koh',
      unlock: 3, type: ActionType.Focus, speed: -2, dice: d(2, 6),
      effects: [{ type: 'steal_face' }],
      desc: "Tria un enemic: perd 2d6 PV. Si t'ha atacat aquest torn, també perd el torn següent.",
      icon: 'lorc/hood.svg',
    }),
  ],
  effects: KOH_EFFECTS,
};

export const KOH: EnemyDefinition = {
  id: 'koh', displayName: 'Koh, el lladre de rostres', classCss: 'koh', iconPath: ICON + 'lorc/centipede.svg',
  /** ~1.2 t — a centipede the length of a cave. */
  bulk: 2.58,
  skills: [KOH_SKILL],
};
