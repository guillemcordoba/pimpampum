/**
 * CONTROL KITS — subjects whose verdict is known before anything is measured.
 *
 * Every requirement in `analyze.ts` reads a number off a simulation
 * and turns it into a ✅ or a ❌. Real content can never tell you whether a ❌
 * fired because the kit is broken or because the REQUIREMENT is: both look
 * equally plausible on the page. That is not hypothetical — it is how
 * the one-card requirement spent a session reporting which seed it had been handed
 * (NEXT-STEPS §19.1), and how `DEAD_VALUE` spent one flagging cards against a
 * noise floor nobody had measured (§17.5). Both produced report cards that
 * looked entirely reasonable.
 *
 * So: build a kit whose answer follows from its CONSTRUCTION rather than from
 * any measurement, run the real `analyze` on it, and check the requirement says
 * the known thing.
 *
 *   DEFENCE-ONLY  nothing can be killed: requirement 1 must fail, on stalls.
 *   BLITZ         every fight ends on round one: requirement 1 must pass.
 *   STRONG / WEAK the neutral stand-in's cards, bigger / smaller: requirement
 *   / STAND-IN    2 must read above / below / zero.
 *   FLAT KIT      every card identical, so choosing cannot matter: requirement
 *                 3 must fail on the cost of a random pick.
 *   DEAD-CARD KIT two heavy attacks and a card that does nothing: requirement 3
 *                 must call the no-op never right, and not the attacks.
 *   NOISY TWINS   two attacks identical in effect whose dice drift apart: the
 *                 rollouts differ by noise alone, so a random pick must still
 *                 cost nothing — noise must not read as a choice.
 *   COMBO         Aim and Loose, each right at its own moment: requirement 3
 *                 must pass, choosing clearly mattering.
 *
 * The strategy triangle's controls are styles, not kits: `test/triangle.work.ts`.
 *
 * These are deliberately crude. A control whose own answer needs an argument is
 * not a control.
 */
import { ActionType, DiceRoll, random, type ActionDefinition, type EffectHandler, type StatusBehavior } from '@pimpampum/engine';
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

/** N IDENTICAL attack cards: every choice is the same choice. */
export function flatKit(cards = 4, dice = new DiceRoll(2, 6)): SubjectKit {
  const id = `control-flat-${seq++}`;
  return kit(id, Array.from({ length: cards }, (_, i) => card(id, i + 1, { dice })));
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
 * Two HEAVY attacks — every enemy, fastest on the table — plus a card that
 * does nothing whatsoever. Playing the no-op forfeits a turn that would have
 * hit the whole enemy side first, so wherever it looks best, the runner-up is
 * better on fresh rollouts.
 *
 * HEAVY ON PURPOSE. With two 2d6 attacks in one seat of four, one seat's choice
 * barely moved the fight (a random pick cost ~1 PV), and doing nothing really
 * was about as good as attacking: its gain when it looked best measured −0.5,
 * +0.5 and −0.2 ±0.8 across the opponent models. A control whose own answer
 * needs an argument is not a control, so this one makes the choice matter.
 */
export function deadCardKit(): SubjectKit {
  const id = `control-dead-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Real', speed: 9, dice: new DiceRoll(6, 6), targetCount: 99 }),
    card(id, 2, { name: 'Real2', speed: 9, dice: new DiceRoll(6, 6), targetCount: 99 }),
    card(id, 3, { name: 'NoOp', actionType: ActionType.Focus, dice: undefined }),
  ]);
}

/**
 * TWO ATTACKS THAT ARE THE SAME CARD, EXCEPT THAT ONE BURNS A RANDOM DRAW.
 *
 * The flat kit's identical cards tie EXACTLY under common random numbers, so
 * they never test noise. Here the echo's wasted draw shifts every die after
 * it, so the two branches play out differently while being worth the same in
 * expectation. A cost of a random pick that takes a max over noisy rollouts
 * reads a choice here every time; the cross-fitted one must read nothing.
 */
const BURN_A_DRAW: EffectHandler = { modifyAttack() { random(); } };

export function noisyTwinKit(): SubjectKit {
  const id = `control-twins-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Strike', dice: new DiceRoll(2, 6) }),
    card(id, 2, { name: 'Echo', dice: new DiceRoll(2, 6), effects: [{ type: `${id}-burn` }] }),
  ], { [`${id}-burn`]: BURN_A_DRAW });
}

/**
 * A TWO-CARD COMBO — requirement 3's must-PASS control: each card is right at
 * its own moment, and playing the wrong one throws the shot away, so choosing
 * clearly matters.
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
 * DRAW by construction — which is what requirement 1's stall bar exists to
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
 * A kit that wins the fight on its own: requirement 2 must call it above the
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

/** Strictly smaller dice: requirement 2 must call it below the band. */
export function weakKit(): SubjectKit {
  const k = plainKit('weak', [1, 1, 1]);
  for (const a of k.actions) (a as { dice?: DiceRoll }).dice = new DiceRoll(1, 3);
  return k;
}

/**
 * THE SET'S OWN NEUTRAL STAND-IN, relabelled — requirement 2's IN-band control
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
