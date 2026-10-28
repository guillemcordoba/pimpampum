import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { burn } from '../../players/effects/generic.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * Fire Nation infantry: the face of every raid. Alone a soldier is a jab;
 * the threat is the LINE — they pile onto whoever is already bleeding, torch
 * the ground, and punch in unison. Kill them fast or meet the volley with a
 * wall. Wears plate (natural armour), the metal an earthbender can bend.
 */
const SKILL_ID = 'soldat-del-foc';

const SOLDIER_SKILL: SkillDefinition = {
  id: SKILL_ID, displayName: 'Soldat del foc', classCss: 'foc', category: 'enemy',
  description: 'Sol és un cop de puny encès. En filera, és un riu de foc.',
  iconPath: ICON + 'lorc/visored-helm.svg',
  actions: [
    action({
      id: 'punyals-de-foc', name: 'Punyals de foc', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, dice: d(2, 4),
      effects: [{ type: 'pile_on' }],
      desc: "+2 si l'objectiu ja ha perdut PV aquest torn.",
      icon: 'lorc/fire-dash.svg',
    }),
    action({
      id: 'calar-foc', name: 'Calar foc', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Focus,
      effects: [{ type: 'set_ablaze' }],
      desc: "Durant 2 torns, cada heroi perd 2 PV al final del torn. No s'acumula.",
      icon: 'delapouite/burning-forest.svg',
    }),
    action({
      id: 'foc-en-formacio', name: 'Foc en formació', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Atac, dice: d(2, 6),
      effects: [{ type: 'formation' }],
      desc: '+2 per cada altre soldat que també la jugui aquest torn (fins a +6).',
      icon: 'lorc/fire-bowl.svg',
    }),
  ],
  effects: {
    // Punyals de foc: the horde piles onto whoever is already bleeding.
    pile_on: {
      modifyAttack(ctx) {
        if (ctx.attackMods && ctx.target?.hitThisTurn) ctx.attackMods.rollBonus += 2;
      },
    },
    // Calar foc: the field burns — every hero 1 PV at each of the next two
    // round ends. A second torch only relights the same fire.
    set_ablaze: {
      getTargetRequirement() { return 'none'; },
      onResolve(ctx) {
        for (const h of ctx.engine.enemiesOf(ctx.source)) burn(h, 2, 2, ctx.action.name, ctx.engine.round);
        ctx.engine.log('focus', `${ctx.source.name} cala foc al camp.`, ctx.source.team);
      },
      aiWeight(ctx) { return ctx.enemies.some(e => e.hasStatus('cremant')) ? -1 : 0.8; },
    },
    // Foc en formació: +2 for every other soldier playing it this round, +6 at most.
    formation: {
      modifyAttack(ctx) {
        if (!ctx.attackMods) return;
        const others = ctx.engine.plannedThisRound().filter(p =>
          p.actor !== ctx.source && p.actor.team === ctx.source.team && !p.cancelled && p.action.id === ctx.action.id).length;
        ctx.attackMods.rollBonus += Math.min(6, 2 * others);
      },
      aiWeight(ctx) { return ctx.allies.length >= 2 ? 0.8 : 0; },
    },
  },
};

export const SOLDAT_DEL_FOC: EnemyDefinition = {
  id: SKILL_ID, displayName: 'Soldat del foc', classCss: 'foc', iconPath: ICON + 'lorc/visored-helm.svg',
  /** ~80 kg with plate. */
  bulk: 1.05,
  naturalArmor: 1,
  skills: [SOLDIER_SKILL],
};
