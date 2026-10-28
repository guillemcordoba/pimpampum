import {
  ActionDefinition, ActionType, Character, DiceRoll, EffectContext, EffectHandler, EngineApi, StatusBehavior,
  StatusEntry, StatusHookContext, random, skillLevelBonus,
} from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * ARTÍFEX — the tinkerer: no weapon, a bag of clockwork. Its cards leave
 * GADGETS on the table (CORDA N: a die at N, down 1 each time the gadget acts,
 * the card's own attack included; at 0 it stops; playing the card again winds
 * it back up). A gadget acting on its own rolls only the card's dice — not
 * the artificer's level, nor its fatigue, and it teaches nobody: it is not
 * the artificer's roll. Gadgets act at the end of the round unless the card
 * says when, and vanish when their maker falls.
 *
 * Every gadget is a status — on its maker when it stands beside the party (the
 * automaton, the top, the colossus), on whoever it is stuck in or aimed at
 * otherwise (the drill, the boa, the crossbow, the trap) — one per card per
 * maker: playing the card again moves or rewinds it, never adds a second.
 *
 * Concepts by the `card-designer`/`card-taste` loop, approved by the user;
 * the numbers are the approved design's.
 */

// --- Shared gadget machinery ------------------------------------------------

/** What one act of a gadget is worth to the search, per point of its dice's
 *  mean, in `positionValue` units (1.0 ≈ one body's whole health). Small on
 *  purpose (ARCHITECTURE: an over-priced status gets played to the exclusion
 *  of everything else): a 2d6 act is 0.07, well under the quarter of a body
 *  Esgrima's next-round statuses are priced at. */
const WORTH_PER_POINT = 0.01;

function worth(dice: DiceRoll | undefined, acts: number): number {
  return Math.max(0, acts) * WORTH_PER_POINT * (dice?.average() ?? 0);
}

function cardOf(entry: StatusEntry): ActionDefinition | undefined {
  return entry.data?.['card'] as ActionDefinition | undefined;
}

function makerOf(entry: StatusEntry): Character | undefined {
  const m = entry.data?.['maker'];
  return m instanceof Character ? m : undefined;
}

/** The gadget's maker still stands (a gadget held by its maker: the holder). */
function running(ref: { holder: Character; entry: StatusEntry }): boolean {
  return (makerOf(ref.entry) ?? ref.holder).isAlive();
}

/** The status key of `maker`'s gadget from `card` when it sits on someone
 *  else — unique per maker, so two artificers' drills never share a slot. */
function gadgetKey(engine: EngineApi, card: ActionDefinition, maker: Character): string {
  return `${card.id}#${maker.team}.${engine.rosterOf(maker).indexOf(maker)}`;
}

/** Take `maker`'s gadget from `card` off every member of `side`'s team
 *  (one per card per maker: a replay moves it). */
function pickUp(engine: EngineApi, card: ActionDefinition, maker: Character, side: Character): void {
  const key = gadgetKey(engine, card, maker);
  for (const c of engine.rosterOf(side)) c.clearStatus(key);
}

/** The card as a gadget's own defense: the same card, of no skill, so a
 *  contest its dice lose teaches nobody. */
const GADGET_CARDS = new WeakMap<ActionDefinition, ActionDefinition>();
function asGadget(card: ActionDefinition): ActionDefinition {
  let g = GADGET_CARDS.get(card);
  if (!g) GADGET_CARDS.set(card, g = { ...card, skillId: '' });
  return g;
}

function randomEnemy(engine: EngineApi, of: Character): Character | undefined {
  const pool = engine.enemiesOf(of);
  return pool.length ? pool[Math.floor(random() * pool.length)] : undefined;
}

/** A blow the gadget strikes by itself: the dice alone. */
function gadgetBlow(engine: EngineApi, maker: Character, target: Character, dice: DiceRoll, card: ActionDefinition,
  opts: { ignoreDefense?: boolean; ignoreArmor?: boolean } = {}) {
  return engine.performExtraAttack(maker, target, dice, { ...opts, rollBonus: card.rollBonus ?? 0, label: `«${card.name}» de ${maker.name}` });
}

/** Spend one turn of the key; at 0 the gadget stops (the status goes). */
function unwind(ctx: StatusHookContext): number {
  ctx.entry.value--;
  if (ctx.entry.value <= 0) {
    ctx.holder.clearStatus(ctx.key);
    const card = cardOf(ctx.entry);
    if (card) ctx.engine.log('info', `«${card.name}» s'atura.`, ctx.holder.team);
  }
  return ctx.entry.value;
}

// --- 1 · Bumerang -------------------------------------------------------------

/** Thrown this round: at its end it comes back onto a random enemy. */
const BUMERANG: StatusBehavior = {
  onRoundEnd(ctx) {
    ctx.holder.clearStatus(ctx.key);
    const card = cardOf(ctx.entry);
    if (!ctx.holder.isAlive() || !card?.dice) return;
    const e = randomEnemy(ctx.engine, ctx.holder);
    if (!e) return;
    ctx.engine.log('attack', `El bumerang torna cap a ${e.name}.`, ctx.holder.team);
    gadgetBlow(ctx.engine, ctx.holder, e, card.dice, card);
  },
};

// --- 2 · Parany de molla ------------------------------------------------------

/** At the holder's feet until the first enemy blow on it: that blow faces the
 *  trap (the card's dice + its maker's level), and the attacker loses
 *  `snap` PV whatever happens. */
const PARANY: StatusBehavior = {
  onTargeted(ctx, _attacker, blow) {
    const card = cardOf(ctx.entry);
    const maker = makerOf(ctx.entry);
    if (!card || !maker || !maker.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    if (ctx.entry.data!['sprung'] !== undefined) return;
    ctx.entry.data!['sprung'] = blow.id;
    const total = Math.max(0, ctx.engine.rollDiceFor(maker, card.dice, 'defense') + (card.rollBonus ?? 0)
      + skillLevelBonus(maker, card) + maker.getRollBonus(card.skillId, 'defense'));
    ctx.holder.guards.push({ defender: ctx.holder, action: asGadget(card), fixedTotal: total });
    ctx.engine.log('defense', `El parany de molla salta als peus de ${ctx.holder.name} (${total}).`, ctx.holder.team);
  },
  afterBlow(ctx, target, attacker, blow) {
    if (target !== ctx.holder || ctx.entry.data?.['sprung'] !== blow.id) return;
    const card = cardOf(ctx.entry);
    ctx.holder.clearStatus(ctx.key);
    if (card) ctx.holder.guards = ctx.holder.guards.filter(g => g.action !== asGadget(card));
    const snap = typeof ctx.entry.data?.['snap'] === 'number' ? ctx.entry.data['snap'] as number : 3;
    if (!attacker.isAlive()) return;
    ctx.engine.log('attack', `El parany mossega ${attacker.name}: perd ${snap} PV.`, ctx.holder.team);
    ctx.engine.applyPvLoss(attacker, snap, makerOf(ctx.entry));
  },
  onRoundEnd(ctx) { if (!running(ctx)) ctx.holder.clearStatus(ctx.key); },
  /** One defended blow and a few PV off its attacker, some round to come. */
  positionValue(ref) { return running(ref) ? 0.1 : 0; },
};

// --- 3 · Autòmat de corda -----------------------------------------------------

/** Walks beside its maker: at each round's end it attacks a random enemy. */
const AUTOMAT: StatusBehavior = {
  onRoundEnd(ctx) {
    const card = cardOf(ctx.entry);
    if (!ctx.holder.isAlive() || !card?.dice) { ctx.holder.clearStatus(ctx.key); return; }
    const e = randomEnemy(ctx.engine, ctx.holder);
    if (!e) return;
    gadgetBlow(ctx.engine, ctx.holder, e, card.dice, card);
    unwind(ctx);
  },
  positionValue(ref) { return worth(cardOf(ref.entry)?.dice, ref.entry.value); },
};

// --- 4 · Paraigua blindat -----------------------------------------------------

/** Open this round: against a blow on several of the party, it covers every
 *  one of them, joining whatever wall is there. Its guard on an ally is for
 *  that one blow. */
const PARAIGUA: StatusBehavior = {
  onAllyTargeted(ctx, target, attacker, blow) {
    const card = cardOf(ctx.entry);
    if (!card || !ctx.holder.isAlive()) return;
    const ours = new Set(blow.targets.filter(t => t.team === ctx.holder.team));
    if (ours.size < 2 || target.guards.some(g => g.defender === ctx.holder && g.action === card)) return;
    target.guards.push({ defender: ctx.holder, action: card });
    // A fresh array: a clone shares the payload's arrays (cloneState copies shallowly).
    ctx.entry.data!['covering'] = [...(ctx.entry.data!['covering'] as Character[]), target];
    ctx.engine.log('defense', `${ctx.holder.name} obre el paraigua sobre ${target.name}.`, ctx.holder.team);
  },
  afterBlow(ctx, target) {
    const covering = ctx.entry.data?.['covering'] as Character[] | undefined;
    const card = cardOf(ctx.entry);
    if (!covering || !card || !covering.includes(target)) return;
    ctx.entry.data!['covering'] = covering.filter(c => c !== target);
    const i = target.guards.findIndex(g => g.defender === ctx.holder && g.action === card);
    if (i >= 0) target.guards.splice(i, 1);
  },
};

// --- 5 · Ganxo salvavides -----------------------------------------------------

/** Ready this round: the first enemy blow on one of the holder's allies
 *  misses them — the hook has pulled them out. */
const GANXO: StatusBehavior = {
  onAllyTargeted(ctx, target, attacker) {
    ctx.holder.clearStatus(ctx.key);
    if (!ctx.holder.isAlive()) return;
    ctx.engine.log('defense', `${ctx.holder.name} estira ${target.name} amb el ganxo: l'atac de ${attacker.name} no l'impacta.`, ctx.holder.team);
    return true;
  },
};

// --- 6 · Ballesta sentinella --------------------------------------------------

/** Aimed at the holder: just before each of its cards resolves, a bolt. */
const BALLESTA: StatusBehavior = {
  beforeHolderAction(ctx) {
    const card = cardOf(ctx.entry);
    const maker = makerOf(ctx.entry);
    if (!card?.dice || !maker || !maker.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    ctx.engine.log('attack', `La ballesta sentinella dispara a ${ctx.holder.name}.`, maker.team);
    gadgetBlow(ctx.engine, maker, ctx.holder, card.dice, card);
    unwind(ctx);
  },
  onRoundEnd(ctx) { if (!running(ctx)) ctx.holder.clearStatus(ctx.key); },
  positionValue(ref) { return running(ref) ? -worth(cardOf(ref.entry)?.dice, ref.entry.value) : 0; },
};

// --- 7 · Trepant incansable ---------------------------------------------------

/** Stuck in the holder: at each round's end it wounds again — undefended,
 *  through the armour. */
const TREPANT: StatusBehavior = {
  onRoundEnd(ctx) {
    const card = cardOf(ctx.entry);
    const maker = makerOf(ctx.entry);
    if (!card?.dice || !maker || !maker.isAlive() || !ctx.holder.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    gadgetBlow(ctx.engine, maker, ctx.holder, card.dice, card, { ignoreDefense: true, ignoreArmor: true });
    unwind(ctx);
  },
  positionValue(ref) { return running(ref) ? -worth(cardOf(ref.entry)?.dice, ref.entry.value) : 0; },
};

// --- 8 · Baldufa de ganivets --------------------------------------------------

/** Spinning beside its maker: at each round's end it passes over every enemy
 *  again, one die for each turn of key it has left. */
const BALDUFA: StatusBehavior = {
  onRoundEnd(ctx) {
    const card = cardOf(ctx.entry);
    if (!ctx.holder.isAlive() || !card?.dice) { ctx.holder.clearStatus(ctx.key); return; }
    const enemies = ctx.engine.enemiesOf(ctx.holder);
    if (!enemies.length) return;
    const dice = d(ctx.entry.value, card.dice.sides);
    ctx.engine.log('attack', `La baldufa de ganivets torna a passar (${dice}).`, ctx.holder.team);
    ctx.engine.performAreaAttack(ctx.holder, enemies, dice, { rollBonus: card.rollBonus ?? 0, label: `«${card.name}» de ${ctx.holder.name}` });
    unwind(ctx);
  },
  positionValue(ref) {
    const card = cardOf(ref.entry);
    return card?.dice ? worth(d(ref.entry.value, card.dice.sides), ref.entry.value) : 0;
  },
};

// --- 9 · Colós de butxaca -----------------------------------------------------

/** The colossus stands before the party: every enemy blow on one of them
 *  meets its defense instead of theirs (an area blow, once), each spending a
 *  turn of key; a breach goes on to whoever was struck. When it stops, it
 *  falls on a random enemy. */
const COLOS: StatusBehavior = {
  guardsBlow(ctx, target, _attacker, blow) {
    const card = cardOf(ctx.entry);
    if (!card?.dice || !ctx.holder.isAlive()) return;
    const data = ctx.entry.data!;
    if (data['blow'] !== blow.id) {
      if (ctx.entry.value <= 0) return;
      ctx.entry.value--;
      data['blow'] = blow.id;
      data['total'] = card.dice.roll() + (card.rollBonus ?? 0);
      ctx.engine.log('defense', `El colós de butxaca es posa davant (${data['total'] as number}).`, ctx.holder.team);
    }
    return [{ defender: target, action: asGadget(card), fixedTotal: data['total'] as number }];
  },
  afterBlow(ctx, target, _attacker, blow) {
    if (ctx.entry.value > 0 || ctx.entry.data?.['blow'] !== blow.id) return;
    // An area blow is met once: the colossus falls after its last target.
    if (blow.targets[blow.targets.length - 1] !== target) return;
    fall(ctx);
  },
  onRoundEnd(ctx) {
    if (!ctx.holder.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    if (ctx.entry.value <= 0) fall(ctx);
  },
  positionValue(ref) { return worth(cardOf(ref.entry)?.dice, ref.entry.value); },
};

function fall(ctx: StatusHookContext): void {
  ctx.holder.clearStatus(ctx.key);
  const card = cardOf(ctx.entry);
  const e = randomEnemy(ctx.engine, ctx.holder);
  if (!card?.dice || !e || !ctx.holder.isAlive()) return;
  ctx.engine.log('attack', `El colós de butxaca s'atura i cau sobre ${e.name}.`, ctx.holder.team);
  gadgetBlow(ctx.engine, ctx.holder, e, card.dice, card);
}

// --- 10 · Boa mecànica --------------------------------------------------------

/** Coiled round the holder: it cannot defend, and at each round's end the
 *  boa squeezes with one die more than the last time, undefended. */
const BOA: StatusBehavior = {
  preventsGuard(ref) { return running(ref); },
  onRoundEnd(ctx) {
    const card = cardOf(ctx.entry);
    const maker = makerOf(ctx.entry);
    if (!card?.dice || !maker || !maker.isAlive() || !ctx.holder.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    const n = (ctx.entry.data!['dice'] as number) + 1;
    ctx.entry.data!['dice'] = n;
    gadgetBlow(ctx.engine, maker, ctx.holder, d(n, card.dice.sides), card, { ignoreDefense: true });
    unwind(ctx);
  },
  positionValue(ref) {
    const card = cardOf(ref.entry);
    if (!card?.dice || !running(ref)) return 0;
    return -worth(d((ref.entry.data?.['dice'] as number) + 1, card.dice.sides), ref.entry.value);
  },
};

// --- Placing gadgets -------------------------------------------------------------

/** The gadget beside its maker: wound to `corda`, replacing any earlier one. */
function wind(ctx: EffectContext, behavior: StatusBehavior, corda: number, data: Record<string, unknown> = {}): void {
  ctx.source.setStatus(ctx.action.id, corda, -1, { card: ctx.action, ...data }, behavior);
}

/** The gadget stuck in (or aimed at) `target`, taken off wherever it was. */
function attach(ctx: EffectContext, target: Character, behavior: StatusBehavior, corda: number, data: Record<string, unknown> = {}): void {
  pickUp(ctx.engine, ctx.action, ctx.source, target);
  target.setStatus(gadgetKey(ctx.engine, ctx.action, ctx.source), corda, -1,
    { card: ctx.action, maker: ctx.source, round: ctx.engine.round, ...data }, behavior);
}

/** An Atac gadget's card wound the target: it stays there with the rest of
 *  its key (its own attack spent one). */
function stickOnWound(behavior: StatusBehavior, extra: (ctx: EffectContext) => Record<string, unknown> = () => ({})) {
  return (ctx: EffectContext): void => {
    const t = ctx.target;
    if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
    attach(ctx, t, behavior, num(ctx.params, 'corda', 3) - 1, { harm: 1, ...extra(ctx) });
    ctx.engine.log('attack', `«${ctx.action.name}» s'hi queda: ${t.name}.`, ctx.source.team);
  };
}

/** A replayed Atac gadget that did not stick this time: the old one is
 *  picked up all the same — it is the card that was thrown again. */
function dropStale(ctx: EffectContext): void {
  const key = gadgetKey(ctx.engine, ctx.action, ctx.source);
  for (const t of ctx.targets) {
    for (const c of ctx.engine.rosterOf(t)) {
      const e = c.getStatus(key);
      if (e && e.data?.['round'] !== ctx.engine.round) c.clearStatus(key);
    }
  }
}

function hasGadget(actor: Character, card: ActionDefinition, atLeast: number): boolean {
  return actor.getStatusValue(card.id, 0) >= atLeast;
}

const ARTIFEX_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Bumerang: at the round's end it comes back onto a random enemy.
  boomerang: {
    onAttackResolved(ctx) {
      if (ctx.source.isAlive()) ctx.source.setStatus(`${ctx.action.id}-torna`, 1, 1, { card: ctx.action }, BUMERANG);
    },
    aiWeight() { return 0.4; },
  },

  // 2 · Parany de molla: at an ally's feet until it is attacked. It takes the
  // place of the card's guard on that ally; the maker still guards itself.
  spring_trap: {
    getTargetRequirement() { return 'ally_other'; },
    onResolve(ctx) {
      const ally = ctx.targets.find(t => t !== ctx.source && t.team === ctx.source.team && t.isAlive());
      if (!ally) return;
      ally.guards = ally.guards.filter(g => !(g.defender === ctx.source && g.action === ctx.action));
      for (const c of ctx.engine.rosterOf(ctx.source)) c.clearStatus(gadgetKey(ctx.engine, ctx.action, ctx.source));
      ally.setStatus(gadgetKey(ctx.engine, ctx.action, ctx.source), 1, -1,
        { card: ctx.action, maker: ctx.source, snap: num(ctx.params, 'snap', 3) }, PARANY);
      ctx.engine.log('defense', `${ctx.source.name} para un parany de molla als peus de ${ally.name}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length ? 0.4 : 0; },
  },

  // 3 · Autòmat de corda: wound to `corda`; at each round's end it attacks.
  clockwork_automaton: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      wind(ctx, AUTOMAT, num(ctx.params, 'corda', 3));
      ctx.engine.log('focus', `${ctx.source.name} dona corda a l'autòmat.`, ctx.source.team);
    },
    aiWeight(ctx) { return hasGadget(ctx.actor, ctx.action, 2) ? 0.1 : 0.6; },
  },

  // 4 · Paraigua blindat: a guard like any other, and this round, against a
  // blow on several of the party, a guard on each of them.
  armoured_umbrella: {
    onResolve(ctx) {
      ctx.source.setStatus(ctx.action.id, 1, 1, { card: ctx.action, covering: [] }, PARAIGUA);
    },
    aiWeight(ctx) { return ctx.allies.length && ctx.enemies.length ? 0.4 : 0.1; },
  },

  // 5 · Ganxo salvavides: the first blow this round on an ally misses them.
  lifeline_hook: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      ctx.source.setStatus(ctx.action.id, 1, 1, { card: ctx.action }, GANXO);
    },
    aiWeight(ctx) { return ctx.allies.length ? 0.5 : 0; },
  },

  // 6 · Ballesta sentinella: aimed at an enemy, wound to `corda`; shoots it
  // just before each of its cards.
  sentry_crossbow: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      attach(ctx, t, BALLESTA, num(ctx.params, 'corda', 3), { harm: 1 });
      ctx.engine.log('focus', `${ctx.source.name} apunta la ballesta sentinella a ${t.name}.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length ? 0.5 : 0; },
  },

  // 7 · Trepant incansable: ignores armour; if it wounds it sticks, and
  // wounds again at each round's end, undefended, through the armour.
  tireless_drill: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.ignoreArmor = true; },
    onAttackHit: stickOnWound(TREPANT),
    onAttackResolved: dropStale,
    aiWeight() { return 0.5; },
  },

  // 8 · Baldufa de ganivets: every enemy; the top keeps spinning with the
  // rest of its key, one die less each round's end.
  knife_top: {
    onAttackResolved(ctx) {
      if (ctx.source.isAlive()) wind(ctx, BALDUFA, num(ctx.params, 'corda', 3) - 1);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.8 : 0.2; },
  },

  // 9 · Colós de butxaca: wound to `corda`, it stands before the party.
  pocket_colossus: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      wind(ctx, COLOS, num(ctx.params, 'corda', 3));
      ctx.engine.log('defense', `${ctx.source.name} dona corda al colós de butxaca.`, ctx.source.team);
    },
    aiWeight(ctx) { return hasGadget(ctx.actor, ctx.action, 2) ? 0.1 : 0.6; },
  },

  // 10 · Boa mecànica: if it wounds it coils there: the target cannot defend,
  // and at each round's end the boa squeezes with one die more.
  mechanical_boa: {
    onAttackHit: stickOnWound(BOA, ctx => ({ dice: ctx.action.dice?.numDice ?? 0 })),
    onAttackResolved: dropStale,
    aiWeight() { return 0.6; },
  },
};

export const ARTIFEX: SkillDefinition = {
  id: 'artifex', displayName: 'Artífex', classCss: 'artifex', category: 'player',
  description: "Corda N: la carta es queda a la taula amb un dau a N. Cada cop que el giny actua (amb els daus de la carta, sense el teu nivell), el dau baixa 1, també amb l'atac que fa en jugar-la, si és un Atac; a 0, s'atura. Tornar-la a jugar li torna la corda. Els ginys actuen al final del torn, tret que la carta digui quan.",
  iconPath: ICON_PREFIX + 'lorc/clockwork.svg',
  actions: [
    action({
      id: 'bumerang', name: 'Bumerang', skillId: 'artifex',
      unlock: 1, type: ActionType.Atac, dice: d(1, 6),
      effects: [{ type: 'boomerang' }],
      desc: "Al final del torn torna i ataca un enemic a l'atzar.",
      icon: 'delapouite/boomerang.svg',
    }),
    action({
      id: 'parany-de-molla', name: 'Parany de molla', skillId: 'artifex',
      unlock: 2, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'spring_trap', params: { snap: 3 } }],
      desc: "Queda als peus d'un aliat fins que l'ataquin: defensa aquell atac i l'atacant perd 3 PV.",
      icon: 'lorc/wolf-trap.svg',
    }),
    action({
      id: 'automat-de-corda', name: 'Autòmat de corda', skillId: 'artifex',
      unlock: 3, type: ActionType.Focus, dice: d(2, 6),
      effects: [{ type: 'clockwork_automaton', params: { corda: 3 } }],
      desc: "Corda 3: al final de cada torn ataca un enemic a l'atzar.",
      icon: 'delapouite/mono-wheel-robot.svg',
    }),
    action({
      id: 'paraigua-blindat', name: 'Paraigua blindat', skillId: 'artifex',
      unlock: 4, type: ActionType.Defensa, dice: d(2, 6),
      effects: [{ type: 'armoured_umbrella' }],
      desc: "Contra els atacs que afecten més d'un de vosaltres, defensa tot el grup.",
      icon: 'lorc/umbrella.svg',
    }),
    action({
      id: 'ganxo-salvavides', name: 'Ganxo salvavides', skillId: 'artifex',
      unlock: 5, type: ActionType.Defensa, dice: d(2, 6),
      effects: [{ type: 'lifeline_hook' }],
      desc: "El primer atac contra un aliat aquest torn no l'impacta.",
      icon: 'delapouite/pulley-hook.svg',
    }),
    action({
      id: 'ballesta-sentinella', name: 'Ballesta sentinella', skillId: 'artifex',
      unlock: 6, type: ActionType.Focus, dice: d(1, 8),
      effects: [{ type: 'sentry_crossbow', params: { corda: 3 } }],
      desc: 'Apunta un enemic. Corda 3: li dispara just abans que es resolgui cada carta seva.',
      icon: 'carl-olsen/crossbow.svg',
    }),
    action({
      id: 'trepant-incansable', name: 'Trepant incansable', skillId: 'artifex',
      unlock: 7, type: ActionType.Atac, dice: d(2, 6),
      effects: [{ type: 'tireless_drill', params: { corda: 3 } }],
      desc: "Ignora l'armadura. Si fereix, s'hi queda clavat. Corda 3: al final de cada torn el torna a ferir, sense defensa.",
      icon: 'lorc/drill.svg',
    }),
    action({
      id: 'baldufa-de-ganivets', name: 'Baldufa de ganivets', skillId: 'artifex',
      unlock: 8, type: ActionType.Atac, dice: d(3, 6), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'knife_top', params: { corda: 3 } }],
      desc: 'Puges 1 nivell de fatiga. Afecta tots els enemics. Corda 3: torna a passar al final de cada torn, amb un dau menys cada cop.',
      icon: 'skoll/spinning-top.svg',
    }),
    action({
      id: 'colos-de-butxaca', name: 'Colós de butxaca', skillId: 'artifex',
      unlock: 9, type: ActionType.Defensa, dice: d(3, 6),
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'pocket_colossus', params: { corda: 3 } }],
      desc: 'Puges 2 nivells de fatiga. Corda 3: els atacs contra vosaltres es resolen contra la seva defensa. Quan s\'atura, cau sobre un enemic a l\'atzar.',
      icon: 'delapouite/metal-golem-head.svg',
    }),
    action({
      id: 'boa-mecanica', name: 'Boa mecànica', skillId: 'artifex',
      unlock: 10, type: ActionType.Atac, dice: d(3, 4),
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'mechanical_boa', params: { corda: 4 } }],
      desc: "Puges 2 nivells de fatiga. Si fereix, s'hi enrosca. Corda 4: mentre l'estreny no es pot defensar, i al final de cada torn l'ataca amb un dau més.",
      icon: 'delapouite/snake-spiral.svg',
    }),
  ],
  effects: ARTIFEX_EFFECTS,
};
