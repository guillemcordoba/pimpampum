import { ActionType, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { applyMod } from '../effects/helpers.js';

/**
 * Enginy — no bending, so plan better than the benders do. A complementary
 * kit: the boomerang that always comes back, the smoke that hides a retreat,
 * and the plan that makes everyone else hit harder next turn.
 */

/** Smoke in the air: blows aimed at the holder this round land worse. */
const FUM: StatusBehavior = {
  attackRollAgainstHolder() { return -3; },
  positionValue() { return 0.03; },
};

const ENGINY_EFFECTS: Record<string, EffectHandler> = {
  // Bumerang: it always comes back — at the end of the round, a second, lighter
  // blow at whoever it was thrown at.
  boomerang: {
    postRound(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || !ctx.source.isAlive()) return;
      ctx.engine.performExtraAttack(ctx.source, t, new DiceRoll(1, 4), { skillId: ctx.action.skillId, label: 'El bumerang torna' });
    },
    aiWeight() { return 0.6; },
  },

  smoke_bomb: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      for (const c of ctx.engine.alliesOf(ctx.source, true)) c.setStatus('fum', 1, 1, undefined, FUM);
      ctx.engine.log('focus', `${ctx.source.name} llança una bomba de fum: els atacs contra el grup −3 aquest torn.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.some(a => a.currentPV < a.maxPV * 0.5) ? 1.2 : 0.4; },
  },

  battle_plan: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      for (const c of ctx.engine.alliesOf(ctx.source, true)) applyMod(c, 'attack', 2, 'nextTurn', ctx.action.name);
      ctx.engine.log('focus', `${ctx.source.name} té un pla: tot el grup {A}+2 el torn següent.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 1.1 : 0.3; },
  },
};

export const ENGINY: SkillDefinition = {
  id: 'enginy', displayName: 'Enginy', classCss: 'enginy', category: 'player',
  description: 'Sense dominar cap element, cal pensar millor que qui en domina.',
  iconPath: ICON_PREFIX + 'lorc/light-bulb.svg',
  actions: [
    action({
      id: 'bumerang', name: 'Bumerang', skillId: 'enginy',
      unlock: 1, type: ActionType.Atac, speed: 1, dice: d(1, 6),
      effects: [{ type: 'boomerang' }],
      desc: "Al final del torn torna: un altre atac d'1d4 al mateix objectiu.",
      icon: 'lorc/boomerang.svg',
    }),
    action({
      id: 'bomba-de-fum', name: 'Bomba de fum', skillId: 'enginy',
      unlock: 2, type: ActionType.Focus, speed: 4,
      effects: [{ type: 'smoke_bomb' }],
      desc: 'Aquest torn, els atacs contra el teu grup −3.',
      icon: 'lorc/smoke-bomb.svg',
    }),
    action({
      id: 'pla-de-batalla', name: 'Pla de batalla', skillId: 'enginy',
      unlock: 3, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'battle_plan' }],
      desc: 'El torn següent, tot el teu grup {A}+2.',
      icon: 'lorc/treasure-map.svg',
    }),
  ],
  effects: ENGINY_EFFECTS,
};
