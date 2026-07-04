import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { num, applyMod, bestSaveBonus } from '../effects/helpers.js';

/**
 * Fúria — a D&D-style barbarian whose power is raw, escalating wrath, not technique.
 * Weapon-agnostic like the Mestre d'Armes: every attack deals the WIELDED weapon's
 * dice (`weapon_damage`), but here the fury is what lands and amplifies it — reckless
 * swings, the rage STATE (+5 dealt / −5 taken), wound-scaling, and a last-stand
 * capstone. The fury-specific handlers live below, on this SkillDefinition, and
 * work through generic status data:
 *   - `furia`          — outgoingDamage +value / incomingDamage −value while raging.
 *   - `aguantant`      — guardAbsorb: the defender takes the full blow, no contest.
 *   - `indestructible` — pvFloor 1: PV cannot drop below 1.
 */
const FURIA_EFFECTS: Record<string, EffectHandler> = {
  // Entrar en Fúria: enter the battle-trance. While the `furia` status is up,
  // every blow you land deals +value and every hit you take deals −value. The
  // cost is the heavy fatigue of the card itself (no separate crash).
  enter_rage: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const value = num(ctx.params, 'value', 5);
      const turns = num(ctx.params, 'turns', 3);
      ctx.source.setStatus('furia', value, turns, { outgoingDamage: value, incomingDamage: -value });
      ctx.engine.log('focus', `${ctx.source.name} entra en fúria! (+${value} dany, −${value} dany rebut)`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.hasStatus('furia') ? 0 : 1.4; },
  },

  // Rugit de guerra: a terrifying war cry. Contested save vs each enemy; those who
  // fail lose their still-pending action THIS round (engine `cancelPendingAction`,
  // speed-gated — only slower actions can be eaten, so the roar wants high speed).
  fear_roar: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const atkSkill = ctx.source.getRollSkill(ctx.action.skillId, 'attack') + (ctx.action.rollBonus ?? 0);
      for (const t of ctx.engine.enemiesOf(ctx.source)) {
        const atkRoll = ctx.engine.rollD20();
        const defRoll = ctx.engine.rollD20For(t);
        const defBonus = bestSaveBonus(t);
        const ok = atkRoll + atkSkill > defRoll + defBonus;
        ctx.engine.log('focus', `🎲 Rugit de guerra contra ${t.name}: ${atkRoll}+${atkSkill} vs ${defRoll}+${defBonus} → ${ok ? 'aterrit' : 'resisteix'}.`, ctx.source.team);
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
      ctx.source.setStatus('aguantant', 1, 1, { guardAbsorb: true });
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
        ctx.source.setStatus('indestructible', 1, turns, { pvFloor: 1 });
        ctx.engine.log('attack', `${ctx.source.name} ho aposta tot: 1 PV i indestructible ${turns} torns!`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.actor.currentPV <= ctx.actor.maxPV * 0.4 ? 1.6 : 0.3; },
  },
};

export const FURIA: SkillDefinition = {
  id: 'furia', displayName: 'Fúria', classCss: 'barbar', category: 'player',
  description: "Bàrbar de fúria desfermada: el dany surt de l'arma que empunyes, però la ràbia és el que colpeja i devasta. Tot atac, autodestructiu.",
  iconPath: ICON_PREFIX + 'delapouite/barbarian.svg',
  actions: [
    action({
      id: 'atac-temerari', name: 'Atac temerari', skillId: 'furia',
      unlock: 1, type: ActionType.Atac, speed: 2,
      effects: [{ type: 'weapon_damage' }, { type: 'reckless', params: { attack: 10, defense: 20, thisTurn: false } }],
      desc: '{A}+10. El torn següent, {D}−20.',
      icon: 'lorc/axe-swing.svg',
    }),
    action({
      id: 'entrar-en-furia', name: 'Entrar en Fúria', skillId: 'furia',
      unlock: 12, type: ActionType.Focus, speed: 2, fatigueCost: 3,
      effects: [{ type: 'enter_rage', params: { value: 5, turns: 3 } }],
      desc: '+5 de dany i −5 de dany rebut durant 3 torns.',
      icon: 'delapouite/enrage.svg',
    }),
    action({
      id: 'embat-sagnant', name: 'Embat sagnant', skillId: 'furia',
      unlock: 28, type: ActionType.Atac, speed: 1,
      effects: [{ type: 'weapon_damage' }, { type: 'frenzy', params: { per: 1, amount: 1 } }],
      desc: '{A}+1 per cada PV perdut.',
      icon: 'skoll/blood.svg',
    }),
    action({
      id: 'rugit-de-guerra', name: 'Rugit de guerra', skillId: 'furia',
      unlock: 42, type: ActionType.Focus, speed: 4,
      effects: [{ type: 'fear_roar' }],
      desc: "Cada enemic fa un salvament; qui falla perd l'acció d'aquest torn.",
      icon: 'lorc/screaming.svg',
    }),
    action({
      id: 'aguantar-el-cop', name: 'Aguantar el cop', skillId: 'furia',
      unlock: 58, type: ActionType.Defensa, speed: 2,
      effects: [{ type: 'rage_from_pain' }],
      desc: '{D} 0: reps tot el dany i guanyes +{A} permanent igual al dany rebut.',
      icon: 'lorc/muscle-up.svg',
    }),
    action({
      id: 'furia-implacable', name: 'Fúria implacable', skillId: 'furia',
      unlock: 75, type: ActionType.Atac, speed: 1, fatigueCost: 2,
      effects: [
        { type: 'weapon_damage', params: { times: 2 } },
        { type: 'precision', params: { levelMultiplier: 2 } },
        { type: 'last_stand', params: { turns: 3 } },
      ],
      desc: 'Baixes a 1 PV i et tornes indestructible (mínim 1 PV) durant 3 torns.',
      icon: 'delapouite/mighty-force.svg',
    }),
  ],
  effects: FURIA_EFFECTS,
};

export const FURIA_SKILLS: SkillDefinition[] = [FURIA];
