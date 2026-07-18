import { EffectHandler, Character, StatusBehavior } from '@pimpampum/engine';
import { num, str, diceParam, durParam, tspec, resolveTargets, targetReq, applyMod, ModKind } from './helpers.js';
import { DOT, REGEN } from './status-behaviors.js';

// Attack rolls against the marked holder get +value (mark_target).
const MARCA_OBJECTIU: StatusBehavior = {
  attackRollAgainstHolder(ref) { return ref.entry.value; },
};

// Marker status for weapon_buff — the mechanical +value lives on an 'attack'
// CombatModifier (roll space, never damage space); the status is the visible
// chip that names the buff.
const ARMA_ENVERINADA: StatusBehavior = {};

/** Focus effects: resolved in speed order via onResolve. */
export const FOCUS_EFFECTS: Record<string, EffectHandler> = {
  /**
   * Restore PV to the chosen / implied targets.
   *  - `mode: 'flat'` (default): heals a fixed `amount`. Used for side-effect heals.
   *  - `mode: 'roll'`: rolls the action's own dice (+ the healer's roll bonuses,
   *    which include the fatigue penalty) and heals the total. Capped at the
   *    target's missing PV naturally (engine.heal already clamps to maxPV).
   */
  heal: {
    onResolve(ctx) {
      const mode = str(ctx.params, 'mode', 'flat');
      const targets = resolveTargets(ctx, tspec(ctx.params, 'ally'));
      if (mode === 'roll') {
        const roll = ctx.engine.rollDiceFor(ctx.source, ctx.action.dice, undefined);
        const amt = Math.max(0, roll + ctx.source.getRollBonus(ctx.action.skillId));
        ctx.engine.log('focus', `🎲 ${ctx.source.name} «${ctx.action.name}»: ${amt} PV.`, ctx.source.team);
        for (const t of targets) ctx.engine.heal(t, amt);
      } else {
        const amt = num(ctx.params, 'amount', 2);
        for (const t of targets) ctx.engine.heal(t, amt);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'ally')); },
    aiWeight(ctx) {
      const pool = [ctx.actor, ...ctx.allies];
      return pool.filter(a => a.currentPV < a.maxPV).length * 1.5;
    },
  },

  // Buff (positive amount) or debuff (negative) a skill on the targets.
  // If a `dice` param is supplied, it is rolled once at apply and added to `amount`.
  skill_mod: {
    onResolve(ctx) {
      let amt = num(ctx.params, 'amount', 3); // TODO(balance)
      const dice = diceParam(ctx.params, 'dice');
      if (dice) amt += dice.roll();
      const kind = str(ctx.params, 'kind', 'skill') as ModKind;
      const dur = durParam(ctx.params, 'duration', 'nextTurn');
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'self'))) applyMod(t, kind, amt, dur, ctx.action.name);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'self')); },
    aiWeight(ctx) { return num(ctx.params, 'amount', 0) >= 0 ? 1.3 : 1.0; },
  },

  // Make the target(s) skip turns.
  stun: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) t.skipTurns += num(ctx.params, 'turns', 1);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Set up a self-guard with the action's defensive bonus (dodge / evasion).
  evasion: {
    onResolve(ctx) { ctx.source.guards.push({ defender: ctx.source, action: ctx.action }); },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.4 ? 2 : 0.6; },
  },

  // Goblin "Amagar-se": dodge this turn + next turn, gain +1 attack per ally hiding.
  // Each goblin sets the 'amagant-se' status on itself in onResolve; postRound
  // counts allies with that status (incl. self) and applies a next-turn attack buff.
  nimble_escape: {
    onResolve(ctx) {
      ctx.source.guards.push({ defender: ctx.source, action: ctx.action });
      ctx.source.setStatus('amagant-se', 1, 1);
    },
    postRound(ctx) {
      if (!ctx.source.hasStatus('amagant-se')) return;
      const hiding = ctx.engine.alliesOf(ctx.source, true).filter(a => a.hasStatus('amagant-se')).length;
      if (hiding > 0) applyMod(ctx.source, 'attack', hiding * num(ctx.params, 'amount', 1), 'nextTurn', ctx.action.name);
    },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.5 ? 1.6 : 0.7; },
  },

  // Mark an enemy: attack rolls against them get +amount.
  mark_target: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 2); // TODO(balance)
      const turns = num(ctx.params, 'turns', 1);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        t.setStatus('marca-objectiu', amt, turns, undefined, MARCA_OBJECTIU);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Grant a lasting "+`amount` damage dealt" status. Default: up to `count`
  // allies (poisoned weapons); pass `target` (e.g. 'self') for other shapes,
  // and `name` to label the status (possession, blessing…).
  weapon_buff: {
    onResolve(ctx) {
      const amount = num(ctx.params, 'amount', 1);
      const count = num(ctx.params, 'count', 3);
      const turns = num(ctx.params, 'turns', -1);
      const name = str(ctx.params, 'name', 'arma-enverinada');
      const targets = ctx.params.target !== undefined
        ? resolveTargets(ctx, tspec(ctx.params, 'allies'))
        : ctx.engine.alliesOf(ctx.source, true).slice(0, count);
      for (const a of targets) {
        applyMod(a, 'attack', amount, turns === -1 ? 'restOfCombat' : turns, name);
        a.setStatus(name, amount, turns, undefined, ARMA_ENVERINADA);
      }
    },
    aiWeight() { return 0.9; },
  },


  // Every enemy that has lost PV this combat loses an extra `damage` PV (Rèquiem / Set de sang).
  wound_wounded: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 1);
      for (const e of ctx.engine.enemiesOf(ctx.source)) {
        if (e.hitThisCombat) {
          ctx.engine.log('focus', `${e.name} pateix una ferida addicional.`, e.team);
          ctx.engine.applyPvLoss(e, dmg, ctx.source);
        }
      }
    },
    aiWeight(ctx) {
      const wounded = ctx.enemies.filter(e => e.hitThisCombat).length;
      return wounded * 0.5;
    },
  },

  // Regeneration: heal a fixed amount at the end of each round for `turns`.
  regen: {
    onResolve(ctx) {
      const amt = num(ctx.params, 'amount', 1);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'self'))) t.setStatus('regeneració', amt, num(ctx.params, 'turns', 3), { regen: amt }, REGEN);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'self')); },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV ? 1.2 : 0.4; },
  },

  // Inflict damage-over-time on the chosen enemy / enemies.
  dot: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 2);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) t.setStatus(str(ctx.params, 'name', 'crema'), dmg, num(ctx.params, 'turns', 3), { dot: dmg }, DOT);
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1; },
  },

  // Beast form: extra PV plus per-kind bonuses for the rest of combat.
  wild_shape: {
    onResolve(ctx) {
      const pv = num(ctx.params, 'pv', 0);
      if (pv) {
        ctx.source.maxPV += pv;
        ctx.source.currentPV += pv;
      }
      const attack = num(ctx.params, 'attack', 0);
      const defense = num(ctx.params, 'defense', 0);
      const skill = num(ctx.params, 'skill', 0);
      if (attack) applyMod(ctx.source, 'attack', attack, 'restOfCombat', 'Forma salvatge');
      if (defense) applyMod(ctx.source, 'defense', defense, 'restOfCombat', 'Forma salvatge');
      if (skill) applyMod(ctx.source, 'skill', skill, 'restOfCombat', 'Forma salvatge');
    },
    aiWeight(ctx) { return ctx.round <= 2 ? 1.8 : 0.6; },
  },

  // Summon a combatant from a factory carried in params. The aiWeight strongly
  // dampens itself once the team is large (the focus base weight is ~2-4, so we
  // need to negate that to actually stop the AI from picking it). This avoids
  // exponential population blow-ups in fatigued late-round play.
  summon: {
    onResolve(ctx) {
      // `maxTeam` hard-caps how many combatants the summoner's side may EVER
      // field (dead included): at the cap the call fizzles.
      const cap = num(ctx.params, 'maxTeam', Infinity);
      if (ctx.engine.rosterOf(ctx.source).length >= cap) {
        ctx.engine.log('focus', `La crida de ${ctx.source.name} es perd: la manada ja ha respost sencera.`, ctx.source.team);
        return;
      }
      const f = ctx.params['factory'] as (() => Character) | undefined;
      if (f) ctx.engine.addCombatant(ctx.source.team, f());
    },
    aiWeight(ctx) {
      const n = ctx.allies.length + 1;
      if (n >= num(ctx.params, 'maxTeam', 6)) return -10;
      if (n >= 3) return -1.5;
      return 1.5;
    },
  },

  // Sacrifice PV for a rest-of-combat skill buff.
  sacrifice: {
    onResolve(ctx) {
      ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'cost', 3), ctx.source);
      const amt = num(ctx.params, 'amount', 0);
      if (amt) {
        const kind = str(ctx.params, 'kind', 'skill') as ModKind;
        applyMod(ctx.source, kind, amt, 'restOfCombat', ctx.action.name);
      }
    },
    aiWeight(ctx) { return ctx.actor.currentPV > ctx.actor.maxPV * 0.6 ? 1.2 : 0.1; },
  },

  // Consume all arcane marks on enemies for burst damage.
  detonate: {
    onResolve(ctx) {
      const per = num(ctx.params, 'perMark', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemies'))) {
        const marks = t.getStatusValue('marca', 0);
        if (marks > 0) {
          t.clearStatus('marca');
          ctx.engine.log('focus', `Detonació arcana: ${t.name} rep ${marks * per} de dany.`, t.team);
          ctx.engine.applyPvLoss(t, marks * per, ctx.source);
        }
      }
    },
    aiWeight() { return 1; },
  },

  // Recover fatigue (stamina potions): subtracts `amount` from the drinker's
  // daily fatigue counter, floored at 0.
  fatigue_relief: {
    onResolve(ctx) {
      const amount = num(ctx.params, 'amount', 5);
      const before = ctx.source.fatigue;
      ctx.source.fatigue = Math.max(0, ctx.source.fatigue - amount);
      ctx.engine.log('focus', `${ctx.source.name} recupera l'alè (${before - ctx.source.fatigue} punts de fatiga).`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.fatigue >= 6 ? 1.2 : 0.05; },
  },

  // Remove negative modifiers and damage-over-time statuses from the target(s).
  cleanse: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'ally'))) {
        t.modifiers = t.modifiers.filter(m => m.getValue() >= 0);
        for (const [key, entry] of t.statuses) {
          if (typeof entry.data?.dot === 'number') t.statuses.delete(key);
        }
        t.clearStatus('silenced');
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'ally')); },
    aiWeight() { return 0.5; },
  },
};
