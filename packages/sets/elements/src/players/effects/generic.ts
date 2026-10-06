import { ActionType, Character, DiceRoll, EffectContext, EffectHandler, StatusBehavior, random } from '@pimpampum/engine';
import { applyMod, diceParam, durParam, ModKind, num, str } from './helpers.js';
import { DOT } from './status-behaviors.js';

/**
 * THE ELEMENTS SET'S SHARED MECHANICS — the handlers several kits reach for.
 *
 * The world's non-benders fight by SHUTTING THINGS DOWN (a pinned archer's
 * target, a chi-blocked bender, a hero in the grip of fear), so three effects
 * recur across players and creatures alike: a card type locked out of a hand,
 * a hero nobody can protect, and a hero whose blows land on their own friends.
 * Every one of them is short (it ends with the next round) and every status
 * it sets carries `harm`, which is what Obrir el chakra de la terra strips.
 */

/** "Next turn": the rest of this round plus the next one — a status counts
 *  down at the end of the round it was set in. */
const NEXT_TURN = 2;

/** The card types a lock forbids, read from the card's params. */
function lockedTypes(p: Record<string, unknown>): ActionType[] {
  const v = p['types'];
  return Array.isArray(v) ? v.filter((t): t is ActionType => Object.values(ActionType).includes(t as ActionType)) : [];
}

/**
 * A hand with some card types locked out of it.
 *
 * Priced for the evaluator, or the search could never see why locking a hero
 * is worth a card: about a tenth of a body per type per round still to serve.
 * Conservative on purpose (a status that over-values itself is played to the
 * exclusion of everything else).
 */
const LOCKED: StatusBehavior = {
  blocksActionType(ref, type) {
    const types = ref.entry.data?.['types'];
    return Array.isArray(types) && types.includes(type);
  },
  positionValue(ref) {
    const types = ref.entry.data?.['types'];
    const n = Array.isArray(types) ? types.length : 0;
    return -0.08 * n * Math.max(1, Math.min(2, ref.entry.remaining - 1));
  },
};

/** Nobody can protect the holder. */
const ISOLATED: StatusBehavior = {
  preventsGuard() { return true; },
  positionValue() { return -0.06; },
};

/**
 * The holder's attacks land on their own side: each intended target is swapped
 * for one of the holder's living allies (never the holder). Alone, the holder
 * strikes as intended — there is nobody to turn on.
 */
const TURNED: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    const friends = ctx.engine.alliesOf(ctx.holder, false);
    if (!friends.length || intended.team === ctx.holder.team) return intended;
    return friends[Math.floor(random() * friends.length)];
  },
  positionValue(ref) { return ref.entry.remaining > 0 ? -0.15 : 0; },
};

/** Hunted: every blow aimed at the holder lands `value` easier. */
const MARKED: StatusBehavior = {
  attackRollAgainstHolder(ref) { return ref.entry.value; },
  positionValue(ref) { return -0.04 * ref.entry.value; },
};

/** Out of reach this round. */
const VANISHED: StatusBehavior = {
  untargetable() { return true; },
};

/** The status Obrir el chakra de la terra leaves: no new harm takes hold. */
export const WARD_KEY = 'chakra-obert';

/** Whether harm can take hold of `c` — the open earth chakra turns it away. */
export function warded(c: Character): boolean {
  return c.hasStatus(WARD_KEY);
}

/** Lock `types` for the target: `turns` 1 means the next turn. */
export function lock(target: Character, types: ActionType[], turns: number, label: string): void {
  if (!types.length || warded(target)) return;
  const prev = target.getStatus('bloquejat');
  const prevTypes = (prev?.data?.['types'] as ActionType[] | undefined) ?? [];
  const merged = [...new Set([...prevTypes, ...types])];
  target.setStatus('bloquejat', 1, Math.max(prev?.remaining ?? 0, turns + 1), { types: merged, harm: 1, label }, LOCKED);
}

export function isolate(target: Character): void {
  if (warded(target)) return;
  target.setStatus('aillat', 1, NEXT_TURN, { harm: 1 }, ISOLATED);
}

export function turnOnAllies(target: Character, turns = 1): void {
  if (warded(target)) return;
  target.setStatus('girat', 1, turns + 1, { harm: 1 }, TURNED);
}

const TYPE_NAME: Record<string, string> = { Atac: 'Atacs', Defensa: 'Defenses', Focus: 'Focus' };
const typesText = (types: ActionType[]) => types.map(t => TYPE_NAME[t] ?? t).join(' ni ');

/** The single target of a Focus card that chose one, or nothing. */
function chosen(ctx: EffectContext): Character | undefined {
  const t = ctx.targets[0];
  return t && t.isAlive() ? t : undefined;
}

function enemyTargets(ctx: EffectContext): Character[] {
  return str(ctx.params, 'target', 'enemy') === 'enemies'
    ? ctx.engine.enemiesOf(ctx.source)
    : [chosen(ctx)].filter((c): c is Character => !!c);
}

export const GENERIC_EFFECTS: Record<string, EffectHandler> = {
  // Cop desesperat's price: 1 PV after the swing, hit or miss.
  self_damage: {
    onAttackHit(ctx) { ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'amount', 1), ctx.source); },
    onAttackMiss(ctx) { ctx.engine.applyPvLoss(ctx.source, num(ctx.params, 'amount', 1), ctx.source); },
  },

  // Restore `dice` (or flat `amount`) PV to the chosen ally — a fallen one too
  // (rules.md: a heal may revive).
  heal: {
    getTargetRequirement(p) { return p['target'] === 'self' ? 'none' : 'ally'; },
    onResolve(ctx) {
      const dice = diceParam(ctx.params, 'dice') ?? ctx.action.dice;
      const amount = dice ? ctx.engine.rollDiceFor(ctx.source, dice) : num(ctx.params, 'amount', 4);
      const t = ctx.params['target'] === 'self' ? ctx.source : ctx.targets[0];
      if (!t) return;
      const wasDown = !t.isAlive();
      ctx.engine.heal(t, amount);
      ctx.engine.log('focus', `${ctx.source.name} ${wasDown ? 'torna' : 'cura'} ${t.name}: +${amount} PV.`, ctx.source.team);
    },
    // A slow heal has to be cast before the wound is critical, so the search
    // must consider it once anyone is scratched: gated at 60% it was the right
    // play in 22% of its decisions and played on 4% (2026-10-06).
    aiWeight(ctx) {
      const pvs = [ctx.actor, ...ctx.allies].map(a => a.currentPV / a.maxPV);
      if (pvs.some(p => p < 0.6)) return 1.4;
      return pvs.some(p => p < 0.9) ? 0.6 : -1;
    },
  },

  // On a hit, the target loses `types` for `turns` (default: the next turn).
  lock_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target || !ctx.target.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      const types = lockedTypes(ctx.params);
      lock(ctx.target, types, num(ctx.params, 'turns', 1), ctx.action.name);
      ctx.engine.log('attack', `${ctx.target.name} no pot jugar ${typesText(types)} (${ctx.action.name}).`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

  // On a block, the attacker loses `types` for `turns`.
  lock_on_block: {
    onDefend(ctx) {
      if (!ctx.target || !ctx.target.isAlive()) return;
      const types = lockedTypes(ctx.params);
      lock(ctx.target, types, num(ctx.params, 'turns', 1), ctx.action.name);
      ctx.engine.log('defense', `${ctx.target.name} no pot jugar ${typesText(types)} (${ctx.action.name}).`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // Focus: the chosen enemy (or every enemy, target 'enemies') loses `types`.
  // `only` inverts it: they may play ONLY those types.
  lock: {
    getTargetRequirement(p) { return p['target'] === 'enemies' ? 'none' : 'enemy'; },
    onResolve(ctx) {
      const all = Object.values(ActionType) as ActionType[];
      const named = lockedTypes(ctx.params);
      const types = ctx.params['only'] ? all.filter(t => !named.includes(t)) : named;
      for (const t of enemyTargets(ctx)) {
        lock(t, types, num(ctx.params, 'turns', 1), ctx.action.name);
        ctx.engine.log('focus', `${t.name} no pot jugar ${typesText(types)} (${ctx.action.name}).`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length ? 1.2 : 0; },
  },

  // Focus: nobody can protect the chosen enemy (or every enemy) next turn.
  isolate: {
    getTargetRequirement(p) { return p['target'] === 'enemies' ? 'none' : 'enemy'; },
    onResolve(ctx) {
      for (const t of enemyTargets(ctx)) isolate(t);
      ctx.engine.log('focus', `${ctx.action.name}: ningú no pot protegir ${enemyTargets(ctx).map(t => t.name).join(', ')}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.1 : 0.2; },
  },

  // On a hit, nobody can protect the target next turn.
  isolate_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target || !ctx.target.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      isolate(ctx.target);
      ctx.engine.log('attack', `Ningú no pot protegir ${ctx.target.name} el torn següent.`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // Focus: next turn, the chosen enemy's attacks land on their own allies.
  turn_on_allies: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = chosen(ctx);
      if (!t) return;
      turnOnAllies(t);
      ctx.engine.log('focus', `${t.name} es gira contra els seus: el torn següent ataca els seus aliats.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.3 : -2; },
  },

  // Focus: the chosen enemy is hunted — attacks against them +`amount` for
  // `turns` turns.
  mark: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = chosen(ctx);
      if (!t || warded(t)) return;
      const amount = num(ctx.params, 'amount', 2);
      t.setStatus('marcat', amount, num(ctx.params, 'turns', 2) + 1, { harm: 1 }, MARKED);
      ctx.engine.log('focus', `${ctx.source.name} marca ${t.name}: els atacs contra ell +${amount}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length >= 1 ? 1.1 : 0.5; },
  },

  // On a hit, the target skips `turns` turns.
  stun_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target || !ctx.target.isAlive() || (ctx.damageDealt ?? 0) <= 0 || warded(ctx.target)) return;
      ctx.target.skipTurns += num(ctx.params, 'turns', 1);
      ctx.engine.log('attack', `${ctx.target.name} perd el torn següent.`, ctx.source.team);
    },
    aiWeight() { return 0.8; },
  },

  // On a hit, lower one of the target's stats (`kind`) by `amount`.
  debuff_on_hit: {
    onAttackHit(ctx) {
      if (!ctx.target || !ctx.target.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      applyMod(ctx.target, str(ctx.params, 'kind', 'speed') as ModKind, -num(ctx.params, 'amount', 2),
        durParam(ctx.params, 'duration', 'nextTurn'), ctx.action.name);
    },
    aiWeight() { return 0.5; },
  },

  // On a block, the attacker burns: `damage` PV at each of the next `turns`
  // round ends.
  dot_on_block: {
    onDefend(ctx) {
      if (!ctx.target) return;
      const dmg = num(ctx.params, 'damage', 2);
      const name = str(ctx.params, 'name', 'cremada');
      ctx.target.setStatus(name, dmg, num(ctx.params, 'turns', 2), { dot: dmg, harm: 1 }, DOT);
      ctx.engine.log('defense', `${ctx.target.name} crema (${dmg} per torn).`, ctx.source.team);
    },
    aiWeight() { return 0.5; },
  },

  // On a block, buff the defender.
  buff_on_block: {
    onDefend(ctx) {
      applyMod(ctx.source, str(ctx.params, 'kind', 'attack') as ModKind, num(ctx.params, 'amount', 2),
        durParam(ctx.params, 'duration', 'nextTurn'), ctx.action.name);
    },
    aiWeight() { return 0.4; },
  },

  // On a block, the defender recovers `amount` PV.
  heal_on_block: {
    onDefend(ctx) { ctx.engine.heal(ctx.source, num(ctx.params, 'amount', 3)); },
    aiWeight() { return 0.4; },
  },

  // The defense covers only its owner.
  self_guard: {
    getTargetRequirement() { return 'self'; },
  },

  // After the attack, strike the same target once more with `dice` (the card's
  // own by default), hit or miss — a flurry, two blows in one card.
  strike_twice: {
    onAttackHit(ctx) { again(ctx); },
    onAttackMiss(ctx) { again(ctx); },
    aiWeight() { return 0.8; },
  },

  // Focus: out of reach this round; then `attack` on the next turn's attacks
  // and/or `heal` PV now. Never two turns running: played every round it made
  // its holder unreachable for good, and fights stalled at the round cap
  // (stone agents and the sea serpent, probed 2026-10-06).
  vanish: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('sense-ale'); },
    onResolve(ctx) {
      ctx.source.setStatus('fos', 1, 1, undefined, VANISHED);
      ctx.source.setStatus('sense-ale', 1, 2);
      const bonus = num(ctx.params, 'attack', 0);
      if (bonus) applyMod(ctx.source, 'attack', bonus, 'nextTurn', ctx.action.name);
      const heal = num(ctx.params, 'heal', 0);
      if (heal) ctx.engine.heal(ctx.source, heal);
      ctx.engine.log('focus', `${ctx.source.name} desapareix de l'abast.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.actor.currentPV < ctx.actor.maxPV * 0.5 ? 1.2 : 0.5; },
  },

  // Through the guard: the blow finds the pressure point whatever defends it.
  slip_guard: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.ignoreDefense = true; },
    aiWeight() { return 0.8; },
  },

  // Strike, then be gone: after the attack, out of reach for the rest of the
  // round — and, like `vanish`, never two turns running.
  hit_and_run: {
    canPlay(actor) { return !actor.hasStatus('sense-ale'); },
    onAttackHit(ctx) { away(ctx); },
    onAttackMiss(ctx) { away(ctx); },
    aiWeight() { return 0.8; },
  },

  // Focus: a skill modifier on oneself or the whole side.
  skill_mod: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      const who = str(ctx.params, 'target', 'self') === 'team' ? ctx.engine.alliesOf(ctx.source, true) : [ctx.source];
      for (const c of who) {
        applyMod(c, str(ctx.params, 'kind', 'attack') as ModKind, num(ctx.params, 'amount', 2),
          durParam(ctx.params, 'duration', 'restOfCombat'), ctx.action.name, diceParam(ctx.params, 'dice'));
      }
    },
    aiWeight() { return 0.9; },
  },
};

function away(ctx: EffectContext): void {
  if (ctx.source.hasStatus('fos')) return;
  ctx.source.setStatus('fos', 1, 1, undefined, VANISHED);
  ctx.source.setStatus('sense-ale', 1, 2);
  ctx.engine.log('attack', `${ctx.source.name} desapareix de l'abast.`, ctx.source.team);
}

function again(ctx: EffectContext): void {
  const t = ctx.target;
  if (!t || !t.isAlive()) return;
  const dice: DiceRoll | undefined = diceParam(ctx.params, 'dice') ?? ctx.action.dice;
  if (!dice) return;
  ctx.engine.performExtraAttack(ctx.source, t, dice, { skillId: ctx.action.skillId, label: `${ctx.source.name} torna a colpejar` });
}
