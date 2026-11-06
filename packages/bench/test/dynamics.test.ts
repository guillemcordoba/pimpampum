/**
 * WHO COULD HAVE ANSWERED A KNOCKOUT. A fresh hero felled in one play by a blow
 * a slow Focus set up had an answer: hitting the Focus's caster first cancels
 * it (the user, 2026-11-06). A fast Focus resolves before any slow attack can
 * reach its caster, so its blow stays unanswerable — and names the Focus it rode.
 */
import { describe, it, expect } from 'vitest';
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';
import { kitsDynamics, useSet } from '../src/index.js';
import { RALLY, SYNTHETIC } from '../src/testing.js';

const card = (id: string, skillId: string, actionType: ActionType, over: Partial<ActionDefinition> = {}): ActionDefinition => ({
  id, name: id, skillId, unlockLevel: 1, actionType, effects: [], description: '', iconPath: '', ...over,
});
/** A pin-prick that fells a fresh hero only riding its own +20 Focus. */
const stormer = (fast: boolean) => ({ id: 'stormer', actions: [
  card('rally', 'stormer', ActionType.Focus, { fast, effects: [{ type: RALLY, params: { bonus: 20 } }] }),
  card('poke', 'stormer', ActionType.Atac, { dice: DiceRoll.parse('1d4') }),
] });
/** Holds nothing but a guard, so the stormer's blows land through guards. */
const turtle = { id: 'turtle', actions: [card('wall', 'turtle', ActionType.Defensa, { dice: DiceRoll.parse('1d4') })] };

function pokeWith(fast: boolean) {
  useSet(SYNTHETIC);
  const uninstall = [SYNTHETIC.installKit(stormer(fast)), SYNTHETIC.installKit(turtle)];
  try {
    return kitsDynamics(1, 60, { pv: 8 }, { kits: ['stormer', 'turtle'], print: `stormer-${fast}` }).cards.poke;
  } finally { for (const off of uninstall) off(); }
}

describe('a knockout a Focus set up', () => {
  it('a slow Focus: answered, credited to the Focus', () => {
    const poke = pokeWith(false);
    expect(poke.focusSetUps.rally).toBeGreaterThan(0);
    expect(poke.unanswerable).toBe(0);
  });
  it('a fast Focus: still unanswerable through a guard, and the Focus is the combo', () => {
    const poke = pokeWith(true);
    expect(poke.focusSetUps.rally).toBeUndefined();
    expect(poke.unanswerableHow.guard).toBeGreaterThan(0);
    expect(poke.unansweredRode.rally).toBe(poke.unanswerable);
  });
});
