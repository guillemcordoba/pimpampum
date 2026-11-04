/**
 * How far this set's cards may stray above the dice ladder (set-common
 * `offTheLadder`): the ladder test asserts it, the dynamics report shows it.
 */
import type { LadderRules } from '@pimpampum/set-common';

export const LADDER_RULES: LadderRules = {
  slack: 1,
  focusSlack: 1,
  reasons: {
    // Esgrima, shared with the elements set (its rules say the same).
    'estocada-fantasma': 'costs a fatigue level (a card too strong for its slot pays fatigue)',
  },
};
