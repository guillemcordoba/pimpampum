import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num, diceParam, applyMod } from '../effects/helpers.js';

/**
 * Berserk — a D&D-style barbarian whose power is raw, escalating wrath, not technique.
 * Weapon-agnostic like the Mestre d'Armes: attack cards roll their OWN dice plus the
 * wielded weapon's modifier (`weapon_damage`, weapon required), but here the fury is
 * what lands and amplifies it — reckless
 * swings, the rage STATE (+5 dealt / −5 taken), wound-scaling, and a last-stand
 * capstone. Handlers and status behaviours live below, on this SkillDefinition.
 */

// The rage state: a visible marker; the +value attack boost lives on a
// CombatModifier set by enter_rage (roll space, never damage space).
const FURIA_ESTAT: StatusBehavior = {};

// Aguantar el cop: the guard absorbs every blow in full — no contest is rolled.
const AGUANTANT: StatusBehavior = {
  absorbsGuard() { return true; },
};

// Entrar en Fúria: NOTHING can lower the raging holder's PV while it lasts.
const INDESTRUCTIBLE: StatusBehavior = {
  clampPvLoss() { return 0; },
};
const BERSERK_EFFECTS: Record<string, EffectHandler> = {
  // Entrar en Fúria: enter the battle-trance, all in. Entering slams the body
  // to 1 PV; while the rage lasts the holder's attack rolls get +value and
  // NOTHING can lower their PV (INDESTRUCTIBLE).
  enter_rage: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const value = num(ctx.params, 'value', 5);
      const turns = num(ctx.params, 'turns', 3);
      applyMod(ctx.source, 'attack', value, turns, 'Fúria');
      ctx.source.setStatus('furia', value, turns, undefined, FURIA_ESTAT);
      // The all-in: the rage burns the body down to its last breath (a direct
      // set — no hit is recorded, so it interrupts nothing).
      ctx.source.currentPV = 1;
      ctx.source.setStatus('indestructible', 1, turns, undefined, INDESTRUCTIBLE);
      ctx.engine.log('focus', `${ctx.source.name} entra en fúria: 1 PV, intocable ${turns} torns i +${value} a l'atac!`, ctx.source.team);
    },
    // The lower the berserker already is, the less the all-in costs.
    aiWeight(ctx) {
      if (ctx.actor.hasStatus('furia')) return 0;
      return 0.5 + 1.5 * (1 - ctx.actor.currentPV / ctx.actor.maxPV);
    },
  },

  // Rugit de guerra: a terrifying war cry. The roar's own contest, card logic:
  // the berserker rolls the card's dice + their skill LEVEL (a rare level-enters-
  // the-roll exception, printed on the card) against each enemy's resist dice;
  // losers with a still-pending action lose it (engine `cancelPendingAction`,
  // speed-gated — the roar wants high speed).
  fear_roar: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const resist = diceParam(ctx.params, 'resist');
      const bonus = (ctx.action.rollBonus ?? 0) + ctx.source.getRollBonus(ctx.action.skillId)
        + ctx.source.getSkillLevel(ctx.action.skillId);
      for (const t of ctx.engine.enemiesOf(ctx.source)) {
        const roarTotal = Math.max(0, ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'save') + bonus);
        const resistRoll = Math.max(0, ctx.engine.rollDiceFor(t, resist, 'save'));
        // Clutch statuses may adjust either side, seeing both totals.
        const attacker = ctx.engine.adjustContestTotal(ctx.source, roarTotal, resistRoll, 'save');
        const defender = ctx.engine.adjustContestTotal(t, resistRoll, attacker, 'save');
        const ok = attacker > defender;
        ctx.engine.log('focus', `🎲 Rugit de guerra contra ${t.name}: ${attacker} vs ${defender} → ${ok ? 'aterrit' : 'resisteix'}.`, ctx.source.team);
        if (!ok) continue;
        const cancelled = ctx.engine.cancelPendingAction(t);
        ctx.engine.log('focus', cancelled
          ? `${t.name} queda paralitzat per la por i perd l'acció.`
          : `${t.name} ja havia actuat: el rugit no hi arriba a temps.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length >= 1 ? 1.5 : 0; },
  },

  // Aguantar el cop: he raises no real guard ({D} 0). The `aguantant` status
  // (guardAbsorb) passes every blow through in full; on each penetrating hit he
  // converts the damage taken into a permanent +{A} (rest-of-combat, stacking).
  rage_from_pain: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      ctx.source.setStatus('aguantant', 1, 1, undefined, AGUANTANT);
    },
    onBlockFail(ctx) {
      const dmg = ctx.damageDealt ?? 0;
      if (dmg <= 0) return;
      applyMod(ctx.source, 'attack', dmg, 'restOfCombat', ctx.action.name);
      ctx.engine.log('defense', `${ctx.source.name} canalitza el dolor: +${dmg} {A} la resta del combat.`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

};

export const BERSERK: SkillDefinition = {
  id: 'berserk', displayName: 'Berserk', classCss: 'barbar', category: 'player',
  description: "Bàrbar de fúria desfermada: la ràbia és el que colpeja i devasta; l'arma que empunyes la potencia. Tot atac, autodestructiu.",
  iconPath: ICON_PREFIX + 'delapouite/barbarian.svg',
  actions: [
    action({
      id: 'embat-sagnant', name: 'Embat sagnant', skillId: 'berserk',
      unlock: 1, type: ActionType.Atac, speed: 0, dice: d(1, 4),
      effects: [{ type: 'weapon_damage' }, { type: 'frenzy', params: { per: 1, amount: 1 } }],
      desc: '{A}+1 per cada PV perdut.',
      icon: 'skoll/blood.svg',
    }),
    action({
      id: 'aguantar-el-cop', name: 'Aguantar el cop', skillId: 'berserk',
      unlock: 2, type: ActionType.Defensa, speed: 2,
      effects: [{ type: 'rage_from_pain' }],
      desc: 'Reps tot el dany i guanyes +{A} permanent igual al dany rebut.',
      icon: 'lorc/muscle-up.svg',
    }),
    action({
      id: 'atac-temerari', name: 'Atac temerari', skillId: 'berserk',
      unlock: 3, type: ActionType.Atac, speed: 1, dice: d(1, 10),
      effects: [{ type: 'weapon_damage' }, { type: 'reckless', params: { attack: 0, defense: 5, thisTurn: false } }],
      desc: 'El torn següent, {D}−5.',
      icon: 'lorc/axe-swing.svg',
    }),
    action({
      id: 'entrar-en-furia', name: 'Entrar en Fúria', skillId: 'berserk',
      unlock: 4, type: ActionType.Focus, speed: 2, fatigueCost: 3,
      effects: [{ type: 'enter_rage', params: { value: 5, turns: 3 } }],
      desc: 'Baixes a 1 PV. Durant 3 torns res et pot fer baixar PV, {A}+5 als teus atacs.',
      icon: 'delapouite/enrage.svg',
    }),
    action({
      id: 'rugit-de-guerra', name: 'Rugit de guerra', skillId: 'berserk',
      unlock: 5, type: ActionType.Focus, speed: 2, dice: d(1, 20),
      effects: [{ type: 'fear_roar', params: { resist: d(1, 20) } }],
      desc: "Tira 1d20 + nivell de Berserk contra 1d20 de cada enemic; qui perdi i encara no hagi actuat perd l'acció.",
      icon: 'lorc/screaming.svg',
    }),
  ],
  effects: BERSERK_EFFECTS,
};

export const BERSERK_SKILLS: SkillDefinition[] = [BERSERK];
