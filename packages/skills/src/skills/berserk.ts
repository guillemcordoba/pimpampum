import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num, diceParam, applyMod } from '../effects/helpers.js';

/**
 * Berserk — a D&D-style barbarian whose power is raw, escalating wrath, not technique.
 * Weapon-agnostic like the Mestre d'Armes: every attack deals the WIELDED weapon's
 * dice (`weapon_damage`), but here the fury is what lands and amplifies it — reckless
 * swings, the rage STATE (+5 dealt / −5 taken), wound-scaling, and a last-stand
 * capstone. Handlers and status behaviours live below, on this SkillDefinition.
 */

// The rage state, in ROLL space (modifiers live on the attack, never on the
// damage): the holder's own attack rolls get +value via a CombatModifier set
// by enter_rage; enemy attack rolls AGAINST the holder get −value here.
const FURIA_ESTAT: StatusBehavior = {
  attackRollAgainstHolder(ref) { return -ref.entry.value; },
};

// Aguantar el cop: the guard absorbs every blow in full — no contest is rolled.
const AGUANTANT: StatusBehavior = {
  absorbsGuard() { return true; },
};

// Fúria implacable: no blow can drop the holder below 1 PV.
const INDESTRUCTIBLE: StatusBehavior = {
  clampPvLoss(ref, amount) { return Math.min(amount, Math.max(0, ref.holder.currentPV - 1)); },
};
const BERSERK_EFFECTS: Record<string, EffectHandler> = {
  // Entrar en Fúria: enter the battle-trance. While the `furia` status is up,
  // the berserker's attack rolls get +value and enemy attack rolls against
  // them get −value. The cost is the heavy fatigue of the card itself.
  enter_rage: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const value = num(ctx.params, 'value', 3);
      const turns = num(ctx.params, 'turns', 3);
      // The blood price: rage borrows power from the body itself.
      const pvCost = num(ctx.params, 'pvCost', 0);
      if (pvCost > 0) ctx.engine.applyPvLoss(ctx.source, pvCost, ctx.source);
      if (!ctx.source.isAlive()) return;
      applyMod(ctx.source, 'attack', value, turns, 'Fúria');
      ctx.source.setStatus('furia', value, turns, undefined, FURIA_ESTAT);
      ctx.engine.log('focus', `${ctx.source.name} entra en fúria! (+${value} a l'atac, −${value} als atacs que rep)`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.hasStatus('furia') ? 0 : 1.4; },
  },

  // Rugit de guerra: a terrifying war cry. The roar's own contest, card logic:
  // the berserker rolls the card's dice against each enemy's resist dice (both
  // printed on/for this card); losers with a still-pending action lose it
  // (engine `cancelPendingAction`, speed-gated — the roar wants high speed).
  fear_roar: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const resist = diceParam(ctx.params, 'resist');
      const bonus = (ctx.action.rollBonus ?? 0) + ctx.source.getRollBonus(ctx.action.skillId);
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

  // Fúria implacable (capstone): slam your own life to 1 PV and become
  // indestructible (pvFloor 1) for `turns`, then strike. Pure last stand — does
  // not enter Fúria; pair it with Entrar en Fúria yourself.
  last_stand: {
    modifyAttack(ctx) {
      const turns = num(ctx.params, 'turns', 3);
      if (!ctx.source.hasStatus('indestructible')) {
        ctx.source.currentPV = 1;
        ctx.source.setStatus('indestructible', 1, turns, undefined, INDESTRUCTIBLE);
        ctx.engine.log('attack', `${ctx.source.name} ho aposta tot: 1 PV i indestructible ${turns} torns!`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.actor.currentPV <= ctx.actor.maxPV * 0.4 ? 1.6 : 0.3; },
  },
};

export const BERSERK: SkillDefinition = {
  id: 'berserk', displayName: 'Berserk', classCss: 'barbar', category: 'player',
  description: "Bàrbar de fúria desfermada: el dany surt de l'arma que empunyes, però la ràbia és el que colpeja i devasta. Tot atac, autodestructiu.",
  iconPath: ICON_PREFIX + 'delapouite/barbarian.svg',
  actions: [
    action({
      id: 'embat-sagnant', name: 'Embat sagnant', skillId: 'berserk',
      unlock: 1, type: ActionType.Atac, speed: 1,
      effects: [{ type: 'weapon_damage' }, { type: 'frenzy', params: { per: 4, amount: 1 } }],
      desc: '{A}+1 per cada 4 PV perduts.',
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
      unlock: 3, type: ActionType.Atac, speed: 2,
      effects: [{ type: 'weapon_damage' }, { type: 'reckless', params: { attack: 2, defense: 5, thisTurn: false } }],
      desc: '{A}+2. El torn següent, {D}−5.',
      icon: 'lorc/axe-swing.svg',
    }),
    action({
      id: 'entrar-en-furia', name: 'Entrar en Fúria', skillId: 'berserk',
      unlock: 4, type: ActionType.Focus, speed: 2, fatigueCost: 3,
      effects: [{ type: 'enter_rage', params: { value: 3, turns: 3 } }],
      desc: 'Durant 3 torns: {A}+3 als teus atacs i {A}−3 als atacs que reps.',
      icon: 'delapouite/enrage.svg',
    }),
    action({
      id: 'rugit-de-guerra', name: 'Rugit de guerra', skillId: 'berserk',
      unlock: 5, type: ActionType.Focus, speed: 2, dice: d(2, 6),
      effects: [{ type: 'fear_roar', params: { resist: d(2, 6) } }],
      desc: "Tira 2d6 contra 2d6 de cada enemic; qui perdi i encara no hagi actuat perd l'acció.",
      icon: 'lorc/screaming.svg',
    }),
    action({
      id: 'furia-implacable', name: 'Fúria implacable', skillId: 'berserk',
      unlock: 6, type: ActionType.Atac, speed: 1, fatigueCost: 4,
      effects: [
        { type: 'weapon_damage', params: { times: 2 } },
        { type: 'last_stand', params: { turns: 3 } },
      ],
      desc: 'Baixes a 1 PV i et tornes indestructible durant 3 torns.',
      icon: 'delapouite/mighty-force.svg',
    }),
  ],
  effects: BERSERK_EFFECTS,
};

export const BERSERK_SKILLS: SkillDefinition[] = [BERSERK];
