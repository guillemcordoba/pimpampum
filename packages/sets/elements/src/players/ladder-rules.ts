/**
 * How far this set's cards may stray above the dice ladder (set-common
 * `offTheLadder`): the ladder test asserts it, the dynamics report shows it.
 */
import type { LadderRules } from '@pimpampum/set-common';

export const LADDER_RULES: LadderRules = {
  slack: 1,
  focusSlack: 6,
  reasons: {
    bunquer: 'shelters every ally, and cancels the attacks of the whole side this round',
    supernova: 'fells its own player',
    'estocada-fantasma': 'costs a fatigue level (a card too strong for its slot pays fatigue)',
    'furia-de-flames': 'burns its own player whenever it wounds nobody',
  },
};
