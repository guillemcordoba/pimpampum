import { ActionType, EffectContext, EffectHandler, StatusBehavior, random } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';

/**
 * MESTRE DE L'AIRE — baguazhang: circle, never meet force, never be where the
 * blow lands. Two threads rise with the level: THROWING (a beat back, 1; out
 * of the round, 5; everyone out, 9; everyone hurled into each other, 10) and
 * EVADING (one blow misses, 3; every enemy drawn and dodged, 4; gone after the
 * strike, 7; untouchable until the meteor lands, 8).
 *
 * Its first card is the twin of the Mestre de la Por's: he was once an air
 * novice (DESIGN.md). Concepts by the `card-taste` agent, picked by the user.
 */

const SKILL_ID = 'airbender';

/** Every attack on the holder this round lands on air. */
const FUGA: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage > 0) ctx.engine.log('defense', `El cop contra ${ctx.holder.name} només troba aire.`, ctx.holder.team);
    return 0;
  },
  positionValue() { return 0.1; },
};

// --- 2 · Coixí de vent ------------------------------------------------------

/** This round the holder cannot drop below 1 PV. */
const COIXI: StatusBehavior = {
  clampPvLoss(ref, amount) { return Math.min(amount, Math.max(0, ref.holder.currentPV - 1)); },
  positionValue() { return 0.1; },
};

// --- 3 · Patinet d'aire -----------------------------------------------------

/** Next round: the holder acts first, and the first attack on it misses. */
const PATINET: StatusBehavior = {
  modifySpeed(ref) { return ref.entry.remaining <= 1 ? 10 : 0; },
  modifyIncomingDamage(ctx, damage) {
    if (ctx.entry.remaining > 1 || damage <= 0) return damage;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('defense', `${ctx.holder.name} s'esmuny amb el patinet d'aire: el cop falla.`, ctx.holder.team);
    return 0;
  },
  positionValue() { return 0.08; },
};

// --- 6 · Remolí del mareig --------------------------------------------------

/** Dizzy: this round the holder's blows go at a random combatant. */
const MAREIG: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    const everyone = [...ctx.engine.livingTeam(0), ...ctx.engine.livingTeam(1)].filter(c => c !== ctx.holder);
    return everyone.length ? everyone[Math.floor(random() * everyone.length)] : intended;
  },
  positionValue() { return -0.1; },
};

const AIR_EFFECTS: Record<string, EffectHandler> = {
  // 2 · Coixí de vent: whoever this defense guards cannot drop below 1 PV
  // this round — the bender too, who takes what gets through a guard.
  cushion: {
    onResolve(ctx) {
      for (const t of new Set([ctx.source, ...ctx.targets.filter(t => t.team === ctx.source.team && t.isAlive())])) {
        t.setStatus('coixi-de-vent', 1, 1, undefined, COIXI);
      }
    },
    aiWeight(ctx) { return [ctx.actor, ...ctx.allies].some(a => a.currentPV <= a.maxPV * 0.4) ? 1 : 0.2; },
  },

  // 3 · Patinet d'aire: next round the bender acts first and the first attack
  // on it misses.
  air_scooter: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      ctx.source.setStatus('patinet-d-aire', 1, 2, undefined, PATINET);
      ctx.engine.log('focus', `${ctx.source.name} salta al patinet d'aire.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // 4 · Esquivar-los a tots: block every enemy at once.
  dodge_them_all: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      for (const e of ctx.engine.enemiesOf(ctx.source)) e.blockers.push({ defender: ctx.source, action: ctx.action });
      ctx.engine.log('defense', `${ctx.source.name} dansa entre tots els enemics: tots l'han d'atacar a ell.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.some(a => a.currentPV < a.maxPV * 0.5) ? 0.9 : 0.3; },
  },

  // 6 · Remolí del mareig: the blocked enemy's blows go at a random
  // combatant this round.
  dizzying_whirl: {
    onResolve(ctx) {
      for (const e of ctx.targets.filter(t => t.team !== ctx.source.team && t.isAlive())) {
        e.setStatus('mareig', 1, 1, { harm: 1 }, MAREIG);
      }
    },
    aiWeight() { return 0.5; },
  },

  // 9 · Ull de l'huracà: the storm throws their aim — this round every enemy
  // it wounds strikes a random combatant. (Taking the whole side's action away
  // decided the fight in round 1, 2026-10-07.)
  storm_aim: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      t.setStatus('mareig', 1, 1, { harm: 1 }, MAREIG);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.9 : 0.3; },
  },

  // 7 · Cop i fuga: after the strike, attacks on the bender miss this round.
  hit_and_vanish: {
    onAttackHit(ctx) { vanish(ctx); },
    onAttackMiss(ctx) { vanish(ctx); },
    aiWeight() { return 0.6; },
  },

  // 8 · Salt del meteor: from the reveal until it lands, attacks on the
  // bender miss.
  meteor_leap: {
    onReveal(ctx) { ctx.source.setStatus('salt-del-meteor', 1, 1, undefined, FUGA); },
    onPlay(ctx) { ctx.source.clearStatus('salt-del-meteor'); },
    aiWeight() { return 0.7; },
  },
};

function vanish(ctx: EffectContext): void {
  if (!ctx.source.isAlive() || ctx.source.hasStatus('fuga')) return;
  ctx.source.setStatus('fuga', 1, 1, undefined, FUGA);
  ctx.engine.log('attack', `${ctx.source.name} ja no hi és.`, ctx.source.team);
}

export const AIRBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: "Mestre de l'aire", classCss: 'aire', category: 'player',
  description: "L'aire no xoca mai amb la força: mai no és on cau el cop.",
  iconPath: 'icons/000000/transparent/1x1/lorc/whirlwind.svg',
  actions: [
    action({
      id: 'palmell-d-aire', name: "Palmell d'aire", skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 5, dice: d(1, 6),
      effects: [{ type: 'delay_on_hit' }],
      desc: "Si fereix, l'objectiu actua l'últim aquest torn.",
      icon: 'lorc/palm.svg',
    }),
    action({
      id: 'coixi-de-vent', name: 'Coixí de vent', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, speed: 4, dice: d(3, 4),
      effects: [{ type: 'cushion' }],
      desc: "Aquest torn, l'aliat que defenses no pot baixar d'1 PV.",
      icon: 'lorc/feather.svg',
    }),
    action({
      id: 'patinet-d-aire', name: "Patinet d'aire", skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, speed: 4,
      effects: [{ type: 'air_scooter' }],
      desc: 'El torn següent actues primer, i el primer atac contra tu falla.',
      icon: 'lorc/orbital.svg',
    }),
    action({
      id: 'esquivar-los-a-tots', name: 'Esquivar-los a tots', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Defensa, speed: 4, dice: d(3, 4),
      effects: [{ type: 'dodge_them_all' }],
      desc: 'Bloqueja tots els enemics.',
      icon: 'lorc/dodging.svg',
    }),
    action({
      id: 'catapulta-de-vent', name: 'Catapulta de vent', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, speed: 4, dice: d(2, 6),
      effects: [{ type: 'cancel_on_hit' }],
      desc: "Si fereix, l'objectiu perd la seva acció d'aquest torn.",
      icon: 'lorc/tornado.svg',
    }),
    action({
      id: 'remoli-del-mareig', name: 'Remolí del mareig', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Defensa, speed: 3, dice: d(3, 6),
      effects: [{ type: 'block_only' }, { type: 'dizzying_whirl' }],
      desc: 'Bloqueja un enemic. Aquest torn, els seus atacs van contra un combatent a l\'atzar.',
      icon: 'lorc/vortex.svg',
    }),
    action({
      id: 'cop-i-fuga', name: 'Cop i fuga', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Atac, speed: 3, dice: d(3, 6),
      effects: [{ type: 'hit_and_vanish' }],
      desc: "Després de l'atac, els atacs contra tu fallen la resta del torn.",
      icon: 'lorc/run.svg',
    }),
    action({
      id: 'salt-del-meteor', name: 'Salt del meteor', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Atac, speed: -2, dice: d(2, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'meteor_leap' }],
      desc: 'Puges 1 nivell de fatiga. Afecta tots els enemics. Fins que es resol, els atacs contra tu fallen.',
      icon: 'lorc/meteor-impact.svg',
    }),
    action({
      id: 'ull-de-l-huraca', name: "Ull de l'huracà", skillId: SKILL_ID,
      unlock: 9, type: ActionType.Atac, speed: 7, dice: d(2, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'storm_aim' }],
      desc: "Puges 2 nivells de fatiga. Afecta tots els enemics. Aquest torn, els que fereix ataquen un combatent a l'atzar.",
      icon: 'lorc/whirlwind.svg',
    }),
    action({
      id: 'bosc-de-tornados', name: 'Bosc de tornados', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, speed: 1, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'hurl_into_another', params: { alone: 'twice' } }],
      desc: 'Puges 2 nivells de fatiga. Afecta tots els enemics. Cada un que fereix és llançat contra un altre enemic a l\'atzar, que rep el mateix dany; si no n\'hi ha cap, s\'estavella contra el terra i el rep dos cops.',
      icon: 'lorc/tornado-discs.svg',
    }),
  ],
  effects: AIR_EFFECTS,
};
