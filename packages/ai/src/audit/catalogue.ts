/**
 * THE IMAGINARY CARDS — archetypes the audit deals its positions from.
 *
 * No content set is imported, here or anywhere in the audit. Every card is an
 * engine generic (an attack, a defense, a focus) plus, where it needs one, an
 * inline effect handler registered below under an `audit:` key; every status
 * carries its own `StatusBehavior`. Each archetype is a small parameterised
 * generator: `build` turns plain JSON params into a card (so a position can be
 * serialised and replayed), `draw` deals params from the real-kit profile, and
 * `horizon` says how many rounds the card needs before its effect has fully
 * landed — 1 for a blow that lands this round, 2 for one that lands next
 * round, N for a device that ticks for N rounds.
 *
 * STATUS PRICING. The production AI sees a status only through
 * `StatusBehavior.positionValue`. A content author is expected to price a
 * status, so most cards here do (conservatively, in the unit the seam
 * documents: 1.0 ≈ one body's full health); a `priced: 0` draw leaves it blind,
 * as an unpriced real card would be. The report separates the two.
 */
import {
  ActionType, DiceRoll, EffectRegistry, type ActionDefinition, type Character, type StatusBehavior,
  type StatusHookContext, type StatusRef,
} from '@pimpampum/engine';
import { PROFILE } from './profile.js';
import { AUDIT_SKILL, dice, int, pick, type Draw, type Params } from './draw.js';
import { buildComposed, COMPOSED_STATUSES, composedHorizon, describeComposed, drawComposed, registerComposed } from './compose.js';

export { AUDIT_SKILL, int, pick, weighted, type Draw, type Params } from './draw.js';

export interface Archetype {
  id: string;
  /** What the card does, for the report. */
  summary: string;
  build(p: Params, uid: string): ActionDefinition;
  draw(r: Draw): Params;
  horizon(p: Params): number;
}

function card(uid: string, type: ActionType, p: Params, over: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: uid, name: uid, skillId: AUDIT_SKILL, unlockLevel: 0, actionType: type,
    fast: !!p.fast,
    dice: p.n ? new DiceRoll(p.n, p.s) : undefined,
    effects: [],
    description: '', iconPath: '',
    ...over,
    // A fatigue price, the real kits' brake on a strong card.
    ...(p.fatigue ? { effects: [...(over.effects ?? []), { type: 'audit:fatigue', params: { levels: p.fatigue } }] } : {}),
  };
}

const fast = (r: Draw, type: 'attack' | 'defense' | 'focus'): number => (r() < PROFILE.fast[type] ? 1 : 0);
const fatigueCost = (r: Draw): number => (r() < PROFILE.fatigueCostShare ? 1 : 0);
const priced = (r: Draw): number => (r() < PROFILE.pricedShare ? 1 : 0);

// --- statuses -------------------------------------------------------------

/** Statuses an ally's cleanse removes. */
const BANE = { bane: 1 };
const hpOf = (c: Character): number => Math.max(1, c.maxPV);

/** Lands at the start of the holder's next round. */
const BOMB = (pricedFlag: boolean): StatusBehavior => ({
  onRoundStart(ctx) {
    const dmg = ctx.entry.value;
    ctx.holder.statuses.delete(ctx.key);
    ctx.engine.applyPvLoss(ctx.holder, dmg);
  },
  ...(pricedFlag ? { positionValue: (ref: StatusRef) => -ref.entry.value / hpOf(ref.holder) } : {}),
});

/** Lands at the end of the round in which its count reaches zero. */
const DOOM = (pricedFlag: boolean): StatusBehavior => ({
  onRoundEnd(ctx) {
    const left = (ctx.entry.data!.left as number) - 1;
    if (left > 0) { ctx.entry.data!.left = left; return; }
    const dmg = ctx.entry.value;
    ctx.holder.statuses.delete(ctx.key);
    ctx.engine.applyPvLoss(ctx.holder, dmg);
  },
  ...(pricedFlag ? { positionValue: (ref: StatusRef) => -0.8 * ref.entry.value / hpOf(ref.holder) } : {}),
});

/** Hits the weakest living enemy of its holder at every round's end. */
const DEVICE = (pricedFlag: boolean): StatusBehavior => ({
  onRoundEnd(ctx) {
    const foes = ctx.engine.enemiesOf(ctx.holder);
    const left = (ctx.entry.data!.left as number) - 1;
    if (left > 0) ctx.entry.data!.left = left; else ctx.holder.statuses.delete(ctx.key);
    if (!foes.length) return;
    const target = foes.reduce((a, b) => (b.currentPV < a.currentPV ? b : a));
    ctx.engine.applyPvLoss(target, ctx.entry.value, ctx.holder);
  },
  ...(pricedFlag ? {
    positionValue: (ref: StatusRef) => 0.6 * ref.entry.value * (ref.entry.data!.left as number) / hpOf(ref.holder),
  } : {}),
});

/** The holder's next attack is +value; spent on use. */
const CHARGED = (pricedFlag: boolean): StatusBehavior => ({
  onAttackAction(ctx) {
    const bonus = ctx.entry.value;
    ctx.holder.statuses.delete(ctx.key);
    return { attackRollBonus: bonus };
  },
  ...(pricedFlag ? { positionValue: (ref: StatusRef) => 0.5 * ref.entry.value / hpOf(ref.holder) } : {}),
});

/** The holder's attacks are −value for `left` round-ends. */
const WEAK = (pricedFlag: boolean): StatusBehavior => ({
  onAttackAction(ctx) { return { attackRollBonus: -ctx.entry.value }; },
  onRoundEnd: tickDown,
  ...(pricedFlag ? {
    positionValue: (ref: StatusRef) => -0.4 * ref.entry.value * (ref.entry.data!.left as number) / hpOf(ref.holder),
  } : {}),
});

/** The holder may not play attacks while it holds. */
const LOCK = (pricedFlag: boolean): StatusBehavior => ({
  blocksActionType: (_ref, type) => type === ActionType.Atac,
  onRoundEnd: tickDown,
  ...(pricedFlag ? { positionValue: (ref: StatusRef) => -0.3 * (ref.entry.data!.left as number) } : {}),
});

/** The holder's attacks must go to `data.by` while it stands. */
const TAUNTED = (pricedFlag: boolean): StatusBehavior => ({
  attackTargetsOnly(ctx) {
    const by = ctx.entry.data!.by as Character;
    return by.isAlive() ? [by] : undefined;
  },
  onRoundEnd: tickDown,
  ...(pricedFlag ? { positionValue: () => -0.1 } : {}),
});

/** No blow wounds the holder for the rest of the round. No `positionValue`:
 *  it is gone before any leaf reads it, so a price could only ever be read
 *  wrong. It does say it takes nothing, so the AI does not aim blows at it. */
const HIDDEN: StatusBehavior = { modifyIncomingDamage: () => 0, expectedIncomingDamage: () => 0 };

function tickDown(ctx: StatusHookContext): void {
  const left = (ctx.entry.data!.left as number) - 1;
  if (left > 0) ctx.entry.data!.left = left; else ctx.holder.statuses.delete(ctx.key);
}

// Behaviours are shared objects (the clone shares them), so build each variant once.
const B = {
  bomb: [BOMB(false), BOMB(true)], doom: [DOOM(false), DOOM(true)], device: [DEVICE(false), DEVICE(true)],
  charged: [CHARGED(false), CHARGED(true)], weak: [WEAK(false), WEAK(true)], lock: [LOCK(false), LOCK(true)],
  taunted: [TAUNTED(false), TAUNTED(true)],
};

/** Every status key the catalogue sets, with its behaviour pair — for replaying
 *  a serialised position's pre-set statuses. */
export const STATUS_BEHAVIORS: Record<string, readonly StatusBehavior[]> = {
  'audit.bomb': B.bomb, 'audit.doom': B.doom, 'audit.device': B.device, 'audit.charged': B.charged,
  'audit.weak': B.weak, 'audit.lock': B.lock, 'audit.taunted': B.taunted,
  ...COMPOSED_STATUSES,
};

// --- the registry ---------------------------------------------------------

const P = (ctx: { params: Record<string, unknown> }, k: string): number => Number(ctx.params[k] ?? 0);

/** Every handler the catalogue's cards reach. One per process is enough. */
export function auditRegistry(): EffectRegistry {
  const r = new EffectRegistry();
  r.register('audit:fatigue', {
    onPlay(ctx) { ctx.source.setFatigue(ctx.source.fatigue + P(ctx, 'levels')); },
  });
  r.register('audit:pierce', {
    modifyAttack(ctx) {
      if (P(ctx, 'armour')) ctx.attackMods!.ignoreArmor = true;
      if (P(ctx, 'defense')) ctx.attackMods!.ignoreDefense = true;
    },
  });
  r.register('audit:guard', { getTargetRequirement: () => 'ally' });
  r.register('audit:block', { getTargetRequirement: () => 'enemy' });
  r.register('audit:heal', {
    getTargetRequirement: () => 'ally',
    onResolve(ctx) { for (const t of ctx.targets) if (t.isAlive()) ctx.engine.heal(t, P(ctx, 'amount')); },
  });
  r.register('audit:revive', {
    getTargetRequirement: () => 'fallen_ally',
    onResolve(ctx) { for (const t of ctx.targets) ctx.engine.heal(t, P(ctx, 'amount')); },
  });
  r.register('audit:cleanse', {
    getTargetRequirement: () => 'ally',
    onResolve(ctx) {
      for (const t of ctx.targets) {
        for (const [key, e] of [...t.statuses]) if (e.data?.bane) t.statuses.delete(key);
      }
    },
  });
  r.register('audit:setup', {
    getTargetRequirement: () => 'none',
    onResolve(ctx) {
      const prev = ctx.source.statuses.get('audit.charged')?.value ?? 0;
      ctx.source.setStatus('audit.charged', prev + P(ctx, 'bonus'), -1, undefined, B.charged[P(ctx, 'priced')]);
    },
  });
  r.register('audit:bomb', {
    getTargetRequirement: () => 'enemy',
    onResolve(ctx) {
      for (const t of ctx.targets) {
        const prev = t.statuses.get('audit.bomb')?.value ?? 0;
        t.setStatus('audit.bomb', prev + P(ctx, 'dmg'), -1, { ...BANE }, B.bomb[P(ctx, 'priced')]);
      }
    },
  });
  r.register('audit:doom', {
    getTargetRequirement: () => 'enemy',
    onResolve(ctx) {
      for (const t of ctx.targets) {
        if (t.statuses.has('audit.doom')) continue;
        t.setStatus('audit.doom', P(ctx, 'dmg'), -1, { ...BANE, left: P(ctx, 'delay') }, B.doom[P(ctx, 'priced')]);
      }
    },
  });
  r.register('audit:device', {
    getTargetRequirement: () => 'none',
    onResolve(ctx) {
      ctx.source.setStatus('audit.device', P(ctx, 'dmg'), -1, { left: P(ctx, 'rounds') }, B.device[P(ctx, 'priced')]);
    },
  });
  r.register('audit:stun', {
    onAttackHit(ctx) { if (ctx.target && (ctx.damageDealt ?? 0) > 0) ctx.target.skipTurns = Math.max(ctx.target.skipTurns, 1); },
  });
  r.register('audit:lock', {
    onAttackHit(ctx) {
      if (!ctx.target || (ctx.damageDealt ?? 0) <= 0) return;
      // Two round-ends: the rest of this round and all of the next.
      ctx.target.setStatus('audit.lock', 1, -1, { ...BANE, left: 2 }, B.lock[P(ctx, 'priced')]);
    },
  });
  r.register('audit:weaken', {
    onAttackHit(ctx) {
      if (!ctx.target || (ctx.damageDealt ?? 0) <= 0) return;
      ctx.target.setStatus('audit.weak', P(ctx, 'by'), -1, { ...BANE, left: P(ctx, 'rounds') }, B.weak[P(ctx, 'priced')]);
    },
  });
  r.register('audit:advance', {
    getTargetRequirement: () => 'ally_other',
    onResolve(ctx) { for (const t of ctx.targets) ctx.engine.advancePendingAction(t); },
    // The hint the real card carries (Acrobàcia's launch): the ally whose
    // attack is still to come. Without it the heuristic advanced the most
    // wounded ally, and the rollouts judged advance on that (NEXT-STEPS §54.3).
    aiTargetPriority(ctx, c) {
      return ctx.plan.some(p => p.actor === c && !p.resolved && !p.cancelled && p.actionType === ActionType.Atac) ? 10 : 0;
    },
  });
  r.register('audit:taunt', {
    getTargetRequirement: () => 'none',
    onResolve(ctx) {
      for (const e of ctx.engine.enemiesOf(ctx.source)) {
        e.setStatus('audit.taunted', 1, -1, { left: P(ctx, 'rounds'), by: ctx.source }, B.taunted[P(ctx, 'priced')]);
      }
    },
  });
  r.register('audit:hide', {
    getTargetRequirement: () => 'none',
    // One turn: it lapses as this round ends.
    onResolve(ctx) { ctx.source.setStatus('audit.hidden', 1, 1, undefined, HIDDEN); },
  });
  r.register('audit:selfwound', {
    onAttackResolved(ctx) { ctx.engine.applyPvLoss(ctx.source, 1); },
  });
  registerComposed(r);
  return r;
}

// --- the archetypes ---------------------------------------------------------

const fx = (type: string, params: Params) => [{ type, params }];

export const ARCHETYPES: Record<string, Archetype> = {
  strike: {
    id: 'strike', summary: 'attack',
    build: (p, uid) => card(uid, ActionType.Atac, p, {}),
    draw: r => ({ ...dice(r, PROFILE.dice.attack), fast: fast(r, 'attack'), fatigue: fatigueCost(r) }),
    horizon: () => 1,
  },
  jab: {
    id: 'jab', summary: 'fast interrupt (small dice, fast)',
    build: (p, uid) => card(uid, ActionType.Atac, p, {}),
    draw: r => ({ n: 1, s: pick(r, [2, 3, 4]), fast: 1, fatigue: 0 }),
    horizon: () => 1,
  },
  sweep: {
    id: 'sweep', summary: 'area attack (every enemy, one roll)',
    build: (p, uid) => card(uid, ActionType.Atac, p, { targetCount: 99 }),
    draw: r => ({ ...dice(r, PROFILE.dice.area), fast: fast(r, 'attack'), fatigue: fatigueCost(r) }),
    horizon: () => 1,
  },
  pierce: {
    id: 'pierce', summary: 'armour-piercing (armour=1) or undefendable (defense=1) attack',
    build: (p, uid) => card(uid, ActionType.Atac, p, { effects: fx('audit:pierce', { armour: p.armour, defense: p.defense }) }),
    draw: r => {
      const undefendable = r() < 0.5 ? 1 : 0;
      return { ...dice(r, PROFILE.dice.attack), fast: fast(r, 'attack'), armour: 1 - undefendable, defense: undefendable, fatigue: fatigueCost(r) };
    },
    horizon: () => 1,
  },
  guard: {
    id: 'guard', summary: 'defense: guard an ally (or yourself)',
    build: (p, uid) => card(uid, ActionType.Defensa, p, { effects: fx('audit:guard', {}) }),
    draw: r => ({ ...dice(r, PROFILE.dice.defense), fast: fast(r, 'defense') }),
    horizon: () => 1,
  },
  block: {
    id: 'block', summary: 'defense: block an enemy (its blows come at you)',
    build: (p, uid) => card(uid, ActionType.Defensa, p, { effects: fx('audit:block', {}) }),
    draw: r => ({ ...dice(r, PROFILE.dice.defense), fast: fast(r, 'defense') }),
    horizon: () => 1,
  },
  heal: {
    id: 'heal', summary: 'focus: heal an ally',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:heal', { amount: p.amount }) }),
    draw: r => ({ amount: int(r, 2, 6), fast: fast(r, 'focus') }),
    horizon: () => 1,
  },
  revive: {
    id: 'revive', summary: 'focus: raise a fallen ally (they act next round)',
    build: (p, uid) => card(uid, ActionType.Focus, p, { canReviveTarget: true, effects: fx('audit:revive', { amount: p.amount }) }),
    draw: r => ({ amount: int(r, 3, 6), fast: fast(r, 'focus') }),
    horizon: () => 2,
  },
  cleanse: {
    id: 'cleanse', summary: 'focus: strip every harmful status from an ally',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:cleanse', {}) }),
    draw: r => ({ fast: fast(r, 'focus') }),
    horizon: () => 2,
  },
  setup: {
    id: 'setup', summary: 'focus: your next attack is +bonus',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:setup', { bonus: p.bonus, priced: p.priced }) }),
    draw: r => ({ bonus: int(r, 3, 8), fast: 0, priced: priced(r) }),
    horizon: () => 2,
  },
  bomb: {
    id: 'bomb', summary: 'delayed damage: lands on an enemy as next round opens',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:bomb', { dmg: p.dmg, priced: p.priced }) }),
    draw: r => ({ dmg: int(r, 3, 8), fast: fast(r, 'focus'), priced: priced(r) }),
    horizon: () => 2,
  },
  doom: {
    id: 'doom', summary: 'delayed-death mark: big damage at the end of round +delay−1',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:doom', { dmg: p.dmg, delay: p.delay, priced: p.priced }) }),
    draw: r => ({ dmg: int(r, 6, 14), delay: int(r, 2, 3), fast: fast(r, 'focus'), priced: priced(r) }),
    horizon: p => p.delay,
  },
  device: {
    id: 'device', summary: 'device: hits the weakest enemy at every round end, for N rounds',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:device', { dmg: p.dmg, rounds: p.rounds, priced: p.priced }) }),
    draw: r => ({ dmg: int(r, 1, 4), rounds: int(r, 2, 4), fast: fast(r, 'focus'), priced: priced(r) }),
    horizon: p => p.rounds,
  },
  stun: {
    id: 'stun', summary: 'attack that, if it wounds, takes the target\'s next round',
    build: (p, uid) => card(uid, ActionType.Atac, p, { effects: fx('audit:stun', {}) }),
    draw: r => ({ ...dice(r, PROFILE.dice.control), fast: fast(r, 'attack'), fatigue: fatigueCost(r) }),
    horizon: () => 2,
  },
  lock: {
    id: 'lock', summary: 'attack that, if it wounds, forbids the target\'s attacks until next round ends',
    build: (p, uid) => card(uid, ActionType.Atac, p, { effects: fx('audit:lock', { priced: p.priced }) }),
    draw: r => ({ ...dice(r, PROFILE.dice.control), fast: fast(r, 'attack'), priced: priced(r) }),
    horizon: () => 2,
  },
  weaken: {
    id: 'weaken', summary: 'attack that, if it wounds, makes the target\'s attacks −by',
    build: (p, uid) => card(uid, ActionType.Atac, p, { effects: fx('audit:weaken', { by: p.by, rounds: p.rounds, priced: p.priced }) }),
    draw: r => ({ ...dice(r, PROFILE.dice.control), fast: fast(r, 'attack'), by: int(r, 2, 4), rounds: 2, priced: priced(r) }),
    horizon: () => 2,
  },
  advance: {
    id: 'advance', summary: 'fast focus: an ally\'s pending card resolves right now',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:advance', {}) }),
    draw: () => ({ fast: 1 }),
    horizon: () => 1,
  },
  taunt: {
    id: 'taunt', summary: 'fast focus: every enemy\'s attacks must target you',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:taunt', { rounds: p.rounds, priced: p.priced }) }),
    draw: r => ({ fast: 1, rounds: int(r, 1, 2), priced: priced(r) }),
    horizon: p => p.rounds,
  },
  hide: {
    id: 'hide', summary: 'focus: dodge every blow that lands after it, this round',
    build: (p, uid) => card(uid, ActionType.Focus, p, { effects: fx('audit:hide', {}) }),
    // A hide is fast: one that resolves after the blows has nothing left to dodge.
    draw: () => ({ fast: 1 }),
    horizon: () => 1,
  },
  composed: {
    id: 'composed', summary: 'a card drawn part by part: type, trigger, effect, subject (compose.ts)',
    build: (p, uid) => buildComposed(p, uid),
    draw: drawComposed,
    horizon: composedHorizon,
  },
  desperate: {
    id: 'desperate', summary: 'the universal fallback: only when nothing else is legal',
    build: (p, uid) => card(uid, ActionType.Atac, { n: 1, s: 4 }, { lastResort: true, effects: fx('audit:selfwound', {}) }),
    draw: () => ({}),
    horizon: () => 1,
  },
};

/** Archetypes the generator deals (the fallback is added to every hand). */
export const DEALT = Object.keys(ARCHETYPES).filter(k => k !== 'desperate' && k !== 'composed');

/** A card in words, for the report. */
export const describeCard = (arch: string, p: Params): string => (arch === 'composed' ? describeComposed(p) : arch);
