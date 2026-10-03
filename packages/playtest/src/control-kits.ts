/**
 * CONTROL KITS — subjects whose verdict is known before anything is measured.
 *
 * Every requirement in `analyze.ts` reads a number off a simulation
 * and turns it into a ✅ or a ❌. Real content can never tell you whether a ❌
 * fired because the kit is broken or because the REQUIREMENT is: both look
 * equally plausible on the page. That is not hypothetical — it is how
 * requirement 3c spent a session reporting which seed it had been handed
 * (NEXT-STEPS §19.1), and how `DEAD_VALUE` spent one flagging cards against a
 * noise floor nobody had measured (§17.5). Both produced report cards that
 * looked entirely reasonable.
 *
 * So: build a kit whose answer follows from its CONSTRUCTION rather than from
 * any measurement, run the real `analyze` on it, and check the requirement says
 * the known thing.
 *
 *   FLAT KIT      every card identical. Levels buy nothing, so requirement 1
 *                 must find no gain. Thinking cannot matter, so 3 and 3b must
 *                 find no margin. One card repeated IS the whole kit, so 3c
 *                 must find no margin either.
 *   DEAD-CARD KIT a real attack plus a card that does nothing. 4/5 must name
 *                 the no-op and must NOT name the attack.
 *   LADDER KIT    each card strictly bigger than the last. Requirement 1 must
 *                 find a gain.
 *
 * These are deliberately crude. A control whose own answer needs an argument is
 * not a control.
 */
import { ActionType, DiceRoll, type ActionDefinition, type EffectHandler, type StatusBehavior } from '@pimpampum/engine';
import { theRegistry, theSet, type SubjectKit } from '@pimpampum/bench';

let seq = 0;

function card(skillId: string, i: number, over: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: `${skillId}-c${i}`, name: `C${i}`, skillId, unlockLevel: i,
    actionType: ActionType.Atac, speed: 0, effects: [], description: '', iconPath: '',
    ...over,
  } as ActionDefinition;
}

function kit(
  id: string, actions: ActionDefinition[], effects: Record<string, EffectHandler> = {},
): SubjectKit {
  return { id, actions, effects };
}

/** N IDENTICAL attack cards. A level adds an option that is the same option. */
export function flatKit(cards = 4, dice = new DiceRoll(2, 6)): SubjectKit {
  const id = `control-flat-${seq++}`;
  return kit(id, Array.from({ length: cards }, (_, i) => card(id, i + 1, { dice })));
}

/** A real attack, plus a card that does nothing whatsoever. */
export function deadCardKit(): SubjectKit {
  const id = `control-dead-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Real', dice: new DiceRoll(2, 6) }),
    card(id, 2, { name: 'Real2', dice: new DiceRoll(2, 6) }),
    // No dice, no effects, Focus: playing it forfeits the turn.
    card(id, 3, { name: 'NoOp', actionType: ActionType.Focus, dice: undefined }),
  ]);
}

/** Each card strictly bigger than the last, so a level is always worth having. */
export function ladderKit(cards = 4): SubjectKit {
  const id = `control-ladder-${seq++}`;
  // Scales in DICE AND TARGETS, because scaling damage alone is not obviously
  // better here: the solved horde is eight goblins at ONE PV, so a bigger die
  // is 69 points of overkill. That is the same trap the 20d6 control card fell
  // into in bench's card-value control — overkill is not power, and a control whose
  // improvement the fight does not reward is not a control.
  return kit(id, Array.from({ length: cards }, (_, i) =>
    card(id, i + 1, { dice: new DiceRoll(1 + i * 3, 6), targetCount: 1 + i * 3 })));
}

/**
 * Make a control kit visible to the set for the duration of `fn`.
 *
 * The set owns the catalogues a subject is resolved through, so installing is
 * its job (`GameSet.installKit`). Removing again in a `finally` is this
 * function's whole reason to exist: leaking a control would put a fake kit in
 * every later sweep, and because catalogues are computed at module load it
 * would show up in some lookups and not others.
 */
export function withControlKit<T>(def: SubjectKit, fn: (def: SubjectKit) => T): T {
  // The registry is built BEFORE the kit is installed. A set is free to build
  // its registry from its catalogue, and if the first time anything asked for
  // it was inside this function, the catalogue already held the control kit:
  // its handlers went in once from the catalogue and again from the loop below,
  // and the second register threw. It only ever bit the FIRST control in a
  // process, so it hid for as long as the controls shared one file.
  const registry = theRegistry();
  const uninstall = theSet().installKit(def);
  // A control kit's OWN handlers, into the same registry the fights use. They
  // come out again in the finally: EffectRegistry.register throws on a
  // duplicate, so a leaked handler would blow up whichever test ran next
  // rather than this one.
  for (const [type, handler] of Object.entries(def.effects ?? {})) registry.register(type, handler);
  const cleanup = () => {
    for (const type of Object.keys(def.effects ?? {})) registry.unregister(type);
    uninstall();
  };
  let out: T;
  try {
    assertReaches(def);
    out = fn(def);
  } catch (e) {
    cleanup();
    throw e;
  }
  // An ASYNC body (a parallel warm, then the analysis) keeps the kit
  // installed until it settles, not merely until it returns its promise.
  if (out instanceof Promise) return out.finally(cleanup) as T;
  cleanup();
  return out;
}

/**
 * A control kit that does not actually reach the character is not a control.
 *
 * In the fantasy set the catalogue is an array while the lookups are Maps built
 * from it at module load. Pushing onto the array satisfied some callers while
 * leaving the action lookup blind, so every control hero was built holding
 * nothing but its last-resort card — and the suite dutifully reported that a
 * 1d6→7d6 ladder buys no gain and that a kit of identical cards makes thinking
 * matter. Plausible numbers, every one of them about an empty hand.
 *
 * That trap is not specific to one set, which is why the guard lives HERE
 * rather than inside `installKit`: every set gets it, and a set whose install
 * half-works is caught the first time it is measured rather than the first time
 * someone disbelieves a report.
 */
function assertReaches(def: SubjectKit): void {
  const unlocked = theSet().unlockedActions(def.id, def.actions.length).map(a => a.id);
  const missing = def.actions.filter(a => !unlocked.includes(a.id)).map(a => a.id);
  if (missing.length) {
    throw new Error(
      `control-kits: '${def.id}' is registered but ${missing.join(', ')} do not resolve through `
      + `unlockedActions. A hero built from it would hold an empty hand, and every requirement `
      + `measured on it would be measuring nothing — with entirely plausible numbers.`,
    );
  }
  const held = theSet().buildParty({
    characters: [{
      name: 'check', pv: 12, skills: { [def.id]: def.actions.length }, category: 'player',
    }],
  })[0].actions.map(a => a.def.id);
  const notHeld = def.actions.filter(a => !held.includes(a.id)).map(a => a.id);
  if (notHeld.length) {
    throw new Error(`control-kits: '${def.id}' builds a character without ${notHeld.join(', ')}.`);
  }
}

/**
 * A kit whose SECOND card is a trap the AI cannot see through.
 *
 * Requirement 1's regression branch had no end-to-end control, and a regression
 * is genuinely hard to build: levels only ever ADD options, and they add a +1
 * roll bonus along with them, so a rational chooser can never do worse. The
 * only way a level makes a kit worse is if the AI PREFERS the new card and the
 * new card hurts.
 *
 * So: a big attack that also takes a large bite out of its own user. The damage
 * estimate the AI ranks by reads the dice and does not subtract the self-damage,
 * so it reaches for this card — and the hero bleeds out. Constructed to fail,
 * which is the point: a requirement that cannot detect a level making a kit
 * worse is not checking anything.
 */
/** The trap's cost, carried by the kit itself: a control must not lean on the
 *  host set's handlers, or it would measure a different card in every set. */
const SELF_DAMAGE: EffectHandler = {
  onAttackHit(ctx) { ctx.engine.applyPvLoss(ctx.source, Number(ctx.params.amount ?? 1), ctx.source); },
  onAttackMiss(ctx) { ctx.engine.applyPvLoss(ctx.source, Number(ctx.params.amount ?? 1), ctx.source); },
};

export function trapKit(): SubjectKit {
  const id = `control-trap-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Safe', dice: new DiceRoll(2, 6) }),
    // SUICIDAL, not merely costly. A first attempt at 4d6 for 6 PV measured
    // level 2 as +8.7pp BETTER: against a 41-PV basilisk the damage is worth
    // more than the blood, and the +1 roll bonus a level brings helps too. A
    // control has to be lethal by construction, not by argument — 8d6 is far
    // more than the AI's damage estimate needs to prefer it, and 20 self-damage
    // kills a 12-PV hero the first time it is played.
    card(id, 2, {
      name: 'Trap', dice: new DiceRoll(8, 6),
      effects: [{ type: `${id}-self-damage`, params: { amount: 20 } }],
    }),
  ], { [`${id}-self-damage`]: SELF_DAMAGE });
}

/**
 * A TWO-CARD COMBO — requirement 3c's must-PASS control: no single card is
 * right every turn, so repeating any one of them loses to playing the kit.
 *
 * `Aim` readies the next shot (a focus that does nothing on its own); `Loose`
 * is a feeble shot that becomes a heavy one when aimed. Only-Aim never deals
 * damage; only-Loose never gets the bonus; alternating them is the kit. The
 * situations come from the CARDS, not from which fights the host set happens to
 * field — the control it replaced ("wide against a horde, heavy against a
 * boss") was only situational in a set that had a one-PV horde, and in a set
 * without one repeating its heavy card played exactly as well as the kit.
 *
 * The readied state prices itself (`positionValue`), so a one-round lookahead
 * can see why it would Aim — a status the evaluator cannot see is a card the
 * AI never plays, and the control would then be measuring the AI's blind spot.
 */
const AIMED_KEY = 'control-aimed';
const AIMED: StatusBehavior = { positionValue: () => 0.3 };
const AIM: EffectHandler = {
  onResolve(ctx) { ctx.source.setStatus(AIMED_KEY, 1, -1, undefined, AIMED); },
};
const LOOSE: EffectHandler = {
  modifyAttack(ctx) {
    if (!ctx.source.hasStatus(AIMED_KEY) || !ctx.attackMods) return;
    ctx.attackMods.extraDamageDice.push(new DiceRoll(8, 6));
    ctx.source.clearStatus(AIMED_KEY);
  },
};

export function comboKit(): SubjectKit {
  const id = `control-combo-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Aim', actionType: ActionType.Focus, dice: undefined, speed: 3, effects: [{ type: `${id}-aim` }] }),
    card(id, 2, { name: 'Loose', dice: new DiceRoll(1, 6), speed: 2, effects: [{ type: `${id}-loose` }] }),
  ], { [`${id}-aim`]: AIM, [`${id}-loose`]: LOOSE });
}

/**
 * NOTHING BUT DEFENCES, and enormous ones.
 *
 * Fielded in all four seats (`allSeats`) this party cannot kill anything: no
 * attack card, and Cop desesperat is `lastResort` so it never becomes legal
 * while a defence is. The 10d6 defence means nothing penetrates either. Both
 * sides therefore survive to the 40-round cap, every time, and the fight is a
 * DRAW by construction — which is what requirement 2's draw bar exists to
 * catch, and what nothing was checking.
 */
export function defenceOnlyKit(): SubjectKit {
  const id = `control-turtle-${seq++}`;
  return kit(id, [
    // SPEED 9, and that is the whole trick. A defence always self-guards
    // (combat.ts: "A defense always covers its own player against every incoming
    // attack"), but guards register when the ACTION RESOLVES and higher speed
    // resolves first. At speed 0 the goblins struck before the wall existed and
    // the party died in two rounds behind 10d6. Targeting was a red herring:
    // `getActionTargetRequirement` hard-codes 'defense' for any Defensa, so a
    // handler cannot make one self-targeted anyway.
    card(id, 1, { name: 'Wall', actionType: ActionType.Defensa, speed: 9, dice: new DiceRoll(10, 6) }),
    card(id, 2, { name: 'Wall2', actionType: ActionType.Defensa, speed: 9, dice: new DiceRoll(10, 6) }),
  ]);
}

/** Ends the fight on round one: 20d6 at every enemy, fastest on the field. */
export function blitzKit(): SubjectKit {
  const id = `control-blitz-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Blitz', speed: 9, dice: new DiceRoll(20, 6), targetCount: 99 }),
    card(id, 2, { name: 'Blitz2', speed: 9, dice: new DiceRoll(20, 6), targetCount: 99 }),
  ]);
}

/**
 * A card that is only LEGAL once its holder is nearly dead.
 *
 * Requirement 7 flags cards whose win-rate-when-played is clearly under 40%,
 * and it is CONFOUNDED by design: a card played only in trouble correlates with
 * losing however good it is. That confound is exactly what makes it
 * controllable — gate a card on the holder being down to a third of their PV
 * and it can only ever be played from a losing position, so requirement 7 must
 * flag it. The card itself is a perfectly good attack.
 *
 * This is the control for the FLAG, not for the card: a ❌ here is the harness
 * working, and §7.1 says so — it is reported as a flag to investigate, never as
 * a verdict.
 */
/**
 * A FIFTH of maximum PV, not a third — and the change is a measurement, not a
 * preference.
 *
 * At a third this control stopped firing the moment the AI got strong (§20.7).
 * A party that wins most of its fights wins plenty of them after one hero dips
 * to 4 PV out of 12, so "only ever played from a losing position" stopped being
 * true enough to drag the card's win-when-played clearly under requirement 7's
 * 40% floor. A gate has to name a state that actually predicts defeat, and at
 * 12 PV a fifth is 2 — a hero about to die.
 *
 * The two gates stay COMPLEMENTARY on purpose. Leave a band where neither card
 * is legal and the hero falls through to `Cop desesperat`, and the kit under
 * test stops being the kit under test.
 */
const LOSING_FRACTION = 5;
const ONLY_WHEN_LOSING: EffectHandler = {
  canPlay(actor) { return actor.currentPV * LOSING_FRACTION <= actor.maxPV; },
};
const ONLY_WHEN_HEALTHY: EffectHandler = {
  canPlay(actor) { return actor.currentPV * LOSING_FRACTION > actor.maxPV; },
};

export function losingOnlyKit(): SubjectKit {
  const id = `control-losing-${seq++}`;
  // MUTUALLY EXCLUSIVE GATES, and Desperate is the WEAKER card. A first draft
  // gated only Desperate, at a third of PV, and made it the STRONGER card: it
  // came back winning 70% of the turns it was played. Two things were wrong —
  // one hero dropping to a third of their PV does not mean the PARTY is losing,
  // and a better card rescues the fights it is played in. Now Desperate is the
  // only legal card once its holder is down to a third of their PV, and it is
  // 1d4 against Normal's 2d6, so it is played from a losing position and does
  // not turn it around.
  return kit(id, [
    card(id, 1, { name: 'Normal', dice: new DiceRoll(2, 6), effects: [{ type: `${id}-healthy` }] }),
    card(id, 2, { name: 'Desperate', dice: new DiceRoll(1, 4), effects: [{ type: `${id}-hurt` }] }),
  ], { [`${id}-hurt`]: ONLY_WHEN_LOSING, [`${id}-healthy`]: ONLY_WHEN_HEALTHY });
}

/**
 * ONE CARD THAT IS ALWAYS THE ANSWER — requirement 5's positive control.
 *
 * A fast, heavy, every-target attack beside two feeble ones: whenever it is in
 * hand nothing else is worth playing, so the decision is gone. The feeble
 * cards are its negative control in the same kit — they must not be called
 * auto-include (they should read dead instead).
 */
export function dominantKit(): SubjectKit {
  const id = `control-dominant-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Feeble', dice: new DiceRoll(1, 4) }),
    card(id, 2, { name: 'Feeble2', dice: new DiceRoll(1, 4) }),
    card(id, 3, { name: 'Answer', speed: 9, dice: new DiceRoll(6, 6), targetCount: 99 }),
  ]);
}

/** The shape every band control is scaled from: an attack, a guard, a heavy attack. */
function plainKit(name: string, dice: [number, number, number]): SubjectKit {
  const id = `control-${name}-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Strike', dice: new DiceRoll(dice[0], 6), speed: 2 }),
    card(id, 2, { name: 'Block', actionType: ActionType.Defensa, dice: new DiceRoll(dice[1], 6), speed: 3 }),
    card(id, 3, { name: 'Heavy', dice: new DiceRoll(dice[2], 6), speed: 1 }),
  ]);
}

/**
 * A kit that wins the fight on its own: requirement 8 must call it above the
 * band. OVERWHELMING rather than merely bigger, because one seat of four is
 * diluted by the three beside it — a first draft with 5d6s measured
 * +12.7pp±3.5, not clearly past a 15pp band. Fastest on the table, sweeping
 * every enemy, and its fights end on round one.
 */
export function strongKit(): SubjectKit {
  const k = plainKit('strong', [8, 10, 12]);
  for (const a of k.actions) Object.assign(a, { speed: 9, ...(a.actionType === ActionType.Atac ? { targetCount: 99 } : {}) });
  return k;
}

/** Strictly smaller dice: requirement 8 must call it below the band. */
export function weakKit(): SubjectKit {
  const k = plainKit('weak', [1, 1, 1]);
  for (const a of k.actions) (a as { dice?: DiceRoll }).dice = new DiceRoll(1, 3);
  return k;
}

/**
 * THE SET'S OWN NEUTRAL STAND-IN, relabelled — requirement 8's IN-band control
 * and the A/A test of the whole analyzer: measured against the baseline it
 * itself defines, its delta must be zero. Built from whatever the installed set
 * uses as its first stand-in, so it is the same control in every set.
 */
export function standInCopyKit(): SubjectKit {
  const set = theSet();
  const source = set.kit(set.calibration.standIns[0]);
  if (!source) throw new Error('standInCopyKit: the set declares a stand-in it does not have');
  const id = `control-standin-${seq++}`;
  return kit(id, source.actions.map((a, i) => ({ ...a, id: `${id}-c${i + 1}`, skillId: id })));
}
