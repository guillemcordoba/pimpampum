/**
 * CANDIDATE RULES FOR HOW DEFENSES MEET ATTACKS, MEASURED (the user,
 * 2026-11-14: "exploring alternative rules that tune how defense cards go
 * against attacks, so that we can find a PV that fulfills both quick fights
 * and no one hit ko"). Each candidate is the engine's options and nothing
 * else (bench `Variant`): no card, no dice, no PV table moves.
 *
 * A candidate is measured the same way on the real kits and on their vanilla
 * twins (`vanilla.ts`), per level:
 *  - the WINDOW (`realWindow`), every hero on one PV: the floor (no knockout
 *    without an answer), the aim (the median fight within `AIM_MEDIAN_ROUNDS`)
 *    and the ceiling (fights end in time);
 *  - at the aim's PV, WHAT THE HAND IS WORTH (bench `styleDuel`): spam and the
 *    AI holding part of its hand, each against the full AI.
 * It passes a level when the window is open (the floor at or under the aim)
 * and the full AI is clearly ahead of spam and of attacks alone (`edgeHolds`).
 * What a rule that pays defending could break is read beside it, at the same
 * PV: the other dumb strategies against the AI (only defending, any legal
 * card) and the triangle's three edges.
 */
import { DiceRoll } from '@pimpampum/engine';
import { HAND_STYLES, styleDuel, theSet, type DuelStyle, type Variant } from '@pimpampum/bench';
import type { CensusCard } from './census.js';
import { realWindow, type LevelWindow } from './derive-class-pv.js';
import type { LadderRung } from './feasibility.js';
import { installSet, type RunContext } from './prepare.js';
import { edgeHolds } from './rules.js';
import { TWIN_DEFAULTS, vanillaPrint, vanillaTwin, withVanillaSet } from './vanilla.js';

export interface DefenseRule {
  id: string;
  /** The rule as a player follows it at the table. */
  says: string;
  rules: Pick<Variant, 'guardSpend' | 'holdReturns' | 'guardCoversDefender'>;
}

const SPENDS: readonly Pick<DefenseRule, 'id' | 'says' | 'rules'>[] = [
  { id: 'today', says: 'A blow uses up as much of the defense it meets as it threw (the rule since 2026-11-13).', rules: {} },
  { id: 'half', says: 'A blow uses up half of what it threw, rounded down.', rules: { guardSpend: 0.5 } },
  { id: 'whole', says: 'Every blow meets the whole defense roll (as before 2026-11-13, without Envoltat).', rules: { guardSpend: 0 } },
];
/** What step a of the goal suggested, each on top of a spend. */
const ADDED: readonly Pick<DefenseRule, 'id' | 'says' | 'rules'>[] = [
  { id: '', says: '', rules: {} },
  { id: 'margin', says: 'The loser of a contest takes the margin: a defense that holds a blow hurts the attacker by the difference.', rules: { holdReturns: 1 } },
  { id: 'both', says: 'A defense that guards an ally still covers its player (as before 2026-11-02).', rules: { guardCoversDefender: true } },
  { id: 'margin+both', says: 'The loser of a contest takes the margin, and a defense that guards an ally still covers its player.', rules: { holdReturns: 1, guardCoversDefender: true } },
];

export const DEFENSE_RULES: readonly DefenseRule[] = SPENDS.flatMap(spend => ADDED.map(added => ({
  id: [spend.id, added.id].filter(Boolean).join('+'),
  says: [spend.says, added.says].filter(Boolean).join(' '),
  rules: { ...spend.rules, ...added.rules },
})));

/** The styles set against the full AI, in the order the report prints them. */
export const HAND_WORTH_STYLES: readonly DuelStyle[] = ['spam', ...HAND_STYLES];

export interface RuleCell {
  rule: string; content: 'kits' | 'twins'; level: number;
  window: Pick<LevelWindow, 'floor' | 'aim' | 'ceiling' | 'floorCards'>;
  /** The PV the hand was measured at: the aim's, or (no aim) the smallest searched. */
  pv: number;
  /** How fights ran at that PV: rounds (median, 9 in 10) and the share that never ended. */
  median: number; p90: number; stalls: number;
  /** Each style's score against the full AI at that PV. */
  hand: { style: DuelStyle; score: number; games: number }[];
  /** The other dumb strategies against the full AI at that PV, and the share of those fights that never ended. */
  dumb: { style: DuelStyle; score: number; stalls: number; games: number }[];
  /** The triangle at that PV: the claimed winner's score on each edge. */
  triangle: { edge: string; score: number; games: number }[];
}

/** The dumb strategies the hand-worth styles do not already hold. */
const OTHER_DUMB: readonly DuelStyle[] = ['turtle', 'random'];
const EDGES: readonly [DuelStyle, DuelStyle][] = [['Power', 'Protect'], ['Protect', 'Aggro'], ['Aggro', 'Power']];

/** Does every other dumb strategy clearly lose to the full AI? */
export const dumbLoses = (c: Pick<RuleCell, 'dumb'>): boolean => c.dumb.every(d => edgeHolds(1 - d.score, d.games));

/** Is the window open: a PV with quick fights and no knockout without an answer? */
export const windowOpen = (c: Pick<RuleCell, 'window'>): boolean => c.window.aim !== null && c.window.floor <= c.window.aim;

/** Is the full AI clearly ahead of spam and of attacks alone? */
export function handBeatsAttacking(c: Pick<RuleCell, 'hand'>): boolean {
  return (['spam', 'attacks'] as const).every(style => {
    const d = c.hand.find(h => h.style === style);
    return !!d && edgeHolds(1 - d.score, d.games);
  });
}

/** What builds the vanilla twins in a child process: the census and the ladder, as notation. */
export interface TwinRecipe { cards: readonly CensusCard[]; ladder: Record<number, { attack: string; defense: string }> }

function measureCell(rule: DefenseRule, level: number, fights: number, duels: number, content: RuleCell['content'], given?: { kits: readonly string[]; print: string }): RuleCell {
  const w = realWindow(level, fights, { rules: rule.rules, given, blameCeiling: false });
  const pv = w.aim ?? 1;
  const at = w.measured.find(m => m.pv === pv);
  const hand = HAND_WORTH_STYLES.map(style => {
    const d = styleDuel(style, 'ai', level, duels, undefined, { ...rule.rules, pv }, given);
    return { style, score: d.score, games: d.games };
  });
  const dumb = OTHER_DUMB.map(style => {
    const d = styleDuel(style, 'ai', level, duels, undefined, { ...rule.rules, pv }, given);
    return { style, score: d.score, stalls: d.stalls, games: d.games };
  });
  const triangle = EDGES.map(([x, y]) => {
    const d = styleDuel(x, y, level, duels, undefined, { ...rule.rules, pv }, given);
    return { edge: `${x} > ${y}`, score: d.score, games: d.games };
  });
  return {
    rule: rule.id, content, level, window: { floor: w.floor, aim: w.aim, ceiling: w.ceiling, floorCards: w.floorCards }, pv,
    median: at?.median ?? 0, p90: at?.p90 ?? 0, stalls: at?.stalls ?? 0, hand, dumb, triangle,
  };
}

/** One candidate at one level, in a child process (bench `isolated`): on the
 *  real kits, or on their twins when a recipe is given. */
export async function defenseRuleCell(set: RunContext['set'], ruleId: string, level: number, fights: number, duels: number, twins?: TwinRecipe): Promise<RuleCell> {
  await installSet(set);
  const rule = DEFENSE_RULES.find(r => r.id === ruleId);
  if (!rule) throw new Error(`defenseRuleCell: no rule '${ruleId}' (${DEFENSE_RULES.map(r => r.id).join(', ')})`);
  if (!twins) return measureCell(rule, level, fights, duels, 'kits');
  const rungs: Record<number, LadderRung> = Object.fromEntries(Object.entries(twins.ladder).map(([l, r]) => [l, { attack: DiceRoll.parse(r.attack), defense: DiceRoll.parse(r.defense) }]));
  const kits = theSet().calibration.mainKits.map(k => vanillaTwin(k, twins.cards, rungs, TWIN_DEFAULTS));
  const print = `${kits.map(vanillaPrint).join('|')}#${JSON.stringify(TWIN_DEFAULTS)}`;
  return withVanillaSet(kits, () => measureCell(rule, level, fights, duels, 'twins', { kits: kits.map(k => k.id), print }));
}
