import { ActionType, Character, DiceRoll, EffectContext, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { HARM } from '../effects/helpers.js';

/**
 * MESTRE DE L'AIGUA — tai chi: water does not fight with its own force, it
 * takes the enemy's and sends it somewhere else. That redirect is the kit's
 * spine and it grows with the level: the leftover of a blow turned aside (2),
 * the whole blow frozen and thrown back (6), the enemy's blows aimed for him
 * (9), and every blow of a round swallowed and returned (10). Healing, ice and
 * the moon sit around it.
 *
 * Every card was designed as a concept by the `card-taste` agent and picked by
 * the user (DESIGN.md); the numbers are this file's.
 */

const SKILL_ID = 'waterbender';

/** `defender` covers `who` for the rest of the round, with this card's dice. */
function guardWith(defender: Character, who: Character, ctx: EffectContext): void {
  who.guards.push({ defender, action: ctx.action });
}

/** The attack total of a fixed blow — zero dice and the total as modifier. */
const fixed = (total: number) => d(0, 1, Math.max(0, total));

// --- 9 · Sang sota la lluna -------------------------------------------------

/** Under the full moon the holder's blows go where the bender says: every
 *  attack aimed at the bender's side lands on the chosen victim instead. */
const TITELLA: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    const victim = ctx.entry.data?.['victim'];
    if (intended.team === ctx.holder.team) return intended;
    return victim instanceof Character && victim.isAlive() ? victim : intended;
  },
  positionValue() { return -0.15; },
};

// --- 10 · Ira de l'oceà -----------------------------------------------------

/** The ocean over one of the bender's side (its value is the ocean's roll): a
 *  blow that does not beat it sinks, and what it would have done is owed back
 *  to whoever threw it; a blow that beats it smashes through whole. (A wave
 *  that swallowed EVERY blow made the party untouchable for a round, and that
 *  alone carried most fights, 2026-10-07.) */
const ENGOLIT: StatusBehavior = {
  modifyIncomingDamage(ctx, damage, attacker, attackTotal) {
    if (damage <= 0 || !attacker) return damage;
    if ((attackTotal ?? Infinity) > ctx.entry.value) {
      ctx.engine.log('defense', `El cop de ${attacker.name} trenca l'oceà.`, ctx.holder.team);
      return damage;
    }
    attacker.setStatus(DEUTE_KEY, attacker.getStatusValue(DEUTE_KEY, 0) + damage, 1);
    ctx.engine.log('defense', `L'oceà s'empassa el cop contra ${ctx.holder.name} (${damage}).`, ctx.holder.team);
    return 0;
  },
  positionValue() { return 0.1; },
};

const MAREA_KEY = 'ira-de-l-ocea';
/** What one enemy's swallowed blows will cost it when the wave breaks. */
const DEUTE_KEY = 'deute-amb-l-ocea';
/** Fatigue levels the ocean costs. */
const OCEA_FATIGA = 2;

/** The wave breaks at round end: every enemy takes it, plus its OWN swallowed
 *  blows — never the others'. (The whole sum at every enemy grew with the
 *  number of enemies squared: one cast swallowed 112 and dealt 127 to each of
 *  five soldiers, 2026-10-07.) */
const MAREA: StatusBehavior = {
  onRoundEnd(ctx) {
    const src = ctx.holder;
    if (!src.isAlive()) return;
    const dice = ctx.entry.data?.['dice'];
    const own = dice instanceof DiceRoll ? ctx.engine.rollDiceFor(src, dice, 'attack') : 0;
    const base = own + src.getSkillLevel(SKILL_ID);
    ctx.engine.log('attack', `L'oceà es desferma contra tots els enemics.`, src.team);
    for (const e of ctx.engine.enemiesOf(src)) {
      const owed = e.getStatusValue(DEUTE_KEY, 0);
      e.clearStatus(DEUTE_KEY);
      ctx.engine.performExtraAttack(src, e, fixed(base + owed), { label: owed ? `Ira de l'oceà (+${owed} del seu cop)` : `Ira de l'oceà` });
    }
  },
  positionValue() { return 0.1; },
};

const WATER_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Fuet d'aigua: a lash that does not wound snaps back into a guard.
  recoil_guard: {
    onAttackMiss(ctx) { guardWith(ctx.source, ctx.source, ctx); },
    onAttackHit(ctx) { if ((ctx.damageDealt ?? 0) <= 0) guardWith(ctx.source, ctx.source, ctx); },
    aiWeight() { return 0.3; },
  },

  // 2 · Cop desviat: what the defense held by wounds an enemy the bender
  // chooses (minus armour).
  deflect: {
    onDefend(ctx) {
      const held = -(ctx.margin ?? 0);
      if (held <= 0) return;
      const [t] = ctx.engine.chooseTargets(ctx.source, ctx.action, ctx.engine.enemiesOf(ctx.source), 1);
      if (!t) return;
      const dmg = Math.max(0, held - t.getPassiveArmor());
      ctx.engine.log('defense', `${ctx.source.name} desvia el cop cap a ${t.name}: ${dmg} dany.`, ctx.source.team);
      ctx.engine.applyPvLoss(t, dmg, ctx.source);
    },
    aiWeight() { return 0.4; },
  },

  // 4 · Forma del pop: one defense over every ally at once.
  guard_all: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      for (const ally of ctx.engine.alliesOf(ctx.source, false)) guardWith(ctx.source, ally, ctx);
      ctx.engine.log('defense', `${ctx.source.name} estén vuit braços d'aigua sobre tot el grup.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 0.9 : 0.2; },
  },

  // 5 · Braços d'aigua: strike the enemy or block it, decided when it
  // resolves — block it if it has yet to act this round, strike it if it
  // already has.
  shape_shift: {
    resolveAs(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      const acted = ctx.engine.history.some(ev => ev.round === ctx.engine.round && ev.actor === t);
      return acted ? ActionType.Atac : ActionType.Defensa;
    },
    aiWeight() { return 0.6; },
  },

  // 6 · Gel del mestre: a block whose stopped blow, frozen whole, is thrown
  // at an enemy the bender chooses.
  freeze_and_throw: {
    onDefend(ctx) {
      const total = ctx.attackTotal ?? 0;
      if (total <= 0) return;
      const [t] = ctx.engine.chooseTargets(ctx.source, ctx.action, ctx.engine.enemiesOf(ctx.source), 1);
      if (!t) return;
      ctx.engine.performExtraAttack(ctx.source, t, fixed(total), { label: `${ctx.source.name} llança el cop glaçat` });
    },
    aiWeight() { return 0.6; },
  },

  // 8 · Reixa glaçada: the blocked enemy that attacks the bender this round
  // is frozen to the grate — its next two actions are lost.
  grate: {
    onDefend(ctx) { freeze(ctx); },
    onBlockFail(ctx) { freeze(ctx); },
    aiWeight() { return 0.7; },
  },

  // 9 · Sang sota la lluna: this round, every attack of the chosen enemy goes
  // against someone of its own side, the bender's choice.
  blood_moon: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      const own = ctx.engine.alliesOf(t, false);
      const pool = own.length ? own : [t];
      const [victim] = ctx.engine.chooseTargets(ctx.source, ctx.action, pool, 1);
      t.setStatus('titella-de-sang', 1, 1, { victim, harm: 1 }, TITELLA);
      ctx.engine.log('focus', `${ctx.source.name} mou la sang de ${t.name}: ataca ${victim.name}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 1 ? 1.2 : 0; },
  },

  // 10 · Ira de l'oceà: this round the sea swallows every blow aimed at the
  // bender's side; at round end it breaks on every enemy with its own dice
  // plus all it swallowed.
  // The ocean costs the bender two fatigue levels. Free, it was raised every
  // round: both sides of a mirror cast it turn after turn, nothing landed, and
  // fights ran to ten rounds (water mirror at level 10, 2026-10-06).
  ocean_wrath: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.skip = true; },
    onPlay(ctx) {
      // The ocean rolls ONCE: every blow at the party this round contests it.
      const wall = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'defense') + ctx.source.getSkillLevel(SKILL_ID) + (ctx.action.rollBonus ?? 0);
      ctx.source.setStatus(MAREA_KEY, 0, 1, { dice: ctx.action.dice }, MAREA);
      for (const c of ctx.engine.alliesOf(ctx.source, true)) {
        c.setStatus('engolit-per-l-ocea', wall, 1, undefined, ENGOLIT);
      }
      ctx.engine.log('attack', `${ctx.source.name} alça l'oceà (${wall}): els cops que no el superin s'hi enfonsen.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 1 ? 1.5 : 0; },
  },
};

function freeze(ctx: EffectContext): void {
  const t = ctx.target;
  if (!t || !t.isAlive() || t.hasStatus('preso-de-gel-glacat')) return;
  if (!t.blockers.some(g => g.defender === ctx.source)) return;
  t.skipTurns += 2;
  t.setStatus('preso-de-gel-glacat', 1, 1, { ...HARM });
  ctx.engine.log('defense', `${t.name} queda glaçat a la reixa: perd les seves 2 accions següents.`, ctx.source.team);
}

export const WATERBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: "Mestre de l'aigua", classCss: 'aigua', category: 'player',
  description: "L'aigua no lluita amb la seva força: pren la de l'enemic i l'envia a un altre lloc.",
  iconPath: 'icons/000000/transparent/1x1/sbed/water-drop.svg',
  actions: [
    action({
      id: 'fuet-d-aigua', name: "Fuet d'aigua", skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 3, dice: d(2, 4),
      effects: [{ type: 'recoil_guard' }],
      desc: 'Si no fereix, et defensa la resta del torn.',
      icon: 'lorc/whiplash.svg',
    }),
    action({
      id: 'cop-desviat', name: 'Cop desviat', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 4),
      effects: [{ type: 'deflect' }],
      desc: "Si la defensa aguanta, la diferència fereix l'enemic que triïs.",
      icon: 'lorc/splashy-stream.svg',
    }),
    action({
      id: 'balsam-de-lluna', name: 'Bàlsam de lluna', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, speed: -1, dice: d(2, 6),
      effects: [{ type: 'heal' }],
      desc: 'Cura un aliat.',
      icon: 'lorc/heart-drop.svg',
    }),
    action({
      id: 'forma-del-pop', name: 'Forma del pop', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Defensa, speed: 2, dice: d(2, 6),
      effects: [{ type: 'guard_all' }],
      desc: 'Defensa tots els aliats.',
      icon: 'lorc/octopus.svg',
    }),
    action({
      id: 'bracos-d-aigua', name: "Braços d'aigua", skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, speed: 3, dice: d(2, 6),
      effects: [{ type: 'shape_shift' }],
      desc: "Quan es resol, tria: fereix l'objectiu o el bloqueja.",
      icon: 'lorc/spiral-tentacle.svg',
    }),
    action({
      id: 'gel-del-mestre', name: 'Gel del mestre', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Defensa, speed: 2, dice: d(3, 6),
      effects: [{ type: 'block_only' }, { type: 'freeze_and_throw' }],
      desc: "Bloqueja un enemic. Si aguanta, el tir de l'atacant va contra l'enemic que triïs.",
      icon: 'lorc/frozen-block.svg',
    }),
    action({
      id: 'pluja-de-dagues', name: 'Pluja de dagues', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Atac, speed: 1, dice: d(2, 6), targetCount: 99,
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/heavy-rain.svg',
    }),
    action({
      id: 'preso-de-gel', name: 'Presó de gel', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Defensa, speed: 3, dice: d(3, 6),
      effects: [{ type: 'block_only' }, { type: 'grate' }],
      desc: "Bloqueja un enemic. Si t'ataca aquest torn, perd les seves 2 accions següents.",
      icon: 'delapouite/frozen-body.svg',
    }),
    action({
      id: 'sang-sota-la-lluna', name: 'Sang sota la lluna', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus, speed: 5,
      effects: [{ type: 'blood_moon' }],
      desc: 'Tria un enemic: aquest torn, tots els seus atacs van contra qui triïs del seu bàndol.',
      icon: 'lorc/puppet.svg',
    }),
    action({
      id: 'ira-de-l-ocea', name: "Ira de l'oceà", skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, speed: 6, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: OCEA_FATIGA } }, { type: 'ocean_wrath' }],
      desc: "Puges 2 nivells de fatiga. Aquest torn, cada atac enemic contra el teu bàndol que no superi aquesta tirada no fereix i, al final del torn, fereix el seu atacant. Després, afecta tots els enemics.",
      icon: 'lorc/big-wave.svg',
    }),
  ],
  effects: WATER_EFFECTS,
};
