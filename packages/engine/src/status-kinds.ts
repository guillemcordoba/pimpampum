/**
 * THE ENGINE'S STATUS VOCABULARY (decided 2026-11-01): generic, parameterised
 * status kinds that carry their rules AND their price. Content applies a kind
 * with its parameters instead of writing hooks, so the AI's evaluator sees
 * every such status — priced once here, not by each card's author. A card
 * that needs something no kind covers may still bring its own
 * `StatusBehavior`, and it must price itself (`positionValue`).
 *
 * The engine names these kinds; it still never names a card or a skill, and
 * the status KEY stays the content's (two cards may each apply their own
 * damage over time under their own key).
 *
 * PRICES are in the evaluator's unit — 1.0 is about one body's full health,
 * for the holder's side — worked out from the board (`PriceBoard`). They are
 * deliberately crude estimates; a status's real worth is what the searches
 * measure.
 */
import type { Character } from './character.js';
import type { DiceRoll } from './dice.js';
import type { CombatModifier } from './modifier.js';
import type { PriceBoard, StatusBehavior, StatusRef } from './status.js';
import { ActionType } from './types.js';

/** How many rounds ahead a price counts. */
const HORIZON = 3;

const health = (c: Character): number => Math.max(1, c.maxPV);
const meanHealth = (cs: readonly Character[]): number => (cs.length ? cs.reduce((s, c) => s + health(c), 0) / cs.length : 1);
const turnsLeft = (ref: StatusRef): number => (ref.entry.remaining < 0 ? HORIZON : Math.min(ref.entry.remaining, HORIZON));

/** The blow `c` is expected to land with its best attack card: the dice's
 *  mean plus every term the engine adds (`rules.md`). */
export function expectedBlow(c: Character): number {
  let best = 0;
  for (const a of c.actions) {
    if (a.def.actionType !== ActionType.Atac) continue;
    const t = (a.def.dice?.average() ?? 0) + (a.def.rollBonus ?? 0) + c.getRollBonus(a.def.skillId, 'attack');
    best = Math.max(best, t);
  }
  return best;
}

/** `c`'s expected blow as a share of a foe's health: one turn of `c`'s offence. */
function offence(c: Character, board?: PriceBoard): number {
  const foes = board ? board.enemiesOf(c) : [];
  return expectedBlow(c) / (foes.length ? meanHealth(foes) : health(c));
}

/** The blow `c`'s foes are expected to land, as a share of `c`'s health. */
function threatOn(c: Character, board?: PriceBoard): number {
  const foes = board ? board.enemiesOf(c) : [];
  if (!foes.length) return 0;
  return foes.reduce((s, f) => s + expectedBlow(f), 0) / foes.length / health(c);
}

// --- the kinds ---------------------------------------------------------------

/** Damage over time: the holder loses `value` PV at each round's end. */
const DAMAGE_OVER_TIME: StatusBehavior = {
  harmful: true,
  onRoundEnd(ctx) {
    if (ctx.entry.value <= 0 || !ctx.holder.isAlive()) return;
    ctx.engine.log('poison', `${ctx.holder.name} pateix ${ctx.entry.value} de dany (${ctx.key}).`, ctx.holder.team);
    ctx.engine.applyPvLoss(ctx.holder, ctx.entry.value, ctx.entry.data?.['source'] as Character | undefined);
  },
  positionValue: ref => -ref.entry.value * turnsLeft(ref) / health(ref.holder),
};

/** Heal over time: the holder recovers `value` PV at each round's end. */
const HEAL_OVER_TIME: StatusBehavior = {
  onRoundEnd(ctx) {
    if (ctx.entry.value <= 0 || !ctx.holder.isAlive()) return;
    ctx.engine.heal(ctx.holder, ctx.entry.value);
  },
  positionValue: ref => Math.min(ref.entry.value * turnsLeft(ref), ref.holder.maxPV - ref.holder.currentPV) / health(ref.holder),
};

/** A blow that lands on the holder later: `data.source` strikes with
 *  `data.dice` (or the fixed `data.total`) as round `data.atRound` opens —
 *  through every defense unless `data.defendable`. */
const DELAYED_BLOW: StatusBehavior = {
  harmful: true,
  onRoundStart(ctx) {
    const d = ctx.entry.data ?? {};
    if (ctx.engine.round < ((d['atRound'] as number) ?? 0)) return;
    ctx.holder.clearStatus(ctx.key);
    const source = d['source'] as Character | undefined;
    if (!source || !ctx.holder.isAlive()) return;
    const dice = (d['total'] as number | undefined) ?? (d['dice'] as DiceRoll | undefined);
    if (dice === undefined) return;
    ctx.engine.performExtraAttack(source, ctx.holder, dice, {
      skillId: d['skillId'] as string | undefined, rollBonus: d['rollBonus'] as number | undefined,
      ignoreDefense: !d['defendable'], label: (d['label'] as string | undefined) ?? ctx.key,
    });
  },
  positionValue(ref) {
    const d = ref.entry.data ?? {};
    const expected = (d['total'] as number | undefined) ?? ((d['dice'] as DiceRoll | undefined)?.average() ?? 0) + ((d['rollBonus'] as number | undefined) ?? 0);
    return -expected * (d['defendable'] ? 0.5 : 1) / health(ref.holder);
  },
};

/** The holder's next attack is primed: +`data.bonus` to its total, ×`data.mult`. Spent by that attack. */
const PRIMED: StatusBehavior = {
  onAttackAction(ctx) {
    const d = ctx.entry.data ?? {};
    ctx.holder.clearStatus(ctx.key);
    return { attackRollBonus: (d['bonus'] as number | undefined) ?? 0, attackTotalMult: (d['mult'] as number | undefined) ?? 1 };
  },
  positionValue(ref, board) {
    const d = ref.entry.data ?? {};
    const foes = board ? board.enemiesOf(ref.holder) : [];
    const gain = ((d['bonus'] as number | undefined) ?? 0) + (((d['mult'] as number | undefined) ?? 1) - 1) * expectedBlow(ref.holder);
    return 0.7 * gain / (foes.length ? meanHealth(foes) : health(ref.holder));
  },
};

/** The holder cannot play cards of `data.types`. */
const LOCKED: StatusBehavior = {
  harmful: true,
  blocksActionType: (ref, type) => ((ref.entry.data?.['types'] as ActionType[] | undefined) ?? []).includes(type),
  positionValue(ref, board) {
    const types = (ref.entry.data?.['types'] as ActionType[] | undefined) ?? [];
    const perRound = (types.includes(ActionType.Atac) ? offence(ref.holder, board) : 0) + 0.05 * types.filter(t => t !== ActionType.Atac).length;
    return -perRound * turnsLeft(ref);
  },
};

/** A ward with `data.life`: it soaks the holder's damage until it runs out. */
const WARD: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    const life = (ctx.entry.data?.['life'] as number | undefined) ?? 0;
    if (damage <= 0 || life <= 0) return damage;
    const soaked = Math.min(damage, life);
    ctx.entry.data!['life'] = life - soaked;
    ctx.engine.log('defense', `La protecció de ${ctx.holder.name} aguanta ${soaked} de dany.`, ctx.holder.team);
    if (life - soaked <= 0) ctx.holder.clearStatus(ctx.key);
    return damage - soaked;
  },
  positionValue(ref, board) {
    const life = (ref.entry.data?.['life'] as number | undefined) ?? 0;
    return Math.min(life / health(ref.holder), threatOn(ref.holder, board) * turnsLeft(ref));
  },
};

/** A standing wall before the holder: `data.caster` defends every blow on
 *  the holder with `data.dice` (+ `data.rollBonus`, `data.skillId`'s roll bonuses),
 *  like a live defense, joined to any guard. With `data.life`, a breach is
 *  soaked by the wall until its life runs out. */
const STANDING_WALL: StatusBehavior = {
  standingGuard(ctx) {
    const d = ctx.entry.data ?? {};
    const caster = d['caster'] as Character | undefined;
    if (!caster || !caster.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    return { defender: caster, dice: d['dice'] as DiceRoll | undefined, skillId: (d['skillId'] as string | undefined) ?? '', rollBonus: (d['rollBonus'] as number | undefined) ?? 0, name: (d['name'] as string | undefined) ?? ctx.key };
  },
  onStandingGuardBroken(ctx) {
    if (ctx.entry.data && typeof ctx.entry.data['life'] === 'number') ctx.entry.data['breaching'] = true;
  },
  modifyIncomingDamage(ctx, damage) {
    const d = ctx.entry.data;
    if (!d || !d['breaching']) return damage;
    d['breaching'] = false;
    const life = d['life'] as number;
    const soaked = Math.min(damage, life);
    d['life'] = life - soaked;
    if (life - soaked <= 0) ctx.holder.clearStatus(ctx.key);
    return damage - soaked;
  },
  positionValue(ref, board) {
    const d = ref.entry.data ?? {};
    const caster = d['caster'] as Character | undefined;
    if (!caster) return 0;
    const defense = ((d['dice'] as DiceRoll | undefined)?.average() ?? 0) + ((d['rollBonus'] as number | undefined) ?? 0)
      + caster.getRollBonus((d['skillId'] as string | undefined) ?? '', 'defense');
    return Math.min(defense / health(ref.holder), threatOn(ref.holder, board)) * turnsLeft(ref);
  },
};

/** No enemy can target the holder. */
const UNTARGETABLE: StatusBehavior = {
  untargetable: () => true,
  positionValue: (ref, board) => 0.5 * threatOn(ref.holder, board) * turnsLeft(ref),
};

/** Nobody can guard the holder (its own defense included). */
const UNGUARDABLE: StatusBehavior = {
  harmful: true,
  preventsGuard: () => true,
  positionValue: ref => -0.05 * turnsLeft(ref),
};

/** The holder's attacks must target `data.taunter` while it stands. */
const TAUNTED: StatusBehavior = {
  harmful: true,
  attackTargetsOnly(ctx) {
    const t = ctx.entry.data?.['taunter'] as Character | undefined;
    return t && t.isAlive() ? [t] : undefined;
  },
  positionValue: ref => -0.05 * turnsLeft(ref),
};

/** The holder's attacks land on `data.to` instead, while it stands. */
const REDIRECTED: StatusBehavior = {
  harmful: true,
  redirectAttackTarget(ctx, intended) {
    const to = ctx.entry.data?.['to'] as Character | undefined;
    return to && to.isAlive() ? to : intended;
  },
  positionValue: (ref, board) => -0.5 * offence(ref.holder, board) * turnsLeft(ref),
};

/** Every kind, by its name: how a snapshot names one (`CombatEngine.snapshot`). */
export const STATUS_KINDS = {
  damageOverTime: DAMAGE_OVER_TIME,
  healOverTime: HEAL_OVER_TIME,
  delayedBlow: DELAYED_BLOW,
  primed: PRIMED,
  locked: LOCKED,
  ward: WARD,
  standingWall: STANDING_WALL,
  untargetable: UNTARGETABLE,
  unguardable: UNGUARDABLE,
  taunted: TAUNTED,
  redirected: REDIRECTED,
} as const satisfies Record<string, StatusBehavior>;
export type StatusKind = keyof typeof STATUS_KINDS;

const KIND_NAMES = new Map<object, string>(Object.entries(STATUS_KINDS).map(([name, b]) => [b, `kind:${name}`]));
/** The engine's own name for a kind's behaviour (`kind:<name>`), or undefined. */
export const kindName = (o: object): string | undefined => KIND_NAMES.get(o);
/** The kind a `kind:<name>` names, or undefined. */
export const kindNamed = (name: string): StatusBehavior | undefined =>
  name.startsWith('kind:') ? (STATUS_KINDS as Record<string, StatusBehavior>)[name.slice(5)] : undefined;

/** Apply a kind to `target` under the content's own `key`: `value` and
 *  `turns` as `setStatus` takes them (-1: the rest of the fight), `data` the
 *  kind's parameters. */
export function applyKind(target: Character, kind: StatusKind, key: string, value: number, turns: number, data?: Record<string, unknown>): void {
  target.setStatus(key, value, turns, data, STATUS_KINDS[kind]);
}

// --- the engine fields the evaluator prices too --------------------------------

/**
 * What `c`'s ENGINE FIELDS are worth to its side, as a status would price
 * itself: turns it will lose (`skipTurns`) and its roll modifiers
 * (`CombatModifier`, +1 on a roll ≈ +1 PV on a blow, since damage is the
 * margin). Read by the evaluator beside the statuses' own prices.
 */
export function fieldValue(c: Character, board?: PriceBoard): number {
  let v = c.skipTurns > 0 ? -Math.min(c.skipTurns, HORIZON) * offence(c, board) : 0;
  for (const m of c.modifiers) v += modifierValue(c, m, board);
  return v;
}

function modifierValue(c: Character, m: CombatModifier, board?: PriceBoard): number {
  const rounds = m.duration === 'ThisTurn' ? 0 : m.duration === 'RestOfCombat' ? HORIZON : Math.min(m.duration.remaining, HORIZON);
  if (!rounds) return 0;
  const amount = m.dice ? m.dice.average() : m.value;
  // A defense or armour point saves about a point on each blow taken; any
  // other roll stat (attack, a skill, every skill) adds a point to each blow given.
  if (m.stat === 'defense' || m.stat === 'armor') return amount * rounds * 0.5 / health(c);
  const foes = board ? board.enemiesOf(c) : [];
  return amount * rounds / (foes.length ? meanHealth(foes) : health(c));
}
