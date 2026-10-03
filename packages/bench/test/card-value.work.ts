/**
 * The measuring half of `card-value.slow.test.ts`: price a real synthetic kit
 * plus two cards whose value is known in advance, in its own process.
 */
import { ActionType, CombatEngine, DiceRoll, createCharacter, setAIControlled, withSeed, type ActionDefinition } from '@pimpampum/engine';
import { lookaheadChooser } from '@pimpampum/ai';
import {
  calibrationParty, CELL_AI, DEFAULT_REGRET, shapeEnemies, theRegistry, theSet, useSet, valuePosition,
} from '../src/index.js';
import { SYNTHETIC } from '../src/testing.js';

function control(id: string, over: Partial<ActionDefinition>): ActionDefinition {
  // unlockLevel 0: no character has a level in a skill called 'control', and at
  // unlockLevel 1 these cards were silently never legal — the first run priced
  // the real kit and never noticed the controls were missing.
  return {
    id, name: id, skillId: 'control', unlockLevel: 0,
    actionType: ActionType.Focus, speed: 0, effects: [], description: '', iconPath: '', ...over,
  } as ActionDefinition;
}

/** Forfeits the turn: no dice, no effects, nothing. */
export const NO_OP = 'control-no-op';
/**
 * Ends the fight the turn it is played: 20d6 at EVERY enemy, first. The
 * `targetCount` is the point — a single-target 20d6 once priced SECOND, because
 * against a horde of one-PV bodies seventy points at one of them is overkill,
 * not power. The instrument was right and the control was wrong.
 */
export const OVERWHELMING = 'control-overwhelming';

const CARDS = [
  control(NO_OP, {}),
  control(OVERWHELMING, { actionType: ActionType.Atac, speed: 9, dice: new DiceRoll(20, 6), targetCount: 99 }),
];

/** Mean value of every card the subject holds, over a handful of fights. */
export function priceCards(kitId: string, fights: number): [string, number][] {
  useSet(SYNTHETIC);
  const sums = new Map<string, { total: number; n: number }>();
  withSeed(4242, () => {
    for (let g = 0; g < fights; g++) {
      const party = calibrationParty(0).characters!;
      const real = theSet().buildParty({ characters: [theSet().hero('Subjecte', kitId)] })[0];
      const subject = createCharacter({
        name: 'Subjecte', classCss: 'x', pv: real.maxPV, skills: Object.fromEntries(real.skills),
        actions: [...real.actions.map(a => a.def), ...CARDS], equipment: real.equipment,
      });
      const players = [subject, ...theSet().buildParty({ characters: party.slice(1) })];
      setAIControlled(players);
      const engine = new CombatEngine(players, theSet().buildEncounter(shapeEnemies(0)), {
        registry: theRegistry(), maxRounds: 40, actionChooser: lookaheadChooser(CELL_AI),
      });
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
        if (subject.isAlive()) {
          for (const c of valuePosition(engine, subject, { ...DEFAULT_REGRET, team: 0 })?.cards ?? []) {
            const e = sums.get(c.id) ?? { total: 0, n: 0 };
            sums.set(c.id, { total: e.total + c.value, n: e.n + 1 });
          }
        }
        engine.runRound();
      }
    }
  });
  return [...sums].map(([id, e]) => [id, e.total / Math.max(1, e.n)]);
}
