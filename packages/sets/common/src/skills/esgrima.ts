import { ActionType, Character, EffectContext, EffectHandler, StatusBehavior, random } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { diceParam, num, wieldedWeaponBonus } from '../effects/helpers.js';

/**
 * ESGRIMA — the duel: read the rival, provoke them, answer them. The attacks
 * roll their own dice (the technique) plus the wielded weapon (the generic
 * `weapon_damage`, which also makes them need one). Three threads rise with
 * the level: the READ (a feint at a raised guard, 1; the camaleon guard that
 * changes its card after the reveal, 3; the weak spot, 8), the PROVOCATION (a
 * slap that draws every blow, 4; the hedge of steel that parries with its own
 * cut, 7) and the ANSWER (the riposte, 2; the scorpion's sting, 5; the dead
 * arm, 6) — and two finishers paid in fatigue (the ghost thrust, 9; cut after
 * cut, 10).
 *
 * Concepts by the `card-taste` agent, approved by the user; the numbers are
 * this file's.
 */

/**
 * The bonus a blow OUTSIDE the card's own attack roll carries (a riposte, a
 * follow-up cut): the wielded weapon, and the level in the card's skill —
 * every roll is the card's dice plus the level (rules.md), and only the
 * card's own attack gets the level from the engine.
 */
function bladeBonus(c: Character, skillId: string): number {
  return (wieldedWeaponBonus(c) ?? 0) + c.getSkillLevel(skillId);
}

/** A status set in round R that acts only from round R+1 on. */
function fromRound(data: Record<string, unknown> | undefined): number {
  const r = data?.['fromRound'];
  return typeof r === 'number' ? r : 0;
}

// --- 3 · Guàrdia camaleó -----------------------------------------------------

/** Post-reveal card swaps, unlimited for the rest of the combat (the engine's
 *  flowSwap checks/spends; spending is a no-op here). */
const FLUX: StatusBehavior = {
  cardSwapCharges() { return 1; },
  spendCardSwapCharge() {},
  /** A held swap is the right card instead of the wrong one, once. Small and
   *  flat: it is real, and it is not worth a body. */
  positionValue() { return 0.15; },
};

// --- 4 · Bufetada insolent ---------------------------------------------------

/** Provoked: next round the holder's attacks can only aim at whoever slapped
 *  it (while that one stands). */
const PROVOCAT: StatusBehavior = {
  attackTargetsOnly(ctx) {
    const by = ctx.entry.data?.['by'];
    if (!(by instanceof Character) || !by.isAlive() || ctx.engine.round < fromRound(ctx.entry.data)) return;
    return [by];
  },
  positionValue() { return -0.05; },
};

// --- 5 · Bloqueig d'escorpí --------------------------------------------------

/** Stung: next round the first attack of the fencer who held it cannot be
 *  defended. Spent on that blow. */
const ESCORPI: StatusBehavior = {
  opensGuardTo(ctx, attacker) {
    if (attacker !== ctx.entry.data?.['by'] || ctx.engine.round < fromRound(ctx.entry.data)) return false;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('attack', `La picada de l'escorpí: ${ctx.holder.name} no es pot defensar de ${attacker.name}.`, attacker.team);
    return true;
  },
  /** Its whole payoff lands NEXT round, after the one-round search has scored
   *  the board, while Retruc's riposte lands in it — so the price is the only
   *  way the search sees it. A quarter of a body: at a tenth the AI almost
   *  never played it where it was the best card, and at half it played it
   *  where it was not and the kit won less (NEXT-STEPS §44). Worth nothing
   *  once the fencer who would strike is down. */
  positionValue(ref) {
    const by = ref.entry.data?.['by'];
    return by instanceof Character && by.isAlive() ? -0.25 : 0;
  },
};

// --- 6 · Braç mort -----------------------------------------------------------

/** A dead arm: the holder cannot play Atacs next round. (The desperation
 *  fallback stays — the engine never locks it.) */
const BRAC_MORT: StatusBehavior = {
  blocksActionType(_ref, type) { return type === ActionType.Atac; },
  /** A lost attacking turn, priced like the sting above and for the same
   *  reason: it bites only next round (NEXT-STEPS §44). */
  positionValue() { return -0.25; },
};

// --- 7 · Bardissa d'acer -----------------------------------------------------

/** The hedge's roll, made at the reveal and spent by its own attack. */
const HEDGE_KEY = 'bardissa-tirada';

// --- 8 · Punt feble ----------------------------------------------------------

/** A weak spot found: every defense against the finding side's attacks on the
 *  holder counts `value` less, for the rest of the combat. */
const PUNT_FEBLE: StatusBehavior = {
  defensePenaltyAgainst(ref, attacker) {
    return attacker.team === ref.entry.data?.['team'] ? ref.entry.value : 0;
  },
  positionValue(ref) { return -0.02 * ref.entry.value; },
};

// --- 9 · Estocada fantasma ---------------------------------------------------

/** Has seen the ghost thrust once this combat: the next one can be defended
 *  and its armour counts. Keyed by the CARD (any fencer's thrust), not by the
 *  fencer: a body that has read the trick reads it from anyone. */
const VISTA: StatusBehavior = {
  positionValue() { return 0.03; },
};
const seenKey = (ctx: EffectContext) => `${ctx.action.id}-rebuda`;

const ESGRIMA_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Finta traïdora: against a target whose revealed card is a Defensa,
  // the defense against this attack has −`amount`. The penalty comes off the
  // contested defense total only while the target's OWN defense is part of it
  // (it has resolved: its self-guard is up) — a raised guard is what the
  // feint exploits, so an ally's guard alone is not deceived. In a wall it
  // comes off the wall's sum once, like every defense penalty.
  treacherous_feint: {
    modifyAttack(ctx) {
      const t = ctx.target;
      if (!t || !ctx.attackMods) return;
      const revealedDefense = ctx.engine.plannedThisRound()
        .some(p => p.actor === t && !p.cancelled && p.action.actionType === ActionType.Defensa);
      if (revealedDefense && t.guards.some(g => g.defender === t)) {
        ctx.attackMods.defensePenalty += num(ctx.params, 'amount', 4);
      }
    },
    aiWeight() { return 0.3; },
  },

  // 2 · Retruc d'acer: when it holds, an answer of `dice` + the weapon at the
  // attacker that nobody can defend — plus the level only with `withLevel`:
  // no opposing roll means no opposing level to cancel it, so the whole level
  // lands as raw damage.
  steel_riposte: {
    onDefend(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || !ctx.source.isAlive()) return;
      const skillId = ctx.action.skillId;
      const rollBonus = ctx.params['withLevel'] === false
        ? wieldedWeaponBonus(ctx.source) ?? 0
        : bladeBonus(ctx.source, skillId);
      ctx.engine.performExtraAttack(ctx.source, t, diceParam(ctx.params, 'dice') ?? d(1, 6), {
        skillId, rollBonus,
        ignoreDefense: true, label: `${ctx.source.name} retruca`,
      });
    },
    aiWeight() { return 0.5; },
  },

  // 3 · Guàrdia camaleó: the card swap after the reveal, for the rest of the
  // combat (FLUX above). The AI commits blind and never swaps, so it is
  // declared AI-blind in each set's calibration (`aiBlindCards`).
  flow_state: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('flux'); },
    onResolve(ctx) {
      ctx.source.setStatus('flux', 1, -1, undefined, FLUX);
      ctx.engine.log('focus', `${ctx.source.name} adopta la guàrdia camaleó.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.hasStatus('flux') ? 0 : 0.2; },
  },

  // 4 · Bufetada insolent: a wound provokes the target — next round it can
  // only attack the fencer.
  insolent_slap: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      t.setStatus('provocat', 1, 2, { by: ctx.source, fromRound: ctx.engine.round + 1, harm: 1 }, PROVOCAT);
      ctx.engine.log('attack', `${t.name}, provocat, el torn següent només pot atacar ${ctx.source.name}.`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // 5 · Bloqueig d'escorpí: when it holds, the fencer's first attack on that
  // attacker next round cannot be defended.
  scorpion_block: {
    onDefend(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive()) return;
      t.setStatus('picada-d-escorpi', 1, 2, { by: ctx.source, fromRound: ctx.engine.round + 1, harm: 1 }, ESCORPI);
      ctx.engine.log('defense', `${ctx.source.name} queda a l'aguait: el torn següent el seu primer atac contra ${t.name} no es podrà defensar.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // 6 · Braç mort: when it holds, the attacker cannot play Atacs next round.
  dead_arm: {
    onDefend(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive()) return;
      t.setStatus('brac-mort', 1, 2, { harm: 1 }, BRAC_MORT);
      ctx.engine.log('defense', `${t.name} es queda amb el braç mort: el torn següent no pot atacar.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // 7 · Bardissa d'acer: the cut is rolled when the cards are revealed, and
  // that same total also defends the fencer against every attack of the
  // target on them this round — the ones resolving before the card too. It
  // is a guard like any other, so allies guarding the fencer sum with it.
  steel_hedge: {
    aimsAtReveal() { return true; },
    onAimed(ctx) {
      const t = ctx.targets[0];
      if (!t || !ctx.action.dice) return;
      const skillId = ctx.action.skillId;
      const roll = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'attack');
      const total = Math.max(0, roll + (ctx.action.rollBonus ?? 0) + bladeBonus(ctx.source, skillId)
        + ctx.source.getRollBonus(skillId, 'attack'));
      ctx.source.setStatus(HEDGE_KEY, roll, 1, { round: ctx.engine.round });
      ctx.source.guards.push({ defender: ctx.source, action: ctx.action, fixedTotal: total, onlyAgainst: t });
      ctx.engine.log('defense', `${ctx.source.name} alça una bardissa d'acer contra ${t.name} (${total}).`, ctx.source.team);
    },
    presetAttackRoll(ctx) {
      const e = ctx.source.getStatus(HEDGE_KEY);
      if (!e || e.data?.['round'] !== ctx.engine.round) return;
      ctx.source.clearStatus(HEDGE_KEY);
      return e.value;
    },
    aiWeight() { return 0.6; },
  },

  // 8 · Punt feble: the chosen enemy's weak spot — every defense against the
  // fencer's side's attacks on it has −`amount` for the rest of the combat.
  weak_spot: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      const amount = num(ctx.params, 'amount', 3);
      t.setStatus('punt-feble', amount, -1, { team: ctx.source.team, harm: 1 }, PUNT_FEBLE);
      ctx.engine.log('focus', `${ctx.source.name} troba el punt feble de ${t.name}: les seves defenses, −${amount}.`, ctx.source.team);
    },
    aiWeight(ctx) {
      if (!ctx.enemies.length) return 0;
      return ctx.allies.length ? 1 : 0.6;
    },
  },

  // 9 · Estocada fantasma: cannot be defended and ignores armour — unless the
  // target has already received it this combat.
  ghost_thrust: {
    modifyAttack(ctx) {
      const t = ctx.target;
      if (!t || !ctx.attackMods || t.hasStatus(seenKey(ctx))) return;
      ctx.attackMods.ignoreDefense = true;
      ctx.attackMods.ignoreArmor = true;
    },
    onAttackHit(ctx) { seen(ctx); },
    onAttackMiss(ctx) { seen(ctx); },
    aiWeight() { return 0.6; },
  },

  // 10 · Tall rere tall: while the blow wounds, strike another random enemy
  // that has not received it yet, with a fresh roll of the card's dice + the
  // weapon. Stops at the first blow that does not wound, or when no fresh
  // enemy is left.
  cut_after_cut: {
    onAttackHit(ctx) {
      if ((ctx.damageDealt ?? 0) <= 0 || !ctx.action.dice) return;
      const struck = new Set<Character>(ctx.targets);
      const skillId = ctx.action.skillId;
      for (;;) {
        if (!ctx.source.isAlive()) return;
        const fresh = ctx.engine.enemiesOf(ctx.source).filter(e => !struck.has(e));
        if (!fresh.length) return;
        const next = fresh[Math.floor(random() * fresh.length)];
        struck.add(next);
        const blow = ctx.engine.performExtraAttack(ctx.source, next, ctx.action.dice, {
          skillId, rollBonus: (ctx.action.rollBonus ?? 0) + bladeBonus(ctx.source, skillId),
          label: `${ctx.source.name} «${ctx.action.name}»`,
        });
        if (blow.damage <= 0) return;
      }
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.9 : 0.2; },
  },
};

function seen(ctx: EffectContext): void {
  const t = ctx.targets[0];
  if (t) t.setStatus(seenKey(ctx), 1, -1, undefined, VISTA);
}

export const MESTRE_ARMES: SkillDefinition = {
  id: 'mestre-armes', displayName: 'Esgrima', classCss: 'mestre-armes', category: 'player',
  description: "L'art del duel: llegeix el rival, provoca'l i respon-li.",
  iconPath: ICON_PREFIX + 'delapouite/fencer.svg',
  actions: [
    action({
      id: 'finta-traidora', name: 'Finta traïdora', skillId: 'mestre-armes',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(1, 6),
      effects: [{ type: 'weapon_damage' }, { type: 'treacherous_feint', params: { amount: 4 } }],
      desc: "Si l'objectiu ha revelat una Defensa, la seva defensa contra aquest atac té −4.",
      icon: 'lorc/backstab.svg',
    }),
    action({
      id: 'retruc-d-acer', name: "Retruc d'acer", skillId: 'mestre-armes',
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 4),
      effects: [{ type: 'steel_riposte', params: { dice: d(1, 6), withLevel: false } }],
      desc: "Si aguanta, contraataques l'atacant amb 1d6 + arma; no es pot defensar.",
      icon: 'lorc/sword-clash.svg',
    }),
    action({
      id: 'guardia-camaleo', name: 'Guàrdia camaleó', skillId: 'mestre-armes',
      unlock: 3, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'flow_state' }],
      desc: 'Durant la resta del combat, després de revelar les cartes, pots canviar la teva carta per una altra.',
      icon: 'darkzaitzev/chameleon-glyph.svg',
    }),
    action({
      id: 'bufetada-insolent', name: 'Bufetada insolent', skillId: 'mestre-armes',
      unlock: 4, type: ActionType.Atac, speed: 2, dice: d(2, 6),
      effects: [{ type: 'weapon_damage' }, { type: 'insolent_slap' }],
      desc: "Si fereix, el torn següent l'objectiu només pot atacar-te a tu.",
      icon: 'lorc/slap.svg',
    }),
    action({
      id: 'bloqueig-d-escorpi', name: "Bloqueig d'escorpí", skillId: 'mestre-armes',
      unlock: 5, type: ActionType.Defensa, speed: 3, dice: d(2, 8),
      effects: [{ type: 'scorpion_block' }],
      desc: "Si aguanta, el torn següent el teu primer atac contra l'atacant no es pot defensar.",
      icon: 'lorc/scorpion-tail.svg',
    }),
    action({
      id: 'brac-mort', name: 'Braç mort', skillId: 'mestre-armes',
      unlock: 6, type: ActionType.Defensa, speed: 2, dice: d(4, 4),
      effects: [{ type: 'dead_arm' }],
      desc: "Si aguanta, l'atacant no pot jugar Atacs el torn següent.",
      icon: 'lorc/broken-bone.svg',
    }),
    action({
      id: 'bardissa-d-acer', name: "Bardissa d'acer", skillId: 'mestre-armes',
      unlock: 7, type: ActionType.Atac, speed: 1, dice: d(3, 6),
      effects: [{ type: 'weapon_damage' }, { type: 'steel_hedge' }],
      desc: "Aquest torn, aquesta tirada també et defensa de tots els atacs de l'objectiu contra tu, encara que arribin abans.",
      icon: 'lorc/spiked-fence.svg',
    }),
    action({
      id: 'punt-feble', name: 'Punt feble', skillId: 'mestre-armes',
      unlock: 8, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'weak_spot', params: { amount: 3 } }],
      desc: 'Tria un enemic: la resta del combat, les defenses contra els atacs del teu bàndol a aquest enemic tenen −3.',
      icon: 'delapouite/achilles-heel.svg',
    }),
    action({
      id: 'estocada-fantasma', name: 'Estocada fantasma', skillId: 'mestre-armes',
      unlock: 9, type: ActionType.Atac, speed: 2, dice: d(3, 8),
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'weapon_damage' }, { type: 'ghost_thrust' }],
      desc: "Puges 1 nivell de fatiga. No es pot defensar i ignora l'armadura, tret que l'objectiu ja l'hagi rebut aquest combat.",
      icon: 'lorc/piercing-sword.svg',
    }),
    action({
      id: 'tall-rere-tall', name: 'Tall rere tall', skillId: 'mestre-armes',
      unlock: 10, type: ActionType.Atac, speed: 1, dice: d(3, 6),
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'weapon_damage' }, { type: 'cut_after_cut' }],
      desc: 'Puges 2 nivells de fatiga. Mentre fereixi, ataca un altre enemic a l\'atzar que encara no hagi rebut aquest atac.',
      icon: 'lorc/dervish-swords.svg',
    }),
  ],
  effects: ESGRIMA_EFFECTS,
};
