import { ActionType, Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num, diceParam, applyMod } from '../effects/helpers.js';

/**
 * Ombres — the shadow-master: melts people into darkness and fuses enemy
 * shadows to his own, Kagemane-style. Two cards: total concealment (engine
 * `untargetable` seam — hidden characters vanish from enemiesOf, so enemy
 * targeting, AoE sweeps, AI sight and extra attacks all pass over them) and
 * a channelled bind where binder and victim freeze together, the victim
 * saving out with an escalating contested roll at round end (this card's own
 * contest — dice and escalation are its custom logic).
 */

// Fos en l'ombra: unreachable by enemies while it lasts; attacking bursts out
// of the dark (reveal + one-time bonus on that turn's attack).
const FOS: StatusBehavior = {
  untargetable() { return true; },
  onAttackAction(ctx) {
    const bonus = num(ctx.entry.data ?? {}, 'bonus', 2);
    ctx.holder.clearStatus(ctx.key);
    applyMod(ctx.holder, 'attack', bonus, 'thisTurn', "Atac des de l'ombra");
    ctx.engine.log('info', `${ctx.holder.name} sorgeix de l'ombra per atacar (+${bonus}).`, ctx.holder.team);
  },
};

// Lligat: the victim's side of the fused shadows. Each round end, an escape
// contest (the bind card's dice on both sides, +3 cumulative per held turn
// for the victim); while the bind holds, both victim AND binder skip the next
// round. Death on either side releases. TODO(balance): escalation step.
const LLIGAT: StatusBehavior = {
  onRoundEnd(ctx) {
    const data = ctx.entry.data ?? {};
    const binder = data.binder as Character;
    const release = () => {
      ctx.holder.clearStatus(ctx.key);
      binder.clearStatus('lligant-ombra');
    };
    if (!binder.isAlive() || !ctx.holder.isAlive()) { release(); return; }
    if (data.armedRound === ctx.engine.round) {
      // The round the bind landed: no escape roll yet, both freeze next round.
      ctx.holder.skipTurns = Math.max(ctx.holder.skipTurns, 1);
      binder.skipTurns = Math.max(binder.skipTurns, 1);
      return;
    }
    const attempts = (num(data, 'attempts', 0) + 1);
    data.attempts = attempts;
    const bonus = 3 * attempts;
    const escapeDice = data.escapeDice as DiceRoll | undefined;
    const holdDice = data.holdDice as DiceRoll | undefined;
    let escape = ctx.engine.rollDiceFor(ctx.holder, escapeDice, 'save') + bonus;
    const hold = ctx.engine.rollDiceFor(binder, holdDice, 'save') + binder.getRollBonus('ombres');
    ctx.engine.log('focus', `🎲 ${ctx.holder.name} lluita contra el lligam: ${escape} (amb +${bonus}) vs ${hold}.`, ctx.holder.team);
    escape = ctx.engine.adjustContestTotal(ctx.holder, escape, hold, 'save');
    if (escape > hold) {
      ctx.engine.log('focus', `${ctx.holder.name} s'allibera del lligam d'ombres!`, ctx.holder.team);
      release();
      return;
    }
    ctx.engine.log('focus', `El lligam aguanta: cap dels dos no podrà actuar.`, binder.team);
    ctx.holder.skipTurns = Math.max(ctx.holder.skipTurns, 1);
    binder.skipTurns = Math.max(binder.skipTurns, 1);
  },
};

const OMBRES_EFFECTS: Record<string, EffectHandler> = {
  // Desaparèixer en l'ombra: hide self or an ally until end of next round.
  shadow_melt: {
    getTargetRequirement() { return 'ally'; },
    onResolve(ctx) {
      const target = ctx.targets[0] ?? ctx.source;
      if (!target.isAlive()) return;
      target.setStatus('fos-en-ombra', 1, 2, { bonus: num(ctx.params, 'bonus', 4) }, FOS);
      ctx.engine.log('focus', `${target.name} es fon dins l'ombra: res enemic no el pot tocar.`, target.team);
    },
    aiWeight(ctx) {
      // Denial doesn't advance the win condition: hide the wounded, otherwise
      // mostly do something else (overplaying this stalls fights into draws).
      const pool = [ctx.actor, ...ctx.allies].filter(c => !c.hasStatus('fos-en-ombra'));
      if (pool.length === 0) return -10;
      return pool.some(c => c.currentPV < c.maxPV * 0.5) ? 1.2 : -2;
    },
  },

  // Lligam d'ombres: contested catch (this card's own dice on both sides);
  // on success both stand frozen, the LLIGAT behaviour above runs the
  // escalating escape contests.
  shadow_bind: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const resist = diceParam(ctx.params, 'resist');
      const atkRaw = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, 'save')
        + (ctx.action.rollBonus ?? 0) + ctx.source.getRollBonus(ctx.action.skillId);
      const defRaw = ctx.engine.rollDiceFor(target, resist, 'save');
      ctx.engine.log('focus', `🎲 Lligam d'ombres contra ${target.name}: ${atkRaw} vs ${defRaw}.`, ctx.source.team);
      const atk = ctx.engine.adjustContestTotal(ctx.source, atkRaw, defRaw, 'save');
      const def = ctx.engine.adjustContestTotal(target, defRaw, atk, 'save');
      if (atk <= def) {
        ctx.engine.log('focus', `${target.name} aparta la seva ombra a temps.`, target.team);
        return;
      }
      target.setStatus('lligat-ombra', 1, -1, {
        binder: ctx.source, attempts: 0, armedRound: ctx.engine.round,
        escapeDice: diceParam(ctx.params, 'escape') ?? resist, holdDice: ctx.action.dice,
      }, LLIGAT);
      ctx.source.setStatus('lligant-ombra', 1, -1);
      ctx.engine.log('focus', `Les ombres de ${ctx.source.name} i ${target.name} es fusionen: cap dels dos no pot moure's!`, ctx.source.team);
    },
    aiWeight(ctx) {
      // Binding freezes the binder too — only worth it with allies free to
      // punish the statue, and never worth chaining back-to-back.
      if (ctx.actor.hasStatus('lligant-ombra')) return -10;
      return ctx.enemies.length > 1 && ctx.allies.length > 0 ? 1.1 : -2;
    },
  },
};

export const OMBRES: SkillDefinition = {
  id: 'ombres', displayName: 'Ombres', classCss: 'ombres', category: 'player',
  description: "Mestre de les ombres: s'hi fon, hi amaga aliats i lliga l'ombra dels enemics a la seva.",
  iconPath: ICON_PREFIX + 'lorc/two-shadows.svg',
  actions: [
    action({
      id: 'desapareixer-en-lombra', name: "Desaparèixer en l'ombra", skillId: 'ombres',
      unlock: 1, type: ActionType.Focus, speed: 3,
      effects: [{ type: 'shadow_melt', params: { bonus: 2 } }],
      desc: "Tria un aliat: desapareix dins l'ombra fins al final del torn següent i res enemic no el pot tocar. Atacar el revela; el primer atac des de l'ombra té {A}+2.",
      icon: 'lorc/hidden.svg',
    }),
    action({
      id: 'lligam-dombres', name: "Lligam d'ombres", skillId: 'ombres',
      unlock: 2, type: ActionType.Focus, speed: 1, fatigueCost: 2, dice: d(2, 6),
      effects: [{ type: 'shadow_bind', params: { resist: d(2, 6) } }],
      desc: "Tira 2d6 contra 2d6 d'un enemic. Si guanyes, ni tu ni ell no podeu actuar. Al final de cada torn es repeteix la tirada, i ell hi suma +3 per cada torn retingut: si et supera, queda lliure.",
      icon: 'lorc/shadow-grasp.svg',
    }),
  ],
  effects: OMBRES_EFFECTS,
};

export const OMBRES_SKILLS: SkillDefinition[] = [OMBRES];
