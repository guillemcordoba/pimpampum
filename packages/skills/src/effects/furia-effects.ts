import { EffectHandler } from '@pimpampum/engine';
import { num, applyMod, bestSaveBonus } from './helpers.js';

/**
 * Fúria (Rage / barbarian) effect handlers. The skill is weapon-agnostic (attacks
 * use the generic `weapon_damage`); these handlers cover its fury-specific mechanics.
 * Three engine statuses are read inline by the combat engine (like condemnat/encegat):
 *   - `furia`        — +value damage dealt and −value damage taken while raging.
 *   - `aguantant`    — the guard's defender always takes the full blow (no contest).
 *   - `indestructible` — PV cannot drop below 1.
 */
export const FURIA_EFFECTS: Record<string, EffectHandler> = {
  // Entrar en Fúria: enter the battle-trance. While the `furia` status is up, the
  // engine adds `value` to every blow you land and subtracts it from every hit you
  // take. The cost is the heavy fatigue of the card itself (no separate crash).
  enter_rage: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const value = num(ctx.params, 'value', 5);
      const turns = num(ctx.params, 'turns', 3);
      ctx.source.setStatus('furia', value, turns);
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

  // Aguantar el cop: he raises no real guard ({D} 0). The `aguantant` status makes
  // the engine pass every blow through in full; on each penetrating hit he converts
  // the damage taken into a permanent +{A} (rest-of-combat, stacking).
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
  // indestructible (engine floors PV at 1) for `turns`, then strike. Pure last
  // stand — does not enter Fúria; pair it with Entrar en Fúria yourself.
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
