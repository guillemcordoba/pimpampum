import { ActionType, Character, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { applyMod } from '../effects/helpers.js';
import { WARD_KEY } from '../effects/generic.js';

/**
 * Els set chakres — Guru Pathik's teaching: seven pools of energy, each
 * blocked by one thing. The first, the earth chakra, governs survival and is
 * blocked by FEAR. A complementary kit: support, and the party's answer to
 * the Senyor de la Por, whose last card seals the very chakra this kit's first
 * card opens.
 */

/** Nothing new takes hold this round and the next. Worth a little to its
 *  holder: the harm it turns away has not happened yet. */
const CHAKRA_OBERT: StatusBehavior = {
  positionValue() { return 0.05; },
};

/**
 * Obrir el chakra del cor: love is the air chakra's pool, and here it is a
 * body put between a friend and the blow. Every point the ally would lose this
 * round lands on the caster instead.
 */
const COR_OBERT: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    const carer = ctx.entry.data?.['carer'];
    if (!(carer instanceof Character) || !carer.isAlive() || damage <= 0) return damage;
    ctx.engine.log('defense', `${carer.name} rep el cop per ${ctx.holder.name} (${damage}).`, ctx.holder.team);
    ctx.engine.applyPvLoss(carer, damage, undefined);
    return 0;
  },
  positionValue() { return 0.05; },
};

const CHAKRA_EFFECTS: Record<string, EffectHandler> = {
  open_earth_chakra: {
    getTargetRequirement() { return 'ally'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      for (const ref of t.statusRefs()) if (ref.entry.data?.['harm']) t.clearStatus(ref.key);
      t.modifiers = t.modifiers.filter(m => m.value >= 0);
      t.setStatus(WARD_KEY, 1, 2, undefined, CHAKRA_OBERT);
      ctx.engine.log('focus', `${ctx.source.name} obre el chakra de la terra de ${t.name}: la por flueix riu avall.`, ctx.source.team);
    },
    // Worth a card only when there is harm to strip.
    aiWeight(ctx) {
      const harmed = [ctx.actor, ...ctx.allies].some(a => a.statusRefs().some(r => r.entry.data?.['harm']));
      return harmed ? 1.8 : -1;
    },
  },

  open_heart_chakra: {
    getTargetRequirement() { return 'ally'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || t === ctx.source) return;
      t.setStatus('cor-obert', 1, 1, { carer: ctx.source }, COR_OBERT);
      ctx.engine.log('focus', `${ctx.source.name} es posa davant de ${t.name}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.some(a => a.currentPV < ctx.actor.currentPV) ? 1 : -0.5; },
  },

  open_thought_chakra: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      for (const c of ctx.engine.alliesOf(ctx.source, true)) applyMod(c, 'skill', 2, 'nextTurn', ctx.action.name);
      ctx.engine.log('focus', `${ctx.source.name} obre el setè chakra: tot el grup +2 el torn següent.`, ctx.source.team);
    },
    aiWeight() { return 0.9; },
  },
};

export const CHAKRA: SkillDefinition = {
  id: 'chakra', displayName: 'Els set chakres', classCss: 'chakra', category: 'player',
  description: "Set estanys d'energia, cadascun tapat per una cosa. El primer, el de la terra, el tapa la por.",
  iconPath: ICON_PREFIX + 'lorc/meditation.svg',
  actions: [
    action({
      id: 'obrir-el-chakra-de-la-terra', name: 'Obrir el chakra de la terra', skillId: 'chakra',
      unlock: 1, type: ActionType.Focus, speed: 3,
      effects: [{ type: 'open_earth_chakra' }],
      desc: 'Tria un aliat: perd la por i els estats negatius, i fins al torn següent no en pot rebre de nous.',
      icon: 'lorc/lotus.svg',
    }),
    action({
      id: 'obrir-el-chakra-del-cor', name: 'Obrir el chakra del cor', skillId: 'chakra',
      unlock: 2, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'open_heart_chakra' }],
      desc: 'Tria un aliat: aquest torn, el dany que rebi el reps tu.',
      icon: 'lorc/heart-inside.svg',
    }),
    action({
      id: 'obrir-el-chakra-del-pensament', name: 'Obrir el chakra del pensament', skillId: 'chakra',
      unlock: 3, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'open_thought_chakra' }],
      desc: 'Tots els aliats: +2 a totes les tirades el torn següent.',
      icon: 'lorc/third-eye.svg',
    }),
  ],
  effects: CHAKRA_EFFECTS,
};
