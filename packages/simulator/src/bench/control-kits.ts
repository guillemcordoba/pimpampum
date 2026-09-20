/**
 * CONTROL KITS — subjects whose verdict is known before anything is measured.
 *
 * Every requirement in `kit-analyzer-lib.ts` reads a number off a simulation
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
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';
import { buildCharacter, registerSkill, unregisterSkill, unlockedActions, type SkillDefinition } from '@pimpampum/skills';

let seq = 0;

function card(skillId: string, i: number, over: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: `${skillId}-c${i}`, name: `C${i}`, skillId, unlockLevel: i,
    actionType: ActionType.Atac, speed: 0, effects: [], description: '', iconPath: '',
    ...over,
  } as ActionDefinition;
}

function kit(id: string, actions: ActionDefinition[]): SkillDefinition {
  return {
    id, displayName: id, classCss: 'objecte', category: 'player',
    description: 'control', iconPath: '', actions, effects: {},
  };
}

/** N IDENTICAL attack cards. A level adds an option that is the same option. */
export function flatKit(cards = 4, dice = new DiceRoll(2, 6)): SkillDefinition {
  const id = `control-flat-${seq++}`;
  return kit(id, Array.from({ length: cards }, (_, i) => card(id, i + 1, { dice })));
}

/** A real attack, plus a card that does nothing whatsoever. */
export function deadCardKit(): SkillDefinition {
  const id = `control-dead-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Real', dice: new DiceRoll(2, 6) }),
    card(id, 2, { name: 'Real2', dice: new DiceRoll(2, 6) }),
    // No dice, no effects, Focus: playing it forfeits the turn.
    card(id, 3, { name: 'NoOp', actionType: ActionType.Focus, dice: undefined }),
  ]);
}

/** Each card strictly bigger than the last, so a level is always worth having. */
export function ladderKit(cards = 4): SkillDefinition {
  const id = `control-ladder-${seq++}`;
  // Scales in DICE AND TARGETS, because scaling damage alone is not obviously
  // better here: the solved horde is eight goblins at ONE PV, so a bigger die
  // is 69 points of overkill. That is the same trap the 20d6 control card fell
  // into in card-value.test.ts — overkill is not power, and a control whose
  // improvement the fight does not reward is not a control.
  return kit(id, Array.from({ length: cards }, (_, i) =>
    card(id, i + 1, { dice: new DiceRoll(1 + i * 3, 6), targetCount: 1 + i * 3 })));
}

/**
 * Make a control kit visible to the analyzer for the duration of `fn`.
 *
 * `ALL_SKILLS` is how `hero`, `cardsOf` and `buildCharacter` resolve a subject,
 * so a control kit has to live there. It is removed again in a `finally`:
 * leaking one would put a fake kit in every later sweep, and because
 * `MAIN_KITS` is computed at module load it would show up in some places and
 * not others — the exact positional drift `REFERENCE_KITS` exists to stop.
 */
export function withControlKit<T>(def: SkillDefinition, fn: (def: SkillDefinition) => T): T {
  registerSkill(def);
  try {
    assertReaches(def);
    return fn(def);
  } finally {
    unregisterSkill(def);
  }
}

/**
 * A control kit that does not actually reach the character is not a control.
 *
 * `ALL_SKILLS` is an array; the lookups are Maps built from it at module load.
 * Pushing onto the array satisfied `cardsOf` and `MAIN_KITS` while leaving
 * `unlockedActions` blind, so every control hero was built holding nothing but
 * Cop desesperat — and the suite dutifully reported that a 1d6→7d6 ladder buys
 * no gain and that a kit of identical cards makes thinking matter. Plausible
 * numbers, every one of them about an empty hand.
 *
 * So the harness checks its own premise before measuring anything, the same way
 * `card-value.test.ts` asserts it priced the controls it injected.
 */
function assertReaches(def: SkillDefinition): void {
  const unlocked = unlockedActions(def.id, def.actions.length).map(a => a.id);
  const missing = def.actions.filter(a => !unlocked.includes(a.id)).map(a => a.id);
  if (missing.length) {
    throw new Error(
      `control-kits: '${def.id}' is registered but ${missing.join(', ')} do not resolve through `
      + `unlockedActions. A hero built from it would hold an empty hand, and every requirement `
      + `measured on it would be measuring nothing — with entirely plausible numbers.`,
    );
  }
  const held = buildCharacter({
    name: 'check', pv: 12, skills: { [def.id]: def.actions.length }, category: 'player',
  }).actions.map(a => a.def.id);
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
 * estimate the AI ranks by reads the dice and does not subtract `self_damage`,
 * so it reaches for this card — and the hero bleeds out. Constructed to fail,
 * which is the point: a requirement that cannot detect a level making a kit
 * worse is not checking anything.
 */
export function trapKit(): SkillDefinition {
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
      effects: [{ type: 'self_damage', params: { amount: 20 } }],
    }),
  ]);
}

/**
 * A kit of SITUATIONAL cards: one for crowds, one for a single big body.
 *
 * Requirement 3c's must-fire direction had no control. A one-trick arm can only
 * lose to full play when no single card is right everywhere — so the cards are
 * built to split on exactly the axis the fight shapes vary along, `horda`
 * (eight goblins at 1 PV) against `cap` (one basilisk at 41).
 *
 * Wide-and-weak clears a horde and bounces off the boss; narrow-and-heavy does
 * the reverse. Repeating either should lose to playing both.
 */
export function situationalKit(): SkillDefinition {
  const id = `control-situational-${seq++}`;
  return kit(id, [
    card(id, 1, { name: 'Wide', dice: new DiceRoll(1, 6), targetCount: 99 }),
    card(id, 2, { name: 'Heavy', dice: new DiceRoll(6, 6) }),
  ]);
}
