import { ActionType, Character, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { num, applyMod, bestSaveBonus } from '../effects/helpers.js';

/**
 * Ombres — the shadow-master: melts people into darkness and fuses enemy
 * shadows to his own, Kagemane-style. Two cards: total concealment (engine
 * `untargetable` seam — hidden characters vanish from enemiesOf, so enemy
 * targeting, AoE sweeps, AI sight and extra attacks all pass over them) and
 * a channelled bind where binder and victim freeze together, the victim
 * saving out with a +10-per-turn escalating contested roll at round end.
 */

// Fos en l'ombra: unreachable by enemies while it lasts; attacking bursts out
// of the dark (reveal + one-time +4 on that turn's attack).
const FOS: StatusBehavior = {
  untargetable() { return true; },
  onAttackAction(ctx) {
    const bonus = num(ctx.entry.data ?? {}, 'bonus', 4);
    ctx.holder.clearStatus(ctx.key);
    applyMod(ctx.holder, 'attack', bonus, 'thisTurn', "Atac des de l'ombra");
    ctx.engine.log('info', `${ctx.holder.name} sorgeix de l'ombra per atacar (+${bonus}).`, ctx.holder.team);
  },
};

// Lligat: the victim's side of the fused shadows. Each round end, an escape
// save (contested, +10 cumulative per held turn); while the bind holds, both
// victim AND binder skip the next round. Death on either side releases.
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
    const bonus = 10 * attempts;
    const escapeRoll = ctx.engine.rollD20For(ctx.holder);
    const holdRoll = ctx.engine.rollD20For(binder);
    let escape = escapeRoll + bestSaveBonus(ctx.holder) + bonus;
    const hold = holdRoll + binder.getRollSkill('ombres', 'attack');
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

  // Lligam d'ombres: contested catch; on success both stand frozen, the
  // LLIGAT behaviour above runs the escalating escape saves.
  shadow_bind: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const atkRoll = ctx.engine.rollD20For(ctx.source);
      const atk = atkRoll + ctx.source.getRollSkill(ctx.action.skillId, 'attack') + (ctx.action.rollBonus ?? 0);
      const defRoll = ctx.engine.rollD20For(target);
      let def = defRoll + bestSaveBonus(target);
      ctx.engine.log('focus', `🎲 Lligam d'ombres contra ${target.name}: ${atk} vs ${def}.`, ctx.source.team);
      def = ctx.engine.adjustContestTotal(target, def, atk, 'save');
      if (atk <= def) {
        ctx.engine.log('focus', `${target.name} aparta la seva ombra a temps.`, target.team);
        return;
      }
      target.setStatus('lligat-ombra', 1, -1, { binder: ctx.source, attempts: 0, armedRound: ctx.engine.round }, LLIGAT);
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
      effects: [{ type: 'shadow_melt', params: { bonus: 4 } }],
      desc: "Tria un aliat: desapareix dins l'ombra fins al final del torn següent i res enemic no el pot tocar. Atacar el revela; el primer atac des de l'ombra té {A}+4.",
      icon: 'lorc/hidden.svg',
    }),
    action({
      id: 'lligam-dombres', name: "Lligam d'ombres", skillId: 'ombres',
      unlock: 20, type: ActionType.Focus, speed: 1, fatigueCost: 2,
      effects: [{ type: 'shadow_bind' }],
      desc: "Tira d20 + nivell contra el d20 + la millor habilitat d'un enemic. Si guanyes, ni tu ni ell no podeu actuar. Al final de cada torn es repeteix la tirada, i ell hi suma +10 per cada torn retingut: si et supera, queda lliure.",
      icon: 'lorc/shadow-grasp.svg',
    }),
  ],
  effects: OMBRES_EFFECTS,
};

export const OMBRES_SKILLS: SkillDefinition[] = [OMBRES];
