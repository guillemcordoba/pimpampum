import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { standingWallAction } from '../cards/index.js';
import { num } from '../effects/helpers.js';

/**
 * Dominador de la terra — Toph-style earthbending: the immovable counter-
 * striker. Waits, listens through the ground, answers head-on. The most
 * defensa-weighted skill in the game: a wall that keeps standing until
 * something smashes through it (the SHARED Mur de pedra card, cards/
 * standing-wall.ts), and a capstone that swallows an enemy whole.
 */

// Presó de terra: swallowed whole — unreachable, and pinned so only Focus
// actions (concentration needs no limbs) can be played.
const ENTERRAT: StatusBehavior = {
  untargetable() { return true; },
  blocksActionType(_ref, type) { return type !== ActionType.Focus; },
};

const TERRA_EFFECTS: Record<string, EffectHandler> = {
  // Presó de terra: the earth swallows the chosen enemy whole — no contest.
  bury: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const turns = num(ctx.params, 'turns', 3);
      // remaining = turns + 1: unreachable for the rest of this round plus
      // the `turns` rounds they spend swallowed (Focus-only); they surface
      // targetable and free.
      target.setStatus('enterrat', 1, turns + 1, undefined, ENTERRAT);
      ctx.engine.log('focus', `La terra s'obre i s'empassa ${target.name} sencer!`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.6 : 1.0; },
  },
};

export const EARTHBENDER: SkillDefinition = {
  id: 'earthbender', displayName: 'Earthbender', classCss: 'terra', category: 'player',
  description: 'Terracontrol: espera immòbil, escolta la terra i respon de front.',
  iconPath: ICON_PREFIX + 'lorc/stone-block.svg',
  actions: [
    action({
      id: 'cop-de-roca', name: 'Cop de roca', skillId: 'earthbender',
      unlock: 1, type: ActionType.Atac, speed: 1, dice: d(2, 4),
      desc: '',
      icon: 'delapouite/throwing-ball.svg',
    }),
    action({
      id: 'columna-de-terra', name: 'Columna de terra', skillId: 'earthbender',
      unlock: 2, type: ActionType.Atac, speed: 0, dice: d(2, 6), fatigueCost: 2,
      effects: [
        { type: 'debuff_on_hit', params: { kind: 'speed', amount: 2, duration: 'nextTurn' } },
      ],
      desc: "Si encerta, l'objectiu surt llançat: −2 de velocitat el torn següent.",
      icon: 'delapouite/ionic-column.svg',
    }),
    standingWallAction({ skillId: 'earthbender', unlock: 3 }),
    action({
      id: 'preso-de-terra', name: 'Presó de terra', skillId: 'earthbender',
      unlock: 4, type: ActionType.Focus, speed: -1, fatigueCost: 3,
      effects: [{ type: 'bury', params: { turns: 3 } }],
      desc: "Tria un enemic. La terra se l'empassa durant 3 torns: no pot ser atacat i només pot jugar cartes de Focus.",
      icon: 'lorc/sinking-trap.svg',
    }),
  ],
  effects: TERRA_EFFECTS,
};

export const EARTHBENDER_SKILLS: SkillDefinition[] = [EARTHBENDER];
