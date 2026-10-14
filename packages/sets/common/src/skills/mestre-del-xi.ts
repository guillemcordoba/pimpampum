import { ActionType, Character, DiceRoll, EffectContext, EffectHandler, EngineApi, StatusBehavior, StatusHookContext } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { diceParam, num, str } from '../effects/helpers.js';

/**
 * MESTRE DEL XI — kappo and sappo, "cure or kill": the same points switch a
 * body off or back on. Everything that moves has points, a golem's joints as
 * much as a devil's bones, and what goes dead is a part of the body, never a
 * named card. The kit numbs (ENTUMIT: the holder's damage is halved until the
 * end of the next round), switches a card's power off, locks two bodies in one
 * hold, seals a wound and raises the fallen — and closes on its thesis: raise
 * (8), kill (9), sleep (10).
 *
 * Concepts by the `card-designer` / `card-taste` loop, approved by the user;
 * the dice are provisional design numbers. Toc de la mort's rule is still an
 * experiment: its handler takes the `variant` (TOC_DE_LA_MORT_VARIANTS).
 */

/** A status set in round R that acts only from round R+1 on. */
function fromRound(data: Record<string, unknown> | undefined): number {
  const r = data?.['fromRound'];
  return typeof r === 'number' ? r : 0;
}

function roundOf(data: Record<string, unknown> | undefined): number {
  const r = data?.['round'];
  return typeof r === 'number' ? r : 0;
}

function byOf(data: Record<string, unknown> | undefined): Character | undefined {
  const by = data?.['by'];
  return by instanceof Character ? by : undefined;
}

// --- Entumit (cards 1, 2, 6, 7) ----------------------------------------------

const ENTUMIT_KEY = 'entumit';

/** Numb: the damage the holder does is halved, rounded down. Set for two
 *  turns, so it lasts to the end of the round after the one it was set in;
 *  setting it again renews it rather than stacking. */
const ENTUMIT: StatusBehavior = {
  modifyOutgoingDamage(_ctx, damage) { return Math.floor(damage / 2); },
  /** Half the blows of a round and a half: real, and well short of a body.
   *  A little above a terra's −0.1 (+2 on blows against it), since halving
   *  is worth more than two points on most blows. */
  positionValue() { return -0.15; },
};

/** Numb `c` (or renew it). */
function numb(engine: EngineApi, c: Character | undefined, team: number): void {
  if (!c || !c.isAlive()) return;
  c.setStatus(ENTUMIT_KEY, 1, 2, { harm: 1 }, ENTUMIT);
  engine.log('attack', `${c.name} queda entumit: fins al final del torn següent, fa la meitat de dany.`, team);
}

// --- 4 · Poder apagat --------------------------------------------------------

/** Next round the holder's card resolves plain: only its dice count. */
const APAGAT: StatusBehavior = {
  plainCards(ctx) { return ctx.engine.round >= fromRound(ctx.entry.data); },
  /** One card stripped to its dice, next round: worth nothing against a
   *  creature whose cards are plain anyway, a lot against a caster. Priced
   *  low, like Esgrima's next-round statuses were at first (§44.2). */
  positionValue() { return -0.1; },
};

// --- 5 · Bloqueig mutu -------------------------------------------------------

/** Locked in the hold: the holder plays no card next round. Both the master
 *  and the enemy carry it. */
const BLOQUEIG_MUTU: StatusBehavior = {
  skipsRound(ctx) { return ctx.engine.round >= fromRound(ctx.entry.data); },
  /** A lost turn, priced like Braç mort's (−0.25, NEXT-STEPS §44.2). The
   *  evaluator averages statuses per body, so the same price on both sides
   *  already says the trade is good against a lone boss and poor against one
   *  goblin of five. */
  positionValue() { return -0.25; },
};

// --- 6 · Ràfega de dits ------------------------------------------------------

/** The first jab of a flurry wounded its target (this round). */
const RAFEGA_KEY = 'rafega-de-dits-ferida';

// --- 9 · Toc de la mort ------------------------------------------------------

/**
 * The rule variants of Toc de la mort being measured (NEXT-STEPS §47). Every
 * variant fires when the touch wounds (no fatigue since §48); the card's handler
 * reads `params.variant`, and the card's text must be the variant's.
 */
export const TOC_DE_LA_MORT_VARIANTS = {
  'mig-pv': "Si fereix, al final del torn següent cau si li queda menys de la meitat dels seus PV inicials.",
  'resso': "Si fereix, al final del torn següent torna a perdre tots els PV que hagi perdut des del toc.",
  'cop-retardat': "Si fereix, al final del torn següent rep 4d6 que no es poden defensar.",
  'cinc-passes': "Si fereix, cau quan hagi jugat tres cartes més.",
  'tres-tocs': "Si fereix, li deixes un toc; al tercer, cau. Si passa un torn sense rebre'n cap, els perd tots.",
  'cor-ferit': "Si fereix, al final del torn següent perd 3 PV per cada cop que l'hagi ferit des del toc.",
} as const;
export type TocVariant = keyof typeof TOC_DE_LA_MORT_VARIANTS;
export const DEFAULT_TOC_VARIANT: TocVariant = 'resso';

const TOC_KEY = 'toc-de-la-mort';

/** What a pending loss of `pv` is worth to its holder, conservatively: half
 *  the share of its health it would take. */
function pendingLossPrice(holder: Character, pv: number): number {
  if (pv <= 0 || holder.maxPV <= 0) return 0;
  return -0.5 * Math.min(pv, holder.currentPV) / holder.maxPV;
}

/** The holder falls (to 0 PV, through the clamps like any loss). */
function fall(ctx: StatusHookContext, why: string): void {
  const h = ctx.holder;
  if (!h.isAlive()) return;
  ctx.engine.log('attack', `${why}: ${h.name} cau.`, byOf(ctx.entry.data)?.team);
  ctx.engine.applyPvLoss(h, h.currentPV, byOf(ctx.entry.data));
}

/** True at the end of the round after the one the touch was set in. */
function due(ctx: StatusHookContext): boolean {
  return ctx.engine.round > roundOf(ctx.entry.data);
}

/** V0 · at the end of next round it falls if under half its starting PV. */
const TOC_MIG_PV: StatusBehavior = {
  onRoundEnd(ctx) {
    if (!due(ctx)) return;
    ctx.holder.clearStatus(ctx.key);
    if (ctx.holder.isAlive() && ctx.holder.currentPV * 2 < ctx.holder.maxPV) fall(ctx, 'El toc de la mort');
  },
  positionValue(ref) {
    const h = ref.holder;
    return h.currentPV * 2 < h.maxPV ? pendingLossPrice(h, h.currentPV) : -0.05;
  },
};

/** V1 · Ressò: at the end of next round it loses again every PV it lost since
 *  the touch (`value` counts them). */
const TOC_RESSO: StatusBehavior = {
  onPvLost(ctx, amount) { ctx.entry.value += amount; },
  onRoundEnd(ctx) {
    if (!due(ctx)) return;
    const echo = ctx.entry.value;
    ctx.holder.clearStatus(ctx.key);
    if (!ctx.holder.isAlive() || echo <= 0) return;
    ctx.engine.log('attack', `El toc de la mort ressona: ${ctx.holder.name} torna a perdre ${echo} PV.`, byOf(ctx.entry.data)?.team);
    ctx.engine.applyPvLoss(ctx.holder, echo, byOf(ctx.entry.data));
  },
  /** The echo lands after the round the search plays, so its base `price`
   *  (a card param, which the bench cache fingerprints) is the only way the
   *  search sees a fresh touch (NEXT-STEPS §48.1). */
  positionValue(ref) { return pendingLossPrice(ref.holder, ref.entry.value) - num(ref.entry.data ?? {}, 'price', 0.05); },
};

/** V2 · Cop retardat: at the end of next round it takes the dice (4d6) —
 *  nobody can defend it; its armour counts, as against any undefended blow. */
const TOC_RETARDAT: StatusBehavior = {
  onRoundEnd(ctx) {
    if (!due(ctx)) return;
    const dice = ctx.entry.data?.['dice'];
    ctx.holder.clearStatus(ctx.key);
    if (!ctx.holder.isAlive() || !(dice instanceof DiceRoll)) return;
    const roll = dice.roll();
    const armour = ctx.holder.getPassiveArmor();
    const dmg = Math.max(0, roll - armour);
    ctx.engine.log('attack', `El toc de la mort arriba: ${ctx.holder.name} rep ${roll}${armour ? `−${armour} armadura` : ''} = ${dmg} dany.`, byOf(ctx.entry.data)?.team);
    ctx.engine.applyPvLoss(ctx.holder, dmg, byOf(ctx.entry.data));
  },
  positionValue(ref) {
    const dice = ref.entry.data?.['dice'];
    const mean = dice instanceof DiceRoll ? dice.average() : 0;
    return pendingLossPrice(ref.holder, mean - ref.holder.getPassiveArmor());
  },
};

/** V3 · Cinc passes: it falls once it has played `cards` more cards — cards
 *  that resolved, counted from the round after the touch (the combat history
 *  holds only those: a lost or cancelled card does not count). Checked at
 *  each round's end. */
const TOC_PASSES: StatusBehavior = {
  onRoundEnd(ctx) {
    const since = roundOf(ctx.entry.data);
    const played = ctx.engine.history.filter(ev => ev.actor === ctx.holder && ev.round > since).length;
    ctx.entry.value = played;
    const cards = num(ctx.entry.data ?? {}, 'cards', 3);
    if (played < cards) return;
    ctx.holder.clearStatus(ctx.key);
    fall(ctx, `Cinc passes: ${ctx.holder.name} ja ha jugat ${cards} cartes`);
  },
  /** A death on a clock that the fight may outrun: a modest base, rising with
   *  each card it has played. */
  positionValue(ref) { return ref.holder.isAlive() ? -(0.15 + 0.1 * ref.entry.value) : 0; },
};

/** V4 · Tres tocs: `value` touches; the third fells it, and a round without a
 *  touch clears them all. */
const TOC_TRES: StatusBehavior = {
  onRoundEnd(ctx) {
    if (ctx.engine.round > roundOf(ctx.entry.data)) {
      ctx.holder.clearStatus(ctx.key);
      ctx.engine.log('info', `${ctx.holder.name} es refà: perd els tocs de la mort.`, ctx.holder.team);
    }
  },
  positionValue(ref) { return -0.1 * ref.entry.value; },
};

/** V5 · Cor ferit: at the end of next round it loses `per` PV per wound taken
 *  since the touch (`value` counts them). */
const TOC_COR: StatusBehavior = {
  onPvLost(ctx) { ctx.entry.value += 1; },
  onRoundEnd(ctx) {
    if (!due(ctx)) return;
    const loss = ctx.entry.value * num(ctx.entry.data ?? {}, 'per', 3);
    ctx.holder.clearStatus(ctx.key);
    if (!ctx.holder.isAlive() || loss <= 0) return;
    ctx.engine.log('attack', `El cor ferit: ${ctx.holder.name} perd ${loss} PV.`, byOf(ctx.entry.data)?.team);
    ctx.engine.applyPvLoss(ctx.holder, loss, byOf(ctx.entry.data));
  },
  positionValue(ref) {
    return pendingLossPrice(ref.holder, ref.entry.value * num(ref.entry.data ?? {}, 'per', 3)) - 0.05;
  },
};

/** Leave the touch of the given variant on `t`, whom the touch just wounded. */
function touch(ctx: EffectContext, t: Character, variant: TocVariant): void {
  const round = ctx.engine.round;
  const by = ctx.source;
  const team = by.team;
  switch (variant) {
    case 'mig-pv':
      t.setStatus(TOC_KEY, 1, 2, { round, by, harm: 1 }, TOC_MIG_PV);
      ctx.engine.log('attack', `${by.name} toca ${t.name}: al final del torn següent cau si li queda menys de la meitat dels PV.`, team);
      return;
    case 'resso':
      t.setStatus(TOC_KEY, 0, 2, { round, by, price: num(ctx.params, 'price', 0.05), harm: 1 }, TOC_RESSO);
      ctx.engine.log('attack', `${by.name} toca ${t.name}: al final del torn següent tornarà a perdre el que perdi fins llavors.`, team);
      return;
    case 'cop-retardat':
      t.setStatus(TOC_KEY, 1, 2, { round, by, dice: diceParam(ctx.params, 'dice') ?? d(4, 6), harm: 1 }, TOC_RETARDAT);
      ctx.engine.log('attack', `${by.name} toca ${t.name}: al final del torn següent rebrà el cop.`, team);
      return;
    case 'cinc-passes':
      t.setStatus(TOC_KEY, 0, -1, { round, by, cards: num(ctx.params, 'cards', 3), harm: 1 }, TOC_PASSES);
      ctx.engine.log('attack', `${by.name} toca ${t.name}: caurà quan hagi jugat tres cartes més.`, team);
      return;
    case 'tres-tocs': {
      const touches = t.getStatus(TOC_KEY)?.behavior === TOC_TRES ? t.getStatusValue(TOC_KEY) + 1 : 1;
      const needed = num(ctx.params, 'touches', 3);
      if (touches >= needed) {
        t.clearStatus(TOC_KEY);
        ctx.engine.log('attack', `${by.name} deixa el toc número ${touches} a ${t.name}.`, team);
        ctx.engine.applyPvLoss(t, t.currentPV, by);
        return;
      }
      t.setStatus(TOC_KEY, touches, -1, { round, by, harm: 1 }, TOC_TRES);
      ctx.engine.log('attack', `${by.name} deixa un toc a ${t.name} (${touches}/${needed}).`, team);
      return;
    }
    case 'cor-ferit':
      t.setStatus(TOC_KEY, 0, 2, { round, by, per: num(ctx.params, 'per', 3), harm: 1 }, TOC_COR);
      ctx.engine.log('attack', `${by.name} toca ${t.name}: al final del torn següent, cada ferida li costarà més.`, team);
      return;
  }
}

function tocVariant(params: Record<string, unknown>): TocVariant {
  const v = str(params, 'variant', DEFAULT_TOC_VARIANT);
  if (!(v in TOC_DE_LA_MORT_VARIANTS)) throw new Error(`Toc de la mort: unknown variant '${v}'`);
  return v as TocVariant;
}

// --- 10 · Tempesta de son ----------------------------------------------------

/** Asleep from the round after the storm: no card until it loses PV, or rolls
 *  `wake`+ on a d20 as a round begins. */
const ADORMIT: StatusBehavior = {
  skipsRound(ctx) { return ctx.engine.round >= fromRound(ctx.entry.data); },
  onRoundStart(ctx) {
    if (ctx.engine.round < fromRound(ctx.entry.data)) return;
    const roll = ctx.engine.rollDie(20);
    const wake = num(ctx.entry.data ?? {}, 'wake', 11);
    if (roll >= wake) {
      ctx.holder.clearStatus(ctx.key);
      ctx.engine.log('info', `${ctx.holder.name} treu un ${roll} i es desperta.`, ctx.holder.team);
    } else {
      ctx.engine.log('info', `${ctx.holder.name} treu un ${roll} i continua dormint.`, ctx.holder.team);
    }
  },
  onPvLost(ctx) {
    if (ctx.engine.round < fromRound(ctx.entry.data)) return;
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('info', `${ctx.holder.name} es desperta del cop.`, ctx.holder.team);
  },
  /** About one lost turn on average (a coin each round, or a blow): priced
   *  like the mutual block's lost turn. */
  positionValue() { return -0.25; },
};

const XI_EFFECTS: Record<string, EffectHandler> = {
  // 1 · Cop al nervi, 7 · Tocs en cadena: whoever a wound lands on is numb.
  numbing_strike: {
    onAttackHit(ctx) {
      if ((ctx.damageDealt ?? 0) > 0) numb(ctx.engine, ctx.target, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.action.targetCount && ctx.action.targetCount > 1 && ctx.enemies.length > 1 ? 0.5 : 0.3; },
  },

  // 2 · Pinça entumidora: block an enemy; every attacker it holds against is
  // numb.
  numbing_pinch: {
    getTargetRequirement() { return 'enemy'; },
    onDefend(ctx) { numb(ctx.engine, ctx.target, ctx.source.team); },
    aiWeight() { return 0.4; },
  },

  // 3 · Segellar la ferida: a standing ally, or you, recovers the PV its last
  // wound took.
  seal_wound: {
    getTargetRequirement() { return 'ally'; },
    onResolve(ctx) {
      const t = ctx.targets.find(c => c.isAlive());
      if (!t) return;
      if (t.lastWound <= 0 || t.currentPV >= t.maxPV) {
        ctx.engine.log('focus', `${ctx.source.name} segella la ferida de ${t.name}, però no hi ha res a tancar.`, ctx.source.team);
        return;
      }
      ctx.engine.log('focus', `${ctx.source.name} segella l'última ferida de ${t.name} (${t.lastWound} PV).`, ctx.source.team);
      ctx.engine.heal(t, t.lastWound);
    },
    aiWeight(ctx) {
      const hurt = [ctx.actor, ...ctx.allies].some(c => c.currentPV < c.maxPV && c.lastWound > 0);
      return hurt ? 0.6 : 0;
    },
    // The seal is worth the wound it closes, not how low the ally stands.
    aiTargetPriority(_ctx, c) {
      return c.lastWound > 0 ? Math.min(c.lastWound, c.maxPV - c.currentPV) : 0;
    },
  },

  // 4 · Poder apagat: a wound means next round its card has no effect — only
  // its dice.
  power_off: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      t.setStatus('poder-apagat', 1, 2, { fromRound: ctx.engine.round + 1, harm: 1 }, APAGAT);
      ctx.engine.log('attack', `${ctx.source.name} apaga el poder de ${t.name}: el torn següent, la seva carta només té daus.`, ctx.source.team);
    },
    aiWeight() { return 0.4; },
  },

  // 5 · Bloqueig mutu: block an enemy; if it holds against that enemy's blow,
  // next round neither of you plays a card (no Cop desesperat either).
  mutual_block: {
    getTargetRequirement() { return 'enemy'; },
    onDefend(ctx) {
      const t = ctx.target;
      const me = ctx.source;
      if (!t || !t.isAlive() || !me.isAlive()) return;
      if (!t.blockers.some(g => g.defender === me && g.action === ctx.action)) return;
      for (const c of [me, t]) c.setStatus('bloqueig-mutu', 1, 2, { fromRound: ctx.engine.round + 1, harm: 1 }, BLOQUEIG_MUTU);
      ctx.engine.log('defense', `${me.name} i ${t.name} queden travats: el torn següent cap dels dos juga carta.`, me.team);
    },
    aiWeight() { return 0.3; },
  },

  // 6 · Ràfega de dits: three attacks on the target, each its own roll (the
  // card's dice + the level). Two wounds on it numb it; three cancel its
  // action this round, if it has not resolved yet.
  finger_flurry: {
    onAttackHit(ctx) {
      if ((ctx.damageDealt ?? 0) > 0 && ctx.target === ctx.targets[0]) {
        ctx.source.setStatus(RAFEGA_KEY, 1, 1, { round: ctx.engine.round });
      }
    },
    onAttackResolved(ctx) {
      const first = ctx.source.getStatus(RAFEGA_KEY);
      ctx.source.clearStatus(RAFEGA_KEY);
      const target = ctx.targets[0];
      const dice = ctx.action.dice;
      if (!target || !dice) return;
      let wounds = first && roundOf(first.data) === ctx.engine.round ? 1 : 0;
      const skillId = ctx.action.skillId;
      const rollBonus = (ctx.action.rollBonus ?? 0) + ctx.source.getSkillLevel(skillId);
      const blows = num(ctx.params, 'blows', 3);
      for (let blow = 2; blow <= blows; blow++) {
        if (!target.isAlive() || !ctx.source.isAlive()) break;
        const r = ctx.engine.performExtraAttack(ctx.source, target, dice, {
          skillId, rollBonus, label: `${ctx.source.name} «${ctx.action.name}» (${blow})`,
        });
        if (r.damage > 0 && r.recipient === target) wounds++;
      }
      if (!target.isAlive()) return;
      if (wounds >= 2) numb(ctx.engine, target, ctx.source.team);
      if (wounds >= blows && ctx.engine.cancelPendingAction(target)) {
        ctx.engine.log('attack', `Tres ferides: l'acció de ${target.name} d'aquest torn no es resol.`, ctx.source.team);
      }
    },
    aiWeight() { return 0.4; },
  },

  // 8 · Cop de vida: a fallen ally rises with half its starting PV (rounded
  // down, at least 1) and goes up `fatigue` levels.
  life_strike: {
    getTargetRequirement() { return 'fallen_ally'; },
    onResolve(ctx) {
      const t = ctx.targets.find(c => !c.isAlive() && c.team === ctx.source.team);
      if (!t) return;
      ctx.engine.log('focus', `${ctx.source.name} colpeja el pit de ${t.name}, que s'aixeca.`, ctx.source.team);
      ctx.engine.heal(t, Math.max(1, Math.floor(t.maxPV / 2)));
      t.setFatigue(t.fatigue + num(ctx.params, 'fatigue', 1));
    },
    aiWeight() { return 0.3; },
  },

  // 9 · Toc de la mort: when it wounds, the touch of the card's `variant`
  // (TOC_DE_LA_MORT_VARIANTS) stays on whoever it wounded.
  death_touch: {
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0) return;
      touch(ctx, t, tocVariant(ctx.params));
    },
    aiWeight() { return 0.5; },
  },

  // 10 · Tempesta de son: a blow that hurts nobody; whoever it beats falls
  // asleep at the end of the round (ADORMIT).
  sleep_storm: {
    modifyAttack(ctx) { if (ctx.attackMods) ctx.attackMods.damageMult = 0; },
    onAttackHit(ctx) {
      const t = ctx.target;
      if (!t || !t.isAlive()) return;
      t.setStatus('adormit', 1, -1, { fromRound: ctx.engine.round + 1, wake: num(ctx.params, 'wake', 11), harm: 1 }, ADORMIT);
      ctx.engine.log('attack', `${t.name} s'adormirà al final del torn.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 0.6 : 0.2; },
  },
};

export const MESTRE_DEL_XI: SkillDefinition = {
  id: 'mestre-del-xi', displayName: 'Mestre del xi', classCss: 'mestre-xi', category: 'player',
  description: 'Els punts del cos: els mateixos dits que l\'apaguen el tornen a encendre.',
  iconPath: ICON_PREFIX + 'lorc/meditation.svg',
  actions: [
    action({
      id: 'cop-al-nervi', name: 'Cop al nervi', skillId: 'mestre-del-xi',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(2, 4),
      effects: [{ type: 'numbing_strike' }],
      desc: "Si fereix, l'objectiu queda entumit.",
      icon: 'lorc/pointing.svg',
    }),
    action({
      id: 'pinca-entumidora', name: 'Pinça entumidora', skillId: 'mestre-del-xi',
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(3, 4),
      effects: [{ type: 'numbing_pinch' }],
      desc: "Bloqueja un enemic. Si aguanta, l'atacant queda entumit.",
      icon: 'lorc/grab.svg',
    }),
    action({
      id: 'segellar-la-ferida', name: 'Segellar la ferida', skillId: 'mestre-del-xi',
      unlock: 3, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'seal_wound' }],
      desc: "Cura un aliat dret, o tu, tants PV com li va treure l'últim cop que l'ha ferit.",
      icon: 'delapouite/hand-bandage.svg',
    }),
    action({
      id: 'poder-apagat', name: 'Poder apagat', skillId: 'mestre-del-xi',
      unlock: 4, type: ActionType.Atac, speed: 2, dice: d(2, 6),
      effects: [{ type: 'power_off' }],
      desc: 'Si fereix, el torn següent la seva carta no té cap efecte: només en compten els daus.',
      icon: 'sbed/unplugged.svg',
    }),
    action({
      id: 'bloqueig-mutu', name: 'Bloqueig mutu', skillId: 'mestre-del-xi',
      unlock: 5, type: ActionType.Defensa, speed: 2, dice: d(2, 8),
      effects: [{ type: 'mutual_block' }],
      desc: 'Bloqueja un enemic. Si aguanta, el torn següent cap dels dos juga carta.',
      icon: 'lorc/handcuffs.svg',
    }),
    action({
      id: 'rafega-de-dits', name: 'Ràfega de dits', skillId: 'mestre-del-xi',
      unlock: 6, type: ActionType.Atac, speed: 1, dice: d(1, 6),
      effects: [{ type: 'fatigue_cost', params: { levels: 1 } }, { type: 'finger_flurry', params: { blows: 3 } }],
      desc: "Puges 1 nivell de fatiga. Tres atacs a l'objectiu. Si en fereixen dos, queda entumit; si en fereixen tres, la seva acció d'aquest torn no es resol.",
      icon: 'lorc/lightning-trio.svg',
    }),
    action({
      id: 'tocs-en-cadena', name: 'Tocs en cadena', skillId: 'mestre-del-xi',
      unlock: 7, type: ActionType.Atac, speed: 1, dice: d(2, 6), targetCount: 3,
      effects: [{ type: 'numbing_strike' }],
      desc: 'Fins a tres enemics, la mateixa tirada; els que fereix queden entumits.',
      icon: 'delapouite/button-finger.svg',
    }),
    action({
      id: 'cop-de-vida', name: 'Cop de vida', skillId: 'mestre-del-xi',
      unlock: 8, type: ActionType.Focus, speed: 0,
      effects: [{ type: 'life_strike', params: { fatigue: 1 } }],
      desc: 'Un aliat caigut s\'aixeca amb la meitat dels seus PV inicials i puja 1 nivell de fatiga.',
      icon: 'delapouite/heart-beats.svg',
    }),
    action({
      id: 'toc-de-la-mort', name: 'Toc de la mort', skillId: 'mestre-del-xi',
      unlock: 9, type: ActionType.Atac, speed: 2, dice: d(2, 8),
      effects: [{ type: 'death_touch', params: { variant: DEFAULT_TOC_VARIANT, price: 0.15 } }],
      desc: TOC_DE_LA_MORT_VARIANTS[DEFAULT_TOC_VARIANT],
      icon: 'lorc/death-note.svg',
    }),
    action({
      id: 'tempesta-de-son', name: 'Tempesta de son', skillId: 'mestre-del-xi',
      unlock: 10, type: ActionType.Atac, speed: 1, dice: d(3, 8), targetCount: 99,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'sleep_storm', params: { wake: 11 } }],
      desc: 'Puges 2 nivells de fatiga. Afecta tots els enemics. No fa dany. Els que no aguanten s\'adormen al final del torn: no juguen carta fins que perden PV o treuen 11+ en un d20 a l\'inici d\'un torn.',
      icon: 'lorc/sleepy.svg',
    }),
  ],
  effects: XI_EFFECTS,
};
