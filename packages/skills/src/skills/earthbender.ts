import { ActionType, Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * Dominador de la terra — Toph-style earthbending: the immovable counter-
 * striker. Waits, listens through the ground, answers head-on. The most
 * defensa-weighted skill in the game: a wall that keeps standing until
 * something smashes through it (the generic standingGuard seam), and a
 * capstone that swallows an enemy whole.
 */

// Mur de terra: a standing slab. While it stands, attacks on the holder are
// contested against the CASTER's defense roll; the first blow that penetrates
// shatters it (onStandingGuardBroken) and lands on the holder.
const MUR: StatusBehavior = {
  standingGuard(ctx) {
    const data = ctx.entry.data ?? {};
    const caster = data.caster as Character | undefined;
    if (!caster || !caster.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    const roll = ctx.engine.rollDiceFor(caster, data.dice as DiceRoll | undefined, 'defense');
    return roll + caster.getRollBonus('earthbender', 'defense') + num(data, 'bonus', 2);
  },
  onStandingGuardBroken(ctx) {
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('defense', `El mur de terra que protegia ${ctx.holder.name} es fa miques!`, ctx.holder.team);
  },
};

// Presó de terra: swallowed whole — unreachable, and pinned so only Focus
// actions (concentration needs no limbs) can be played.
const ENTERRAT: StatusBehavior = {
  untargetable() { return true; },
  blocksActionType(_ref, type) { return type !== ActionType.Focus; },
};

const TERRA_EFFECTS: Record<string, EffectHandler> = {
  // Raise a persistent wall on the guarded ally (rides the Defensa flow: this
  // round the earthbender guards normally; the wall status takes over after).
  earth_wall: {
    onResolve(ctx) {
      for (const t of ctx.targets) {
        if (t.team !== ctx.source.team) continue; // walls rise for allies, not blocked enemies
        t.setStatus('mur-de-terra', 1, -1, { caster: ctx.source, bonus: ctx.action.rollBonus ?? 0, dice: ctx.action.dice }, MUR);
        ctx.engine.log('defense', `Un mur de pedra s'alça davant ${t.name} — i s'hi queda.`, t.team);
      }
    },
    aiWeight(ctx) {
      // Walls don't advance the win condition — worth it for a wounded,
      // unwalled ally; a poor default otherwise (overplaying stalls fights).
      const unwalled = [ctx.actor, ...ctx.allies].filter(a => !a.hasStatus('mur-de-terra'));
      if (unwalled.length === 0) return -10;
      return unwalled.some(a => a.currentPV < a.maxPV * 0.6) ? 1.0 : -1.5;
    },
  },

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
    action({
      id: 'mur-de-terra', name: 'Mur de terra', skillId: 'earthbender',
      unlock: 3, type: ActionType.Defensa, speed: 0, dice: d(2, 10), fatigueCost: 3,
      effects: [{ type: 'earth_wall' }],
      desc: 'El mur persisteix: mentre és dret, els atacs contra el protegit es resolen contra la teva defensa. El primer atac que el travessa el destrueix.',
      icon: 'heavenly-dog/defensive-wall.svg',
    }),
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
