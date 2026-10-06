import { ActionType, Character, EffectHandler, EngineApi, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';

/**
 * MESTRE DEL FOC — northern shaolin: breath and drive. Fire uses only its own
 * force and keeps raising it — it stokes (3), turns blue (6), splits
 * lightning (9) and falls like a comet (10) — and whatever touches it burns.
 * One Defensa only: fire does not step back.
 *
 * Concepts by the `card-taste` agent, picked by the user (DESIGN.md); the
 * numbers are this file's.
 */

const SKILL_ID = 'firebender';

// --- 3 · Atiar les brases ---------------------------------------------------

/** The next attack of the holder burns hotter, once. */
const BRASES: StatusBehavior = {
  onAttackAction(ctx) {
    const bonus = ctx.entry.value;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('attack', `Les brases esclaten: +${bonus}.`, ctx.holder.team);
    return { attackRollBonus: bonus };
  },
  positionValue() { return 0.12; },
};

// --- 4 · Anell de flames ----------------------------------------------------

/** Ringed by fire: as the next round opens, the holder burns. */
const ANELL: StatusBehavior = {
  onRoundStart(ctx) {
    const from = ctx.entry.data?.['fromRound'];
    if (typeof from === 'number' && ctx.engine.round < from) return;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('poison', `L'anell de flames crema ${ctx.holder.name}: ${ctx.entry.value} dany.`, ctx.holder.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.entry.value, undefined);
  },
  positionValue(ref) { return -0.04 * ref.entry.value; },
};

const FIRE_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Punys encesos: +2 if the bender attacked last round.
  pressing: {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      const last = ctx.engine.round - 1;
      const attacked = ctx.engine.history.some(ev =>
        ev.round === last && ev.actor === ctx.source && ev.action.actionType === ActionType.Atac);
      if (attacked) ctx.attackMods.rollBonus += 2;
    },
    aiWeight() { return 0.3; },
  },

  // 2 · Escut roent: every attack on whoever it defends costs the attacker
  // 2 PV, held or not.
  scorching_shield: {
    onDefend(ctx) { scorch(ctx.target, ctx.engine); },
    onBlockFail(ctx) { scorch(ctx.target, ctx.engine); },
    aiWeight() { return 0.4; },
  },

  // 3 · Atiar les brases: the bender's next attack has +5.
  stoke: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      ctx.source.setStatus('brases', 5, 3, undefined, BRASES);
      ctx.engine.log('focus', `${ctx.source.name} atia les brases: el proper atac, +5.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.hasStatus('brases') ? -1 : 0.6; },
  },

  // 4 · Anell de flames: a target it wounds burns 3 PV as the next round opens.
  ring_of_fire: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      t.setStatus('anell-de-flames', 3, 2, { harm: 1, fromRound: ctx.engine.round + 1 }, ANELL);
      ctx.engine.log('attack', `Un anell de flames tanca ${t.name}.`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // 9 · Llamp de sang freda: wounded before it fires, the bolt strikes its
  // caster instead of the target.
  cold_blood: {
    modifyAttack(ctx) {
      if (!ctx.attackMods || !ctx.source.hitThisTurn) return;
      ctx.attackMods.skip = true;
      const total = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'attack') + ctx.source.getSkillLevel(SKILL_ID);
      const dmg = Math.max(0, total - ctx.source.getPassiveArmor());
      ctx.engine.log('attack', `${ctx.source.name} perd la calma: el llamp li esclata a les mans (${dmg}).`, ctx.source.team);
      ctx.engine.applyPvLoss(ctx.source, dmg, ctx.source);
    },
    aiWeight() { return 0.6; },
  },
};

function scorch(attacker: Character | undefined, engine: EngineApi): void {
  if (!attacker || !attacker.isAlive()) return;
  engine.log('defense', `L'escut roent crema ${attacker.name}: 2 dany.`, attacker.team);
  engine.applyPvLoss(attacker, 2, undefined);
}

export const FIREBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: 'Mestre del foc', classCss: 'foc', category: 'player',
  description: 'El foc només fa servir la seva pròpia força, i qui el toca es crema.',
  iconPath: 'icons/000000/transparent/1x1/sbed/fire.svg',
  actions: [
    action({
      id: 'punys-encesos', name: 'Punys encesos', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 3, dice: d(2, 4),
      effects: [{ type: 'pressing' }],
      desc: '+2 si vas atacar el torn anterior.',
      icon: 'lorc/fire-punch.svg',
    }),
    action({
      id: 'escut-roent', name: 'Escut roent', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 4),
      effects: [{ type: 'scorching_shield' }],
      desc: "Cada atac contra qui defenses fa perdre 2 PV a l'atacant, aguantis o no.",
      icon: 'lorc/fire-shield.svg',
    }),
    action({
      id: 'atiar-les-brases', name: 'Atiar les brases', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'stoke' }],
      desc: 'El teu proper atac té +5.',
      icon: 'lorc/campfire.svg',
    }),
    action({
      id: 'anell-de-flames', name: 'Anell de flames', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, speed: 1, dice: d(2, 6),
      effects: [{ type: 'ring_of_fire' }],
      desc: "Si fereix, a l'inici del torn següent l'objectiu perd 3 PV.",
      icon: 'lorc/fire-ring.svg',
    }),
    action({
      id: 'vol-propulsat', name: 'Vol propulsat', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, speed: 6, dice: d(2, 6),
      effects: [{ type: 'over_the_guard' }],
      desc: "Cap aliat de l'objectiu no el pot defensar.",
      icon: 'lorc/rocket.svg',
    }),
    action({
      id: 'foc-blau', name: 'Foc blau', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, speed: 1, dice: d(2, 6),
      effects: [{ type: 'piercing' }, { type: 'weaken_defense', params: { amount: 3 } }],
      desc: "Ignora l'armadura. La defensa contra aquest atac té −3.",
      icon: 'lorc/fire-zone.svg',
    }),
    action({
      id: 'esclat-del-tercer-ull', name: 'Esclat del tercer ull', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Atac, speed: 0, dice: d(3, 6),
      effects: [{ type: 'hits_defenders' }],
      desc: "Afecta també tots els qui defensen l'objectiu.",
      icon: 'lorc/third-eye.svg',
    }),
    action({
      id: 'ale-de-drac', name: 'Alè de drac', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Atac, speed: 0, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'burn_on_hit', params: { damage: 2, turns: 1 } }],
      desc: 'Puges 1 nivell de fatiga. Afecta tots els enemics. Els que fereix perden 2 PV al final del torn següent.',
      icon: 'lorc/dragon-breath.svg',
    }),
    action({
      id: 'llamp-de-sang-freda', name: 'Llamp de sang freda', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Atac, speed: -2, dice: d(4, 6),
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'slip_guard' }, { type: 'cold_blood' }],
      desc: "Puges 1 nivell de fatiga. No es pot defensar. Si algú et fereix abans que es resolgui, el llamp et fereix a tu en lloc de l'objectiu.",
      icon: 'lorc/lightning-arc.svg',
    }),
    action({
      id: 'caiguda-de-cometa', name: 'Caiguda de cometa', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, speed: 8, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'over_the_guard' }, { type: 'stun_on_hit', params: { turns: 1 } }],
      desc: 'Puges 2 nivells de fatiga. Afecta tots els enemics, i cap aliat no els pot defensar. Els que fereix perden la seva acció del torn següent.',
      icon: 'lorc/comet-spark.svg',
    }),
  ],
  effects: FIRE_EFFECTS,
};
