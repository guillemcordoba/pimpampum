import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * Koh, the face stealer: an ancient spirit-centipede. Show him any emotion and
 * he takes your face. In a fight, the emotion is the swing — whoever strikes
 * at him and fails has shown him everything.
 */
function struckAtKoh(ctx: { engine: { round: number; history: ReadonlyArray<{ round: number; actor: unknown; targets: unknown[] }> }; source: unknown }, who: unknown, round: number): boolean {
  return ctx.engine.history.some(e => e.round === round && e.actor === who && e.targets.includes(ctx.source));
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

  // Robar el rostre: every enemy who struck at Koh LAST round showed him their
  // face — 3d6 each, and they lose their next turn. A lone spirit with nothing
  // a block wall could not stop measured as no threat at any PV (probed
  // 2026-10-06); this is the threat, and it is the lore: show nothing. Last
  // round, not this one: reading this round it had to resolve after the blows,
  // and a slow Focus is exactly what those blows cancel.
  steal_face: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const shown = ctx.engine.enemiesOf(ctx.source).filter(t => struckAtKoh(ctx, t, ctx.engine.round - 1));
      if (!shown.length) {
        ctx.engine.log('focus', 'Ningú no ha mostrat cap emoció: Koh no troba cap rostre.', ctx.source.team);
        return;
      }
      for (const t of shown) {
        const dmg = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'attack');
        ctx.engine.applyPvLoss(t, dmg, ctx.source);
        if (t.isAlive()) t.skipTurns += 1;
        ctx.engine.log('focus', `Koh pren el rostre de ${t.name}: ${dmg} de dany i perd el torn següent.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length ? 1.2 : 0; },
  },
};

const KOH_SKILL: SkillDefinition = {
  id: 'koh', displayName: 'Koh, el lladre de rostres', classCss: 'koh', category: 'enemy',
  description: "Un esperit antic amb cos de centpeus. Si mostres cap emoció davant seu, et pren la cara.",
  iconPath: ICON + 'lorc/centipede.svg',
  actions: [
    action({ id: 'mossegada-de-centpeus', name: 'Mossegada de centpeus', skillId: 'koh', unlock: 1, type: ActionType.Atac, speed: 0, dice: d(3, 6), desc: '', icon: 'lorc/fangs.svg' }),
    action({
      id: 'rostre-impassible', name: 'Rostre impassible', skillId: 'koh',
      unlock: 2, type: ActionType.Defensa, speed: 2, dice: d(3, 6),
      effects: [{ type: 'self_guard' }, { type: 'impassive_face' }],
      desc: "Només et protegeix a tu. Si bloqueges, l'atacant perd el torn següent.",
      icon: 'lorc/domino-mask.svg',
    }),
    action({
      id: 'robar-el-rostre', name: 'Robar el rostre', skillId: 'koh',
      unlock: 3, type: ActionType.Focus, speed: 3, dice: d(3, 6),
      effects: [{ type: 'steal_face' }],
      desc: "Cada enemic que t'hagi atacat el torn anterior perd 3d6 PV i el torn següent.",
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
