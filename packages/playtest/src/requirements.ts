/**
 * EVERY REQUIREMENT A SET IS HELD TO, in one list: what the dynamics report
 * shows a set's designer, each rule in one line with where else it is checked
 * (the user, 2026-11-04: the report is about the set and what in it needs
 * changing). The machinery's own checks — the AI against the referee and its
 * model of the opponents, the vanilla instrument, status pricing, the encounter
 * creator — are tests the assistant keeps green, not rows here.
 */
import { FIELD_MAX, KIT_BAND, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE, MIN_CHOICE_COST } from './rules.js';
import { MAX_BEST_BLOW_KOS, MAX_ROUND_ONE_KOS } from './derive-pv.js';

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
    id: 'best-blow', group: 'how fights play', name: 'A fresh hero survives one blow',
    rule: `at most ${pc(MAX_BEST_BLOW_KOS)} of heroes are felled from full by a single card`,
    alsoCheckedBy: ['PV derivation (the level\'s strongest card)'],
  },
  {
    id: 'triangle', group: 'how fights play', name: 'The strategy triangle',
    rule: 'Power > Protect > Aggro > Power, each clearly (2σ)',
    alsoCheckedBy: ['kit gate (levels 3, 6, 10)', 'triangle slow test'],
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
    id: 'band', group: 'how fights play', name: 'Kits are equally strong',
    rule: `every kit within ±${Math.round(100 * KIT_BAND)} points of a neutral kit, against creatures`,
    alsoCheckedBy: ['kit analyzer (every main kit)', 'kit slow tests'],
  },
  {
    id: 'card-use', group: 'cards', name: 'Every card has a use',
    rule: 'each card is the right play somewhere it is held',
    alsoCheckedBy: ['kit gate (full run: card values in mirrors)', 'kit analyzer (against creatures)', 'kit slow tests'],
  },
  {
    id: 'choice', group: 'cards', name: 'Choosing matters',
    rule: `a random card costs at least ${MIN_CHOICE_COST} PV a decision`,
    alsoCheckedBy: ['kit analyzer', 'kit slow tests'],
  },
  {
    id: 'ladder', group: 'cards', name: 'Cards sit on the dice ladder',
    rule: 'every card within its rung\'s slack (a Focus further), or a written reason',
    alsoCheckedBy: ['ladder test (fast tier, each set)'],
  },
];
