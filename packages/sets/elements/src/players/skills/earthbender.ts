import { ActionType, Character, DiceRoll, EffectContext, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { applyMod, HARM } from '../effects/helpers.js';

/**
 * MESTRE DE LA TERRA — hung gar: stand, take the blow, answer it with your own
 * weight at the same attacker (water sends the force elsewhere). Four threads
 * rise with the level: stone on the body (1, 4, 7), the answer (2, 9), the
 * ground that holds the enemy (5, 8, 10), and listening (3).
 *
 * Concepts by the `card-taste` agent, picked by the user (DESIGN.md); the
 * numbers are this file's.
 */

const SKILL_ID = 'earthbender';

/** Armour Armadura de roca can stack up to. */
const ARMOUR_CAP = 3;

// --- 3 · Sentit sísmic ------------------------------------------------------

/** Next round the holder's side chooses after the enemies reveal theirs. */
const SENTIT: StatusBehavior = {
  choosesAfterReveal(ref) { return ref.entry.remaining <= 1; },
  positionValue() { return 0.05; },
};

// --- 7 · Cúpula de pedra ----------------------------------------------------

/** The dome stands over each of the party until an attack gets through it:
 *  it contests every blow aimed at a holder nobody is actively guarding. */
const CUPULA: StatusBehavior = {
  standingGuard(ctx) {
    const caster = ctx.entry.data?.['caster'];
    const dice = ctx.entry.data?.['dice'];
    if (!(caster instanceof Character) || !caster.isAlive() || !(dice instanceof DiceRoll)) return;
    return Math.max(0, ctx.engine.rollDiceFor(caster, dice, 'defense')
      + caster.getRollBonus(SKILL_ID, 'defense') + caster.getSkillLevel(SKILL_ID) + ((ctx.entry.data?.['bonus'] as number) ?? 0));
  },
  onStandingGuardBroken(ctx) {
    const caster = ctx.entry.data?.['caster'];
    for (const c of caster instanceof Character ? ctx.engine.rosterOf(caster) : [ctx.holder]) c.clearStatus(CUPULA_KEY);
    ctx.engine.log('defense', `La cúpula de pedra s'esquerda i cau.`, ctx.holder.team);
  },
  positionValue() { return 0.15; },
};
const CUPULA_KEY = 'cupula-de-pedra';

// --- 10 · Partir la terra ---------------------------------------------------

const ESQUERDA_KEY = 'esquerda';

/**
 * In the crack (value = the wound it took). As the round it fell in ends, the
 * holder chooses for the next one: climb out (lose its action) or stay and
 * take the same wound again as the earth closes. Climbing is the choice when
 * the second wound would leave it under 40% (or kill it).
 */
const ESQUERDA: StatusBehavior = {
  onRoundEnd(ctx) {
    const data = ctx.entry.data ?? {};
    if (data['decided']) return;
    data['decided'] = true;
    ctx.entry.data = data;
    const h = ctx.holder;
    if (!h.isAlive()) return;
    if (h.currentPV - ctx.entry.value < h.maxPV * 0.4) {
      if (h.skipTurns === 0) h.skipTurns = 1;
      h.clearStatus(ctx.key);
      ctx.engine.log('info', `${h.name} gasta el torn sortint de l'esquerda.`, h.team);
    } else {
      data['take'] = true;
    }
  },
  onRoundStart(ctx) {
    if (!ctx.entry.data?.['take']) return;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('attack', `La terra es tanca sobre ${ctx.holder.name}: ${ctx.entry.value} dany.`, ctx.holder.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.entry.value, undefined);
  },
  positionValue(ref) { return -0.02 * ref.entry.value; },
};

const EARTH_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Guant de pedra: after the punch the rock stays on the fist — it
  // defends the bender for the rest of the round with the card's dice.
  stone_glove: {
    onAttackHit(ctx) { gloveUp(ctx); },
    onAttackMiss(ctx) { gloveUp(ctx); },
    aiWeight() { return 0.3; },
  },

  // 2 · Mur ariet: a block that, when it holds, rams the attacker once with
  // the card's own dice.
  ram: {
    onDefend(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || !ctx.action.dice) return;
      ctx.engine.performExtraAttack(ctx.source, t, ctx.action.dice, { skillId: SKILL_ID, label: `${ctx.source.name} envesteix amb el mur` });
    },
    aiWeight() { return 0.5; },
  },

  // 3 · Sentit sísmic: next round the bender's whole side chooses after the
  // enemies have revealed their cards.
  seismic_sense: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      for (const c of ctx.engine.alliesOf(ctx.source, true)) c.setStatus('sentit-sismic', 1, 2, undefined, SENTIT);
      ctx.engine.log('focus', `${ctx.source.name} escolta la terra: el torn següent el seu bàndol tria després de veure les cartes enemigues.`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

  // 4 · Armadura de roca: the stone stays — +1 armour for the rest of the
  // fight, up to +3.
  stone_skin: {
    onResolve(ctx) {
      const have = ctx.source.getStatusValue('armadura-de-roca', 0);
      if (have >= ARMOUR_CAP) return;
      applyMod(ctx.source, 'armor', 1, 'restOfCombat', ctx.action.name);
      ctx.source.setStatus('armadura-de-roca', have + 1, -1);
      ctx.engine.log('defense', `La pedra es queda damunt de ${ctx.source.name}: armadura +${have + 1}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.getStatusValue('armadura-de-roca', 0) < ARMOUR_CAP ? 0.6 : -0.5; },
  },

  // 6 · Doblegar el metall: a wound strips all the target's armour for the
  // rest of the fight.
  strip_armor: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || (ctx.damageDealt ?? 0) <= 0) return;
      const armour = t.getPassiveArmor();
      if (armour <= 0) return;
      applyMod(t, 'armor', -armour, 'restOfCombat', ctx.action.name, undefined, HARM);
      ctx.engine.log('attack', `${ctx.source.name} doblega el metall de ${t.name}: perd ${armour} d'armadura.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.some(e => e.getPassiveArmor() > 0) ? 0.8 : 0; },
  },

  // 7 · Cúpula de pedra: a dome over the whole party that holds, round after
  // round, until an attack gets past it.
  stone_dome: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      for (const c of ctx.engine.alliesOf(ctx.source, true)) {
        c.setStatus(CUPULA_KEY, 1, -1, { caster: ctx.source, dice: ctx.action.dice, bonus: ctx.action.rollBonus ?? 0 }, CUPULA);
      }
      ctx.engine.log('defense', `${ctx.source.name} alça una cúpula de pedra sobre el grup.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.hasStatus(CUPULA_KEY) ? -1 : 0.9; },
  },

  // 10 · Partir la terra: every enemy it wounds falls into the crack, and next
  // round each chooses — climb out (its action) or stay and take the same
  // wound again when the earth closes. (Taking every wounded enemy's next
  // two actions locked the whole side out; the fight was decided in round 1,
  // 2026-10-07.)
  crack_or_climb: {
    onAttackHit(ctx) {
      const t = ctx.target;
      const wound = ctx.damageDealt ?? 0;
      if (!t || !t.isAlive() || wound <= 0) return;
      t.setStatus(ESQUERDA_KEY, wound, 2, { harm: 1, decided: false, take: false }, ESQUERDA);
      ctx.engine.log('attack', `${t.name} cau a l'esquerda.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.9 : 0.4; },
  },

  // 9 · Puny de la muntanya: +1 for every attack aimed at the bender this fight.
  mountain_fist: {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      const aimed = ctx.engine.history.filter(ev =>
        ev.actor.team !== ctx.source.team && ev.action.actionType === ActionType.Atac && ev.targets.includes(ctx.source)).length;
      ctx.attackMods.rollBonus += aimed;
    },
    aiWeight() { return 0.6; },
  },
};

function gloveUp(ctx: EffectContext): void {
  if (!ctx.source.isAlive()) return;
  ctx.source.guards.push({ defender: ctx.source, action: ctx.action });
}

export const EARTHBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: 'Mestre de la terra', classCss: 'terra', category: 'player',
  description: "La terra aguanta el cop i respon amb el seu propi pes.",
  iconPath: 'icons/000000/transparent/1x1/lorc/stone-block.svg',
  actions: [
    action({
      id: 'guant-de-pedra', name: 'Guant de pedra', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, fast: true, dice: d(2, 4),
      effects: [{ type: 'stone_glove' }],
      desc: "Després de l'atac, et defensa la resta del torn.",
      icon: 'lorc/fist.svg',
    }),
    action({
      id: 'mur-ariet', name: 'Mur ariet', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'block_only' }, { type: 'ram' }],
      desc: "Bloqueja un enemic. Si aguanta, l'ataques un cop amb els daus d'aquesta carta.",
      icon: 'delapouite/stone-wall.svg',
    }),
    action({
      id: 'sentit-sismic', name: 'Sentit sísmic', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'seismic_sense' }],
      desc: 'El torn següent, els enemics revelen les seves cartes abans que el teu bàndol triï les seves.',
      icon: 'lorc/footprint.svg',
    }),
    action({
      id: 'armadura-de-roca', name: 'Armadura de roca', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'stone_skin' }],
      desc: "Després de defensar, guanyes +1 d'armadura la resta del combat (fins a +3).",
      icon: 'delapouite/rock-golem.svg',
    }),
    action({
      id: 'sorra-movedissa', name: 'Sorra movedissa', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Atac, dice: d(2, 6),
      effects: [{ type: 'lock_on_hit', params: { types: [ActionType.Defensa], turns: 1 } }],
      desc: "Si fereix, l'objectiu no pot jugar Defenses el torn següent.",
      icon: 'lorc/sands-of-time.svg',
    }),
    action({
      id: 'doblegar-el-metall', name: 'Doblegar el metall', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Atac, dice: d(2, 6),
      effects: [{ type: 'piercing' }, { type: 'strip_armor' }],
      desc: "Ignora l'armadura. Si fereix, l'objectiu perd tota l'armadura la resta del combat.",
      icon: 'lorc/anvil-impact.svg',
    }),
    action({
      id: 'cupula-de-pedra', name: 'Cúpula de pedra', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Defensa, dice: d(2, 6),
      effects: [{ type: 'stone_dome' }],
      desc: 'Defensa tots els aliats aquest torn i els següents, fins que un atac la superi.',
      icon: 'delapouite/habitat-dome.svg',
    }),
    action({
      id: 'ma-de-la-terra', name: 'Mà de la terra', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Atac, dice: d(3, 6),
      effects: [{ type: 'hurl_into_another', params: { pick: 'choose' } }],
      desc: "Si fereix, el llances contra l'enemic que triïs, que rep el mateix dany.",
      icon: 'lorc/grab.svg',
    }),
    action({
      id: 'puny-de-la-muntanya', name: 'Puny de la muntanya', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Atac, dice: d(3, 6),
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'mountain_fist' }],
      desc: 'Puges 1 nivell de fatiga. +1 per cada atac dirigit contra tu aquest combat.',
      icon: 'lorc/mountains.svg',
    }),
    action({
      id: 'partir-la-terra', name: 'Partir la terra', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'crack_or_climb' }],
      desc: "Puges 2 nivells de fatiga. Afecta tots els enemics. El torn següent, cadascun dels que fereix o perd la seva acció o torna a rebre el mateix dany.",
      icon: 'lorc/earth-crack.svg',
    }),
  ],
  effects: EARTH_EFFECTS,
};
