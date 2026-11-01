import { ActionType, Character, CombatModifier, EffectHandler, EngineApi, StatusBehavior, applyKind } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * MESTRE DEL FOC — the user's design ("Maestre del foc — conceptes de cartes",
 * 2026-11-01): fire burns. Cremat is the kit's thread (cards 1, 2, 6, 8); the
 * rest is raw heat — a blinding flash, a storm of sparks, a skin of cooled
 * lava, a chi that stokes every blow, a bolt, and the supernova that burns the
 * bender out. The numbers are this file's, on the dice ladder (intentions.md).
 */

const SKILL_ID = 'firebender';

// --- Cremat (cards 1, 2, 6, 8) ----------------------------------------------
// The engine's damage over time: BURN_PV at the end of this round and the
// next. Burning again restarts the two rounds; it never stacks.

const BURN_KEY = 'cremat';
const BURN_PV = 1;
const BURN_TURNS = 2;

function setAlight(target: Character, source: Character, engine: EngineApi): void {
  if (!target.isAlive()) return;
  applyKind(target, 'damageOverTime', BURN_KEY, BURN_PV, BURN_TURNS, { source });
  engine.log('attack', `${target.name} queda cremat.`, source.team);
}

// --- 5 · Pell d'obsidiana -----------------------------------------------------

const OBSIDIAN_KEY = "pell-d-obsidiana";

// --- 8 · Anell de foc ---------------------------------------------------------

const RING_KEY = 'anell-de-foc';

/** Inside the ring: every attack the holder makes costs it `value` PV and sets it alight. */
const RING: StatusBehavior = {
  harmful: true,
  onAttackAction(ctx) {
    const caster = ctx.entry.data?.['caster'];
    if (!(caster instanceof Character)) return;
    ctx.engine.log('attack', `${ctx.holder.name} travessa l'anell de foc: ${ctx.entry.value} PV.`, caster.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.entry.value, caster);
    setAlight(ctx.holder, caster, ctx.engine);
  },
  // Paid only when the holder attacks, which is most rounds.
  positionValue(ref) {
    const rounds = ref.entry.remaining < 0 ? 3 : Math.min(ref.entry.remaining, 3);
    return -0.8 * rounds * (ref.entry.value + BURN_PV * BURN_TURNS) / Math.max(1, ref.holder.maxPV);
  },
};

const FIRE_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Bola de foc, 6 · Alè de drac: a target it wounds is burned.
  sets_alight: {
    onAttackHit(ctx) {
      if (ctx.target && (ctx.damageDealt ?? 0) > 0) setAlight(ctx.target, ctx.source, ctx.engine);
    },
    aiWeight() { return 0.3; },
  },

  // 2 · Mantell de flames: whoever attacks someone it defends is burned, held or not.
  flame_cloak: {
    onDefend(ctx) { if (ctx.target) setAlight(ctx.target, ctx.source, ctx.engine); },
    onBlockFail(ctx) { if (ctx.target) setAlight(ctx.target, ctx.source, ctx.engine); },
    aiWeight() { return 0.4; },
  },

  // 3 · Esclat: every enemy still to attack this round rolls 1d20; at `below`
  // or less its attack goes to a random combatant, its own allies included.
  flare: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const below = num(ctx.params, 'below', 5);
      ctx.engine.log('focus', `${ctx.source.name} esclata en una llum encegadora.`, ctx.source.team);
      for (const p of ctx.engine.plannedThisRound()) {
        if (p.resolved || p.cancelled || p.actor.team === ctx.source.team || !p.actor.isAlive()) continue;
        if (p.action.actionType !== ActionType.Atac) continue;
        const roll = ctx.engine.rollDie(20);
        if (roll > below) {
          ctx.engine.log('focus', `🎲 ${p.actor.name} treu ${roll}: hi veu prou.`, ctx.source.team);
          continue;
        }
        const pool = [...ctx.engine.alliesOf(p.actor, false), ...ctx.engine.enemiesOf(p.actor)].filter(c => c.isAlive());
        if (!pool.length) continue;
        const to = pool[ctx.engine.rollDie(pool.length) - 1];
        applyKind(p.actor, 'redirected', 'enlluernat', 1, 1, { to });
        ctx.engine.log('focus', `🎲 ${p.actor.name} treu ${roll}: enlluernat, ataca ${to.name}.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.5 : 0.2; },
  },

  // 4 · Tempesta d'espurnes: every enemy loses `loss` PV — no roll, no defense.
  ember_storm: {
    modifyAttack(ctx) {
      if (!ctx.attackMods || !ctx.target) return;
      ctx.attackMods.skip = true;
      const loss = num(ctx.params, 'loss', 2);
      ctx.engine.log('attack', `Les espurnes cremen ${ctx.target.name}: ${loss} PV.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.target, loss, ctx.source);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.9 : 0.2; },
  },

  // 5 · Pell d'obsidiana: next round the skin still stands — a standing wall
  // with the card's dice before the bender and whoever it defended.
  obsidian_skin: {
    postRound(ctx) {
      const dice = ctx.action.dice;
      if (!dice || !ctx.source.isAlive()) return;
      const covered = new Set([ctx.source, ...ctx.targets.filter(t => t.team === ctx.source.team)]);
      for (const c of covered) {
        if (!c.isAlive()) continue;
        applyKind(c, 'standingWall', OBSIDIAN_KEY, 1, 2,
          { caster: ctx.source, dice, skillId: SKILL_ID, rollBonus: ctx.action.rollBonus ?? 0, name: "Pell d'obsidiana" });
      }
    },
    aiWeight() { return 0.5; },
  },

  // 7 · Foc interior: +`bonus` on the bender's attacks for the next `turns` rounds.
  inner_blaze: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const bonus = num(ctx.params, 'bonus', 4);
      const turns = num(ctx.params, 'turns', 2);
      ctx.source.modifiers.push(new CombatModifier('attack', bonus, { remaining: turns, pending: true }).withSource('Foc interior'));
      ctx.engine.log('focus', `${ctx.source.name} concentra el foc interior: +${bonus} als atacs.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // 8 · Anell de foc: for the next two rounds, every enemy that attacks loses
  // `loss` PV and is burned.
  fire_ring: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const loss = num(ctx.params, 'loss', 3);
      // Set in the Focus step: the round's end takes one, two rounds remain.
      for (const e of ctx.engine.enemiesOf(ctx.source)) e.setStatus(RING_KEY, loss, 3, { caster: ctx.source }, RING);
      ctx.engine.log('focus', `${ctx.source.name} tanca un anell de foc al voltant del combat.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.8 : 0.4; },
  },

  // 10 · Supernova: once it has struck, the bender burns out — 0 PV, unconscious.
  supernova: {
    onAttackResolved(ctx) {
      if (!ctx.source.isAlive()) return;
      ctx.engine.log('attack', `${ctx.source.name} es consumeix en la supernova i cau inconscient.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.source, ctx.source.currentPV, undefined);
    },
    aiWeight(ctx) { return ctx.enemies.length > 2 ? 0.6 : 0.1; },
  },
};

export const FIREBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: 'Mestre del foc', classCss: 'foc', category: 'player',
  description: 'El foc crema: qui el toca, qui el travessa i qui el desafia.',
  iconPath: 'icons/000000/transparent/1x1/sbed/fire.svg',
  actions: [
    action({
      id: 'bola-de-foc', name: 'Bola de foc', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, dice: d(1, 6),
      effects: [{ type: 'sets_alight' }],
      desc: "Si fereix, l'objectiu queda cremat: perd 1 PV al final d'aquest torn i del següent.",
      icon: 'lorc/fireball.svg',
    }),
    action({
      id: 'mantell-de-flames', name: 'Mantell de flames', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'flame_cloak' }],
      desc: 'Qui ataqui algú que defenses queda cremat, aguantis o no.',
      icon: 'lorc/fire-silhouette.svg',
    }),
    action({
      id: 'esclat', name: 'Esclat', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, fast: true,
      effects: [{ type: 'flare', params: { below: 8 } }],
      desc: 'Cada enemic que encara hagi d\'atacar aquest torn tira 1d20: amb 8 o menys, el seu atac va contra un combatent a l\'atzar, aliats seus inclosos.',
      icon: 'lorc/sunbeams.svg',
    }),
    action({
      id: 'tempesta-d-espurnes', name: "Tempesta d'espurnes", skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, targetCount: 99,
      effects: [{ type: 'ember_storm', params: { loss: 2 } }],
      desc: 'Cada enemic perd 2 PV.',
      icon: 'lorc/circle-sparks.svg',
    }),
    action({
      id: 'pell-d-obsidiana', name: "Pell d'obsidiana", skillId: SKILL_ID,
      unlock: 5, type: ActionType.Defensa, dice: d(2, 6),
      effects: [{ type: 'obsidian_skin' }],
      desc: 'Defensa també el torn següent.',
      icon: 'lorc/dripping-stone.svg',
    }),
    action({
      id: 'ale-de-drac', name: 'Alè de drac', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, dice: d(2, 6), targetCount: 2,
      effects: [{ type: 'sets_alight' }],
      desc: 'Afecta dos enemics. Els que fereix queden cremats.',
      icon: 'lorc/dragon-breath.svg',
    }),
    action({
      id: 'foc-interior', name: 'Foc interior', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus,
      effects: [{ type: 'inner_blaze', params: { bonus: 6, turns: 2 } }],
      desc: 'Els teus atacs tenen +6 els 2 torns següents.',
      icon: 'lorc/meditation.svg',
    }),
    action({
      id: 'anell-de-foc', name: 'Anell de foc', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Focus,
      effects: [{ type: 'fire_ring', params: { loss: 3 } }],
      desc: 'Els 2 torns següents, cada enemic que ataqui perd 3 PV i queda cremat.',
      icon: 'lorc/fire-ring.svg',
    }),
    action({
      id: 'llamp', name: 'Llamp', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Atac, dice: d(4, 6),
      desc: '',
      icon: 'lorc/heavy-lightning.svg',
    }),
    action({
      id: 'supernova', name: 'Supernova', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(6, 6), targetCount: 99,
      effects: [{ type: 'supernova' }],
      desc: 'Afecta tots els enemics. Després quedes a 0 PV, inconscient.',
      icon: 'lorc/bright-explosion.svg',
    }),
  ],
  effects: FIRE_EFFECTS,
};
