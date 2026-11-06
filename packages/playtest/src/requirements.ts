/**
 * EVERY REQUIREMENT A SET IS HELD TO, in one list: what the dynamics report
 * shows a set's designer, each rule in one line with where else it is checked
 * (the user, 2026-11-04: the report is about the set and what in it needs
 * changing). The machinery's own checks — the AI against the referee and its
 * model of the opponents, the vanilla instrument, status pricing, the encounter
 * creator — are tests the assistant keeps green, not rows here. Left out on
 * purpose (2026-11-06): the style-lean triangle (a side that reads and plays
 * Focus beats one that defends, which is the design: against a defender, Focus),
 * and the band against creatures until the creatures are on the ladder (B20).
 */
import { FIELD_MAX, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, MIN_CHOICE_COST } from './rules.js';
import { MAX_FAST_KOS, MAX_ROUND_ONE_KOS } from './derive-pv.js';

export type RequirementGroup = 'how fights play' | 'cards';

export interface Requirement {
  id: string;
  group: RequirementGroup;
  name: string;
  /** The rule, in one line, with its bars. */
  rule: string;
  alsoCheckedBy: string[];
}

const pc = (x: number) => `${Math.round(100 * x)}%`;

export const REQUIREMENTS: readonly Requirement[] = [
  {
    id: 'fights-end', group: 'how fights play', name: 'Fights end in time',
    rule: `median ≤ ${MAX_MEDIAN_ROUNDS} rounds, 9 in 10 within ${MAX_P90_ROUNDS}, stalls under ${pc(MAX_STALL_RATE)}`,
    alsoCheckedBy: ['kit gate (every kit, levels 3-10)', 'kit analyzer (against creatures)'],
  },
  {
    id: 'round-one', group: 'how fights play', name: 'Nobody falls in round 1',
    rule: `at most ${pc(MAX_ROUND_ONE_KOS)} of fresh heroes fall in the first round`,
    alsoCheckedBy: ['PV derivation'],
  },
  {
    id: 'interactive', group: 'how fights play', name: 'Nobody dies to what they could not stop',
    rule: `no fast attack fells a fresh hero in one play on more than ${pc(MAX_FAST_KOS)} of its plays (it resolves before every normal defense)`,
    alsoCheckedBy: ['PV derivation (the strongest fast attack sets a floor)'],
  },
  {
    id: 'dumb-play', group: 'how fights play', name: 'Dumb play loses',
    rule: 'the reading AI clearly beats every dumb strategy: only defending (the turtle), always the biggest attack, any legal card',
    alsoCheckedBy: ['kit gate (levels 3, 6, 10)'],
  },
  {
    id: 'field', group: 'how fights play', name: 'No kit dominates',
    rule: `no kit's side clearly above ${pc(FIELD_MAX)} against the field (2v2, random kits)`,
    alsoCheckedBy: ['kit gate (every kit, levels 3-10)'],
  },
  {
    id: 'card-use', group: 'cards', name: 'Every card has a use',
    rule: 'each card is the right play somewhere it is held',
    alsoCheckedBy: ['kit gate (card values in hero fights)', 'kit analyzer (against creatures)', 'kit slow tests'],
  },
  {
    id: 'choice', group: 'cards', name: 'Choosing matters',
    rule: `a random card costs at least ${MIN_CHOICE_COST} PV a decision`,
    alsoCheckedBy: ['kit gate (each checkpoint)', 'kit analyzer (against creatures)', 'kit slow tests'],
  },
  {
    id: 'ladder', group: 'cards', name: 'Cards sit on the dice ladder',
    rule: 'every card within its rung\'s slack (a Focus further), or a written reason',
    alsoCheckedBy: ['ladder test (fast tier, each set)'],
  },
];
