import { ActionType, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';
import { createEnemy } from '../factory.js';

/**
 * The elite archer at the back of the line. It takes away DEFENSE: arrows find
 * the gap in the plate, pin a hero where nobody can cover them, and a signal
 * arrow brings more soldiers. Reach the back line early.
 */
const SKILL_ID = 'arquer-yuyan';

/** Soldiers one archer can call. */
const CALL_CAP = 2;

/** Pinned: nobody can defend the holder, not even itself. */
const CLAVAT: StatusBehavior = {
  preventsGuard() { return true; },
  positionValue() { return -0.12; },
};

/** The holder's next blow deals no damage (a pinning shot), once. */
const SENSE_DANY: StatusBehavior = {
  onAttackAction(ctx) { ctx.holder.clearStatus(ctx.key); return { damageMult: 0 }; },
};

const ARCHER_SKILL: SkillDefinition = {
  id: SKILL_ID, displayName: 'Arquer yuyan', classCss: 'foc', category: 'enemy',
  description: "Pot clavar una mosca a un arbre a cent passes sense matar-la.",
  iconPath: ICON + 'lorc/bowman.svg',
  actions: [
    action({
      id: 'fletxa-a-l-escletxa', name: "Fletxa a l'escletxa", skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 3, dice: d(2, 4),
      effects: [{ type: 'piercing' }],
      desc: "Ignora l'armadura.",
      icon: 'lorc/arrowhead.svg',
    }),
    action({
      id: 'fletxa-de-senyal', name: 'Fletxa de senyal', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Focus, speed: -2,
      effects: [{ type: 'signal_arrow' }],
      desc: `Crida un soldat del foc al combat (com a màxim ${CALL_CAP} per arquer).`,
      icon: 'lorc/flaming-arrow.svg',
    }),
    action({
      id: 'clavar-a-l-arbre', name: "Clavar a l'arbre", skillId: SKILL_ID,
      unlock: 3, type: ActionType.Atac, speed: 2, dice: d(2, 6),
      effects: [{ type: 'pin_to_tree' }],
      desc: "No fa dany. Si supera la defensa (o no n'hi ha), fins al final del torn següent ningú no pot defensar l'objectiu, ni ell mateix.",
      icon: 'lorc/pierced-body.svg',
    }),
  ],
  effects: {
    signal_arrow: {
      getTargetRequirement() { return 'none'; },
      onResolve(ctx) {
        const called = ctx.source.getStatusValue('soldats-cridats', 0);
        if (called >= CALL_CAP) return;
        // A summon has no printed PV: the archer's own, scaled by the bulk
        // ratio — what the balancer would have given a soldier in this fight.
        const pv = Math.max(1, Math.round(ctx.source.maxPV * 1.05));
        const soldier = createEnemy('soldat-del-foc', { pv, name: 'Soldat del foc (reforç)' });
        if (!soldier) return;
        ctx.engine.addCombatant(ctx.source.team, soldier);
        ctx.source.setStatus('soldats-cridats', called + 1, -1);
      },
      aiWeight(ctx) { return ctx.actor.getStatusValue('soldats-cridats', 0) < CALL_CAP ? 0.7 : -2; },
    },
    pin_to_tree: {
      onPlay(ctx) { ctx.source.setStatus('tret-sense-dany', 1, 1, undefined, SENSE_DANY); },
      onAttackHit(ctx) {
        const t = ctx.targets[0];
        if (!t || !t.isAlive()) return;
        t.setStatus('clavat', 1, 2, { harm: 1 }, CLAVAT);
        ctx.engine.log('attack', `${t.name} queda clavat: ningú no el pot defensar fins al final del torn següent.`, ctx.source.team);
      },
      aiWeight(ctx) { return ctx.allies.length >= 1 ? 0.8 : 0.2; },
    },
  },
};

export const ARQUER_YUYAN: EnemyDefinition = {
  id: SKILL_ID, displayName: 'Arquer yuyan', classCss: 'foc', iconPath: ICON + 'lorc/bowman.svg',
  /** ~70 kg. */
  bulk: 1.0,
  skills: [ARCHER_SKILL],
};
