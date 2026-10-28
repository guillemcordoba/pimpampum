/**
 * COMPOSED CARDS — imaginary cards built from parts, so the audit is not
 * graded on one hand-written list of effects.
 *
 * The archetypes (`catalogue.ts`) are twenty effects someone chose. A shortcut
 * or a leaf that looks right on them may only be right about THOSE twenty. So
 * a composed card is drawn part by part:
 *
 *   type     Atac / Defensa / Focus, with the profile's dice and fast share
 *   TRIGGER  when its rider fires: an attack's hit, miss, or end; a defense's
 *            block (every card in a wall that holds) or breach; a focus's
 *            resolution, or the reveal itself
 *   EFFECT   what the rider does: harm (wound, weaken, stun, lock, a bomb,
 *            expose, slow, a counter-blow, daze) or help (heal, charge,
 *            brace, haste, shell, focus)
 *   SUBJECT  on whom: the trigger's own subject (the target hit, the attacker
 *            blocked, the body a focus is aimed at), the actor, a whole side,
 *            the weakest, or one at random — harm always lands on the foe's
 *            side, help on one's own
 *
 * and a magnitude and a duration. Thousands of distinct cards, on-block
 * payoffs among them. Each status prices itself (`positionValue`) on the
 * profile's share of priced statuses, so some are invisible to the AI's
 * evaluator, as unpriced real cards would be.
 *
 * Params are plain numbers (codes into the tables below), so a position stays
 * JSON and replays exactly.
 */
import {
  ActionType, DiceRoll, type ActionDefinition, type Character, type EffectContext, type EffectRegistry,
  type StatusBehavior, type StatusHookContext, type StatusRef,
} from '@pimpampum/engine';
import { type Draw, type Params, AUDIT_SKILL, dice, int, pick, weighted } from './draw.js';
import { PROFILE } from './profile.js';

export const TRIGGERS = ['hit', 'miss', 'after', 'block', 'breach', 'resolve', 'reveal'] as const;
const BY_TYPE_TRIGGERS: Record<ActionType, readonly number[]> = {
  [ActionType.Atac]: [0, 1, 2],
  [ActionType.Defensa]: [3, 4],
  [ActionType.Focus]: [5, 6],
};
/** The triggers whose own subject is a foe (the target hit or missed, the
 *  attacker blocked or breaching) — harm can land there. */
const FOE_SUBJECT = new Set([0, 1, 2, 3, 4]);

export const HARM = ['wound', 'weaken', 'stun', 'lock', 'bomb', 'expose', 'slow', 'counter', 'daze'] as const;
export const HELP = ['heal', 'charge', 'brace', 'haste', 'shell', 'focused'] as const;
export const EFFECTS = [...HARM, ...HELP] as const;
export const SUBJECTS = ['trigger', 'self', 'side', 'weakest', 'random'] as const;

const isHarm = (e: number): boolean => e < HARM.length;
const TYPES = [ActionType.Atac, ActionType.Defensa, ActionType.Focus];

const hpOf = (c: Character): number => Math.max(1, c.maxPV);

function tickDown(ctx: StatusHookContext): void {
  const left = (ctx.entry.data!.left as number) - 1;
  if (left > 0) ctx.entry.data!.left = left; else ctx.holder.statuses.delete(ctx.key);
}
const left = (ref: StatusRef): number => Number(ref.entry.data?.left ?? 1);

/** A timed status: `extra` its mechanics, `worth` its price per point per
 *  round to its holder (negative: a harm). Built once per priced flag. */
function timed(extra: StatusBehavior, worth: number): readonly StatusBehavior[] {
  return [false, true].map(priced => ({
    ...extra,
    onRoundEnd: tickDown,
    ...(priced ? { positionValue: (ref: StatusRef) => worth * ref.entry.value * left(ref) / hpOf(ref.holder) } : {}),
  }));
}

const S = {
  weaken: timed({ onAttackAction: ctx => ({ attackRollBonus: -ctx.entry.value }) }, -0.4),
  lock: timed({ blocksActionType: (_ref, type) => type === ActionType.Atac }, -0.3),
  expose: timed({ attackRollAgainstHolder: ref => ref.entry.value }, -0.3),
  slow: timed({ fast: () => false }, -0.05),
  daze: timed({ rollMode: () => 'disadvantage' }, -0.1),
  brace: timed({ modifyContestTotal: (ctx, own, _o, kind) => (kind === 'defense' ? own + ctx.entry.value : own) }, 0.3),
  haste: timed({ fast: () => true }, 0.05),
  shell: timed({ modifyIncomingDamage: (ctx, dmg) => Math.max(0, dmg - ctx.entry.value) }, 0.3),
  focused: timed({ rollMode: () => 'advantage' }, 0.1),
  bomb: [false, true].map(priced => ({
    onRoundStart(ctx: StatusHookContext) {
      const dmg = ctx.entry.value;
      ctx.holder.statuses.delete(ctx.key);
      ctx.engine.applyPvLoss(ctx.holder, dmg);
    },
    ...(priced ? { positionValue: (ref: StatusRef) => -ref.entry.value / hpOf(ref.holder) } : {}),
  })) as readonly StatusBehavior[],
  charge: [false, true].map(priced => ({
    onAttackAction(ctx: StatusHookContext) {
      const bonus = ctx.entry.value;
      ctx.holder.statuses.delete(ctx.key);
      return { attackRollBonus: bonus };
    },
    ...(priced ? { positionValue: (ref: StatusRef) => 0.5 * ref.entry.value / hpOf(ref.holder) } : {}),
  })) as readonly StatusBehavior[],
};

/** Every status a composed card sets, for replaying a serialised position. */
export const COMPOSED_STATUSES: Record<string, readonly StatusBehavior[]> = Object.fromEntries(
  Object.entries(S).map(([k, v]) => [`audit.c.${k}`, v]),
);

const P = (ctx: { params: Record<string, unknown> }, k: string): number => Number(ctx.params[k] ?? 0);

/** The bodies the rider lands on. */
function subjects(ctx: EffectContext, triggerSubjects: readonly Character[]): Character[] {
  const harm = isHarm(P(ctx, 'e'));
  const side = harm ? ctx.engine.enemiesOf(ctx.source) : ctx.engine.alliesOf(ctx.source, true);
  const living = (cs: readonly Character[]) => cs.filter(c => c.isAlive());
  switch (SUBJECTS[P(ctx, 'g')]) {
    case 'trigger': return living(triggerSubjects);
    case 'self': return ctx.source.isAlive() ? [ctx.source] : [];
    case 'side': return side;
    case 'weakest': return side.length ? [side.reduce((a, b) => (b.currentPV < a.currentPV ? b : a))] : [];
    case 'random': return side.length ? [side[ctx.engine.rollDie(side.length) - 1]] : [];
    default: return [];
  }
}

function apply(ctx: EffectContext, triggerSubjects: readonly Character[]): void {
  const m = P(ctx, 'm');
  const d = Math.max(1, P(ctx, 'd'));
  const priced = P(ctx, 'priced');
  const effect = EFFECTS[P(ctx, 'e')];
  for (const t of subjects(ctx, triggerSubjects)) {
    if (!t.isAlive() && effect !== 'heal') continue;
    const status = (key: keyof typeof S, value: number, data?: Record<string, number>) =>
      t.setStatus(`audit.c.${key}`, value, -1, data, S[key][priced]);
    switch (effect) {
      case 'wound': ctx.engine.applyPvLoss(t, m, ctx.source); break;
      case 'stun': t.skipTurns = Math.max(t.skipTurns, 1); break;
      case 'bomb': status('bomb', (t.statuses.get('audit.c.bomb')?.value ?? 0) + m); break;
      case 'counter': if (ctx.source.isAlive()) ctx.engine.performExtraAttack(ctx.source, t, new DiceRoll(P(ctx, 'cn'), P(ctx, 'cs'))); break;
      case 'heal': if (t.isAlive()) ctx.engine.heal(t, m); break;
      case 'charge': status('charge', (t.statuses.get('audit.c.charge')?.value ?? 0) + m); break;
      // Timed statuses: `d` round-ends, counting the one that closes this round.
      default: status(effect as keyof typeof S, m, { left: d });
    }
  }
}

const fires = (ctx: EffectContext, trigger: (typeof TRIGGERS)[number]): boolean => TRIGGERS[P(ctx, 't')] === trigger;

export function registerComposed(r: EffectRegistry): void {
  r.register('audit:composed', {
    onAttackHit(ctx) { if (fires(ctx, 'hit') && (ctx.damageDealt ?? 0) > 0 && ctx.target) apply(ctx, [ctx.target]); },
    onAttackMiss(ctx) { if (fires(ctx, 'miss') && ctx.target) apply(ctx, [ctx.target]); },
    onAttackResolved(ctx) { if (fires(ctx, 'after')) apply(ctx, ctx.targets); },
    onDefend(ctx) { if (fires(ctx, 'block') && ctx.target) apply(ctx, [ctx.target]); },
    onBlockFail(ctx) { if (fires(ctx, 'breach') && ctx.target) apply(ctx, [ctx.target]); },
    onResolve(ctx) { if (fires(ctx, 'resolve')) apply(ctx, ctx.targets); },
    onReveal(ctx) { if (fires(ctx, 'reveal')) apply(ctx, []); },
  });
  // A focus's aim, on a focus card only (an attack aims at foes and a
  // defense guards, as any card of its type).
  r.register('audit:composed-aim', {
    getTargetRequirement: params => (SUBJECTS[Number(params.g)] !== 'trigger' ? 'none' : isHarm(Number(params.e)) ? 'enemy' : 'ally'),
  });
}

/** The card a composed spec stands for. */
export function buildComposed(p: Params, uid: string): ActionDefinition {
  const type = TYPES[p.type];
  // A focus's rider IS the card; an attack or a defense also rolls its dice.
  const aim = type === ActionType.Defensa ? [{ type: 'audit:guard', params: {} }]
    : type === ActionType.Focus ? [{ type: 'audit:composed-aim', params: { g: p.g, e: p.e } }] : [];
  return {
    id: uid, name: uid, skillId: AUDIT_SKILL, unlockLevel: 0, actionType: type,
    fast: !!p.fast,
    dice: p.n ? new DiceRoll(p.n, p.s) : undefined,
    effects: [
      ...aim,
      { type: 'audit:composed', params: { ...p } },
      // A fatigue price, the real kits' brake on a strong card.
      ...(p.fatigue ? [{ type: 'audit:fatigue', params: { levels: p.fatigue } }] : []),
    ],
    description: '', iconPath: '',
  };
}

/** One composed card, drawn part by part. */
export function drawComposed(r: Draw): Params {
  const typeName = weighted(r, [['attack', PROFILE.typeMix.attack], ['defense', PROFILE.typeMix.defense], ['focus', PROFILE.typeMix.focus]] as const) as 'attack' | 'defense' | 'focus';
  const type = typeName === 'attack' ? 0 : typeName === 'defense' ? 1 : 2;
  const base: Params = type === 0 ? dice(r, PROFILE.dice.attack) : type === 1 ? dice(r, PROFILE.dice.defense) : {};
  const t = pick(r, BY_TYPE_TRIGGERS[TYPES[type]]);
  const harm = r() < 0.5;
  const e = harm ? int(r, 0, HARM.length - 1) : HARM.length + int(r, 0, HELP.length - 1);
  // Harm lands on the foe's side, help on one's own: a trigger whose subject
  // is a foe can carry harm there, never help; a focus's own target is
  // whichever side its rider needs.
  const subjects = SUBJECTS.map((_, i) => i).filter(g => {
    if (SUBJECTS[g] === 'trigger') return type === 2 ? t === 5 : harm && FOE_SUBJECT.has(t);
    if (SUBJECTS[g] === 'self') return !harm;
    return true;
  });
  const g = pick(r, subjects);
  const effect = EFFECTS[e];
  const m = effect === 'wound' || effect === 'heal' ? int(r, 2, 6)
    : effect === 'bomb' || effect === 'charge' ? int(r, 3, 7)
      : effect === 'shell' ? int(r, 1, 3)
        : int(r, 2, 4);
  const counter = effect === 'counter' ? dice(r, PROFILE.dice.attack) : {};
  return {
    type, ...base, fast: r() < PROFILE.fast[typeName] ? 1 : 0, fatigue: r() < PROFILE.fatigueCostShare ? 1 : 0,
    t, e, g, m, d: int(r, 1, 3), priced: r() < PROFILE.pricedShare ? 1 : 0,
    ...(counter.n ? { cn: counter.n, cs: counter.s } : {}),
  };
}

/** Rounds before the card's effect has fully landed. */
export function composedHorizon(p: Params): number {
  const effect = EFFECTS[p.e];
  if (effect === 'wound' || effect === 'heal' || effect === 'counter') return 1;
  if (effect === 'stun' || effect === 'bomb' || effect === 'charge') return 2;
  return Math.max(2, p.d);
}

/** For the report: the card in words. */
export function describeComposed(p: Params): string {
  return `${['Atac', 'Defensa', 'Focus'][p.type]} · ${TRIGGERS[p.t]} → ${EFFECTS[p.e]} ${p.m} on ${SUBJECTS[p.g]}`;
}
