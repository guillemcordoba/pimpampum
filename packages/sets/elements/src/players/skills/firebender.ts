import { ActionType, Character, CombatModifier, EffectHandler, EngineApi, StatusBehavior, random } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { num } from '../effects/helpers.js';
import { BURN_PV, BURN_TURNS, setAlight } from '../effects/cremat.js';

/**
 * MESTRE DEL FOC — the user's design ("Maestre del foc — conceptes de cartes",
 * 2026-11-01): fire burns. Cremat is the kit's thread (cards 1, 2, 9, and 6 on the bender's own side); the
 * rest is raw heat — a chi that stokes every blow, a storm of sparks, a
 * blinding flash, a wildfire that grows until it has consumed its victim, a
 * fury too big to hold, a bolt, and the supernova that burns the bender out.
 * The numbers are this file's, on the dice ladder (intentions.md).
 */

const SKILL_ID = 'firebender';

function backfire(bender: Character, engine: EngineApi): void {
  for (const c of engine.alliesOf(bender, true)) setAlight(c, bender, engine);
}

// Cremat (cards 1, 2, 9, and 6 on the bender's own side) is the set's shared burn (`effects/cremat.ts`).

// --- 7 · Incendi -------------------------------------------------------------

const WILDFIRE_KEY = 'incendi';
const WILDFIRE_STEP_PV = 2;

function kindle(target: Character, source: Character | undefined, engine: EngineApi): void {
  target.setStatus(WILDFIRE_KEY, 1, -1, { source }, WILDFIRE);
  engine.log('attack', `${target.name} s'encén: l'incendi creix cada torn.`, source?.team);
}

const WILDFIRE: StatusBehavior = {
  harmful: true,
  // `value` is the step: 2 PV, then 4, then 6… until the holder falls; then
  // the fire leaps to one of its allies and starts again.
  onRoundEnd(ctx) {
    const source = ctx.entry.data?.['source'] as Character | undefined;
    if (ctx.holder.isAlive()) {
      const loss = WILDFIRE_STEP_PV * ctx.entry.value;
      ctx.engine.log('poison', `L'incendi crema ${ctx.holder.name}: ${loss} PV.`, ctx.holder.team);
      ctx.engine.applyPvLoss(ctx.holder, loss, source);
      ctx.entry.value += 1;
    }
    if (ctx.holder.isAlive()) return;
    ctx.holder.clearStatus(WILDFIRE_KEY);
    const fuel = ctx.engine.alliesOf(ctx.holder).filter(a => !a.hasStatus(WILDFIRE_KEY));
    if (fuel.length) kindle(fuel[Math.floor(random() * fuel.length)], source, ctx.engine);
  },
  // The next three rounds of a fire that grows, at most what the holder has left.
  positionValue(ref) {
    const step = ref.entry.value;
    const loss = WILDFIRE_STEP_PV * (3 * step + 3);
    return -Math.min(loss, ref.holder.currentPV) / Math.max(1, ref.holder.maxPV);
  },
};

// --- 9 · Anell de foc ---------------------------------------------------------

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
  // 1 · Bola de foc: a target it wounds is burned.
  sets_alight: {
    onAttackHit(ctx) {
      if (ctx.target && (ctx.damageDealt ?? 0) > 0) setAlight(ctx.target, ctx.source, ctx.engine);
    },
    aiWeight() { return 0.3; },
  },

  // 6 · Fúria de flames: a blaze too big to hold — if it wounds nobody, it
  // bursts around the bender, and the bender and every ally are burned.
  fury: {
    onAttackHit(ctx) { if ((ctx.damageDealt ?? 0) <= 0) backfire(ctx.source, ctx.engine); },
    onAttackMiss(ctx) { backfire(ctx.source, ctx.engine); },
    aiWeight() { return 0.3; },
  },

  // 2 · Mantell de flames: whoever attacks someone it defends is burned, held or not.
  flame_cloak: {
    onDefend(ctx) { if (ctx.target) setAlight(ctx.target, ctx.source, ctx.engine); },
    onBlockFail(ctx) { if (ctx.target) setAlight(ctx.target, ctx.source, ctx.engine); },
    aiWeight() { return 0.4; },
  },

  // 5 · Esclat encegador: every enemy still to attack this round rolls 1d20;
  // at `below` or less, blinded, its attack misses.
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
        ctx.engine.cancelPendingAction(p.actor);
        ctx.engine.log('focus', `🎲 ${p.actor.name} treu ${roll}: enlluernat, el seu atac falla.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.5 : 0.2; },
  },

  // 4 · Tempesta d'espurnes: every enemy loses the card's dice in PV, rolled
  // for each — no contest, no defense, no armour.
  ember_storm: {
    modifyAttack(ctx) {
      if (!ctx.attackMods || !ctx.target) return;
      ctx.attackMods.skip = true;
      const loss = ctx.engine.contestRoll(ctx.source, ctx.action.dice, { kind: 'attack', skillId: SKILL_ID, rollBonus: ctx.action.rollBonus }).total;
      ctx.engine.log('attack', `Les espurnes cremen ${ctx.target.name}: ${loss} PV.`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.target, loss, ctx.source);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.9 : 0.2; },
  },

  // 7 · Incendi: a target it wounds catches the wildfire (unless it already burns with it).
  wildfire: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t?.isAlive() || (ctx.damageDealt ?? 0) <= 0 || t.hasStatus(WILDFIRE_KEY)) return;
      kindle(t, ctx.source, ctx.engine);
    },
    aiWeight() { return 0.6; },
  },

  // 3 · Foc interior: +`bonus` on the bender's attacks for the next `turns` rounds.
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

  // 9 · Anell de foc: for the next two rounds, every enemy that attacks loses
  // `loss` PV and is burned.
  fire_ring: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const loss = num(ctx.params, 'loss', 6);
      // Set in the Focus step: the round's end takes one, two rounds remain.
      for (const e of ctx.engine.enemiesOf(ctx.source)) e.setStatus(RING_KEY, loss, 3, { caster: ctx.source }, RING);
      ctx.engine.log('focus', `${ctx.source.name} tanca un anell de foc al voltant del combat.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.8 : 0.4; },
  },

  // 10 · Supernova: once it has struck, the bender burns out — 0 PV, unconscious.
  supernova: {
    aiFellsItsPlayer() { return true; },
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
      unlock: 1, type: ActionType.Atac, dice: d(1, 4),
      effects: [{ type: 'sets_alight' }],
      desc: "Si fereix, l'objectiu queda cremat: perd 2 PV al final d'aquest torn i del següent.",
      icon: 'lorc/fireball.svg',
    }),
    action({
      id: 'mantell-de-flames', name: 'Mantell de flames', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(2, 4),
      effects: [{ type: 'flame_cloak' }],
      desc: 'Qui ataqui algú que defenses queda cremat, aguantis o no.',
      icon: 'lorc/fire-silhouette.svg',
    }),
    action({
      id: 'foc-interior', name: 'Foc interior', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'inner_blaze', params: { bonus: 10, turns: 2 } }],
      desc: 'Els teus atacs tenen +10 els 2 torns següents.',
      icon: 'lorc/meditation.svg',
    }),
    action({
      id: 'tempesta-d-espurnes', name: "Tempesta d'espurnes", skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, dice: d(1, 4), targetCount: 99,
      effects: [{ type: 'ember_storm' }],
      desc: 'Cada enemic perd 1d4 PV.',
      icon: 'lorc/circle-sparks.svg',
    }),
    action({
      id: 'esclat-encegador', name: 'Esclat encegador', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Focus, fast: true,
      effects: [{ type: 'flare', params: { below: 14 } }],
      desc: "Cada enemic que encara hagi d'atacar aquest torn tira 1d20: amb 14 o menys, el seu atac falla.",
      icon: 'lorc/sunbeams.svg',
    }),
    action({
      id: 'furia-de-flames', name: 'Fúria de flames', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, dice: d(3, 6),
      effects: [{ type: 'fury' }],
      desc: 'Si no fereix, la fúria esclata al teu voltant: tu i els teus aliats quedeu cremats.',
      icon: 'lorc/burning-passion.svg',
    }),
    action({
      id: 'incendi', name: 'Incendi', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Atac, dice: d(2, 4, 1),
      effects: [{ type: 'wildfire' }],
      desc: "Si fereix, l'objectiu crema: perd 2, 4, 6… PV al final de cada torn fins que cau; llavors el foc salta a un enemic a l'atzar.",
      icon: 'lorc/burning-tree.svg',
    }),
    action({
      id: 'llamp', name: 'Llamp', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Atac, fast: true, dice: d(2, 6),
      desc: '',
      icon: 'lorc/heavy-lightning.svg',
    }),
    action({
      id: 'anell-de-foc', name: 'Anell de foc', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus,
      effects: [{ type: 'fire_ring', params: { loss: 10 } }],
      desc: 'Els 2 torns següents, cada enemic que ataqui perd 10 PV i queda cremat.',
      icon: 'lorc/fire-ring.svg',
    }),
    action({
      id: 'supernova', name: 'Supernova', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(5, 6, 2), targetCount: 99,
      effects: [{ type: 'supernova' }],
      desc: 'Afecta tots els enemics. Després quedes a 0 PV, inconscient.',
      icon: 'lorc/bright-explosion.svg',
    }),
  ],
  effects: FIRE_EFFECTS,
};
