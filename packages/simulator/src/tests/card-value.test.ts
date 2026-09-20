/**
 * IS THE CARD-VALUE INSTRUMENT CALIBRATED? — the two-sided control.
 *
 * `bench/regret.ts` prices a card by forcing it from a position and playing the
 * fight out. That machinery has two silent failure modes, and the first one
 * already happened: the forced card not taking effect at all (every branch
 * identical, every card priced at exactly 0.00 ± 0.00, see `forceRound`). The
 * second is subtler — the scoring or the pairing being wrong in a way that
 * still produces plausible-looking numbers.
 *
 * Neither is caught by staring at a report card, because a report card of six
 * kits' worth of plausible numbers is exactly what a broken instrument
 * produces. So: give it two cards whose value is known WITHOUT measuring
 * anything, and check it finds them.
 *
 *   NO-OP       a Focus with no dice and no effects. Playing it forfeits the
 *               turn. Nothing in the game can make that good.
 *   OVERWHELMING an attack rolling 20d6. Nothing in the game can survive it.
 *
 * If the no-op is not last and the 20d6 is not first, the instrument is wrong
 * and every number it has ever printed is worthless. This is the check that was
 * owed before anything got redesigned on these numbers (NEXT-STEPS §18.4).
 *
 * It runs at a deliberately small sample: the effects being asserted are
 * enormous, so resolving them needs almost nothing, and a test nobody can
 * afford to run is a test that rots (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import {
  ActionType, CombatEngine, DiceRoll, createCharacter, lookaheadChooser,
  setAIControlled, withSeed, type ActionDefinition,
} from '@pimpampum/engine';
import { buildCharacter, ALL_SKILLS, PLAYER_PV } from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { REGISTRY } from '../bench/arena.js';
import { CELL_AI } from '../bench/cells.js';
import { SHAPES, calibrationParty, solveShape } from '../bench/shapes.js';
import { hero } from '../bench/reference.js';
import { DEFAULT_REGRET, valuePosition, pvDifferential } from '../bench/regret.js';

function synthetic(id: string, over: Partial<ActionDefinition>): ActionDefinition {
  return {
    // unlockLevel 0, exactly as COP_DESESPERAT does it. `actionPlayable` gates
    // on `skills.get(skillId) >= unlockLevel`, and no character has a level in
    // a skill called 'control' — at unlockLevel 1 these cards were silently
    // never legal, so the first run of this test priced the real kit and never
    // noticed the controls were missing. A control that can be absent without
    // anyone noticing is not a control, hence the "prices every card it was
    // given" assertion below.
    id, name: id, skillId: 'control', unlockLevel: 0,
    actionType: ActionType.Focus, speed: 0, effects: [], description: '', iconPath: '',
    ...over,
  } as ActionDefinition;
}

/** Forfeits the turn: no dice, no effects, no status, nothing. */
const NO_OP = synthetic('control-no-op', {});
/**
 * Ends the fight on the turn it is played: 20d6 against EVERY enemy, first.
 *
 * `targetCount` is the whole point and the first draft left it out — a 20d6
 * single-target attack, which reads as obviously unbeatable, priced SECOND
 * behind Contraatac. The instrument was right and the control was wrong: the
 * solved horde is eight goblins at ONE PV, so a 70-point swing at one of them
 * is 69 points thrown away, while a defense that guards against eight attackers
 * is worth a great deal. Overkill is not power.
 *
 * That near-miss is worth more than a passing test would have been, so it is
 * written down rather than quietly fixed.
 */
const OVERWHELMING = synthetic('control-overwhelming', {
  actionType: ActionType.Atac, speed: 9, dice: new DiceRoll(20, 6), targetCount: 99,
});

/** A subject holding its real kit PLUS the two controls, in seat 0. */
function partyWithControls(skillId: string) {
  const spec = hero('Subjecte', skillId);
  const real = buildCharacter(spec);
  const subject = createCharacter({
    name: 'Subjecte', classCss: spec.classCss ?? 'objecte', iconPath: '',
    pv: PLAYER_PV, skills: spec.skills,
    actions: [...real.actions.map(a => a.def), NO_OP, OVERWHELMING],
    equipment: real.equipment, category: 'player',
  });
  const rest = calibrationParty(0).characters!.slice(1).map(c => buildCharacter(c));
  return [subject, ...rest];
}

/** Mean value of every card, over a handful of fights. */
function priceCards(skillId: string, fights: number): Map<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  withSeed(4242, () => {
    for (let g = 0; g < fights; g++) {
      const players = partyWithControls(skillId);
      setAIControlled(players);
      const engine = new CombatEngine(players, buildComposition(solveShape(SHAPES[0]).groups), {
        registry: REGISTRY, maxRounds: 40, actionChooser: lookaheadChooser(CELL_AI),
      });
      const subject = engine.teams[0][0];
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
        if (subject.isAlive()) {
          const priced = valuePosition(engine, subject, { ...DEFAULT_REGRET, team: 0 });
          for (const c of priced?.cards ?? []) {
            const e = sums.get(c.id) ?? { total: 0, n: 0 };
            sums.set(c.id, { total: e.total + c.value, n: e.n + 1 });
          }
        }
        engine.runRound();
      }
    }
  });
  return new Map([...sums].map(([id, e]) => [id, e.total / Math.max(1, e.n)]));
}

describe('the card-value instrument finds cards whose value is known in advance', () => {
  // One kit is enough for a two-sided control: the claim is about the
  // INSTRUMENT, not about any kit's content.
  const skillId = ALL_SKILLS.find(s => s.id === 'mestre-armes')!.id;
  const priced = priceCards(skillId, 12);
  const ranked = [...priced.entries()].sort((a, b) => b[1] - a[1]);
  const show = (): string => ranked.map(([id, v]) => `${id} ${v.toFixed(1)}`).join(', ');

  it('prices every card it was given', () => {
    expect(priced.has(NO_OP.id), `the no-op was never priced — ${show()}`).toBe(true);
    expect(priced.has(OVERWHELMING.id), `the 20d6 was never priced — ${show()}`).toBe(true);
  });

  it('ranks a 20d6 attack FIRST', () => {
    expect(ranked[0][0], `nothing in the game survives 20d6, so it must top the ranking. Got: ${show()}`)
      .toBe(OVERWHELMING.id);
  });

  it('ranks a do-nothing card LAST', () => {
    expect(ranked[ranked.length - 1][0], `forfeiting the turn must be the worst play. Got: ${show()}`)
      .toBe(NO_OP.id);
  });

  it('separates them by much more than it separates real cards', () => {
    // The controls bracket the kit: the spread between them has to dwarf the
    // spread among the real cards, or the instrument is reporting noise with a
    // plausible shape.
    const controls = priced.get(OVERWHELMING.id)! - priced.get(NO_OP.id)!;
    const real = ranked.filter(([id]) => id !== NO_OP.id && id !== OVERWHELMING.id).map(([, v]) => v);
    const realSpread = Math.max(...real) - Math.min(...real);
    expect(controls, `controls ${controls.toFixed(1)} vs real spread ${realSpread.toFixed(1)} — ${show()}`)
      .toBeGreaterThan(realSpread);
  });
});

describe('the outcome is PV on one side minus PV on the other, and nothing else', () => {
  it('is symmetric, and is the board and nothing else', () => {
    const players = [buildCharacter(hero('A', 'mestre-armes'))];
    const engine = new CombatEngine(players, buildComposition(solveShape(SHAPES[0]).groups), {
      registry: REGISTRY, maxRounds: 40, aiDepth: 0,
    });
    const mine = engine.teams[0].reduce((n, c) => n + c.currentPV, 0);
    const theirs = engine.teams[1].reduce((n, c) => n + c.currentPV, 0);
    expect(pvDifferential(engine, 0)).toBe(mine - theirs);
    expect(pvDifferential(engine, 0)).toBe(-pvDifferential(engine, 1));
    // NOT a proxy for who is winning, and this is the trap: a solved horde is
    // EIGHT GOBLINS AT 1 PV, so a lone hero leads it on PV by 4 while being
    // badly outnumbered. The measure reads the board. It earns its place as a
    // surrogate through the rho check printed on every card-value run, not
    // through anybody's intuition about what a good position looks like.
    expect(theirs).toBeLessThan(mine);
  });
});
