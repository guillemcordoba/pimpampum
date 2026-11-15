/**
 * CANDIDATE RULES FOR HOW DEFENSES MEET ATTACKS, MEASURED (the user,
 * 2026-11-14: "exploring alternative rules that tune how defense cards go
 * against attacks, so that we can find a PV that fulfills both quick fights
 * and no one hit ko"). A candidate is the engine's options (bench `Variant`)
 * and, for one family, the defenses' place on the ladder: no card text and no
 * PV table moves.
 *
 * NO CANDIDATE MAKES A BLOCK PAY (the user, 2026-11-15, of "the loser of a
 * contest takes the margin": "so anti lore, we can't do it"; of an opening,
 * the initiative or a stagger for whoever holds a blow: "could be unique card
 * effects, I don't like any of them as general rules"). What a block pays is
 * each card's own; the twins' `riposte` and `riposteDrop` say how much that
 * has to be.
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
 *
 * `defenseRuleScreen` is the same reading without the searches that cost the
 * hours: the aim alone, walked to from a PV near it, and whether a knockout
 * without an answer shows at that PV.
 */
import { DiceRoll } from '@pimpampum/engine';
import { HAND_STYLES, kitsDynamics, styleDuel, theSet, type DuelStyle, type Variant } from '@pimpampum/bench';
import type { CensusCard } from './census.js';
import { aimNear, realWindow, type LevelWindow } from './derive-class-pv.js';
import { MAX_UNANSWERABLE_KOS } from './derive-pv.js';
import { summarise } from './dynamics.js';
import type { LadderRung } from './feasibility.js';
import { shiftDefenses } from './fixes.js';
import { installSet, type RunContext } from './prepare.js';
import { edgeHolds } from './rules.js';
import { TWIN_DEFAULTS, vanillaPrint, vanillaTwin, withVanillaSet, type TwinParams } from './vanilla.js';

export interface DefenseRule {
  id: string;
  /** The rule as a player follows it at the table. */
  says: string;
  rules: Pick<Variant, 'guardSpend' | 'envoltat' | 'guardCoversDefender'>;
  /** Every Defense card's dice this many rungs up the ladder (in the measurement only). */
  defenseShift?: number;
}

type Part = Pick<DefenseRule, 'id' | 'says' | 'rules' | 'defenseShift'>;
const MEETS: readonly Part[] = [
  { id: 'today', says: 'A blow uses up as much of the defense it meets as it threw (the rule since 2026-11-13).', rules: {} },
  { id: 'half', says: 'A blow uses up half of what it threw, rounded down.', rules: { guardSpend: 0.5 } },
  { id: 'whole', says: 'Every blow meets the whole defense roll.', rules: { guardSpend: 0 } },
  { id: 'envoltat', says: 'Every blow meets a defense roll of its own; with n blows on a body its defense rolls n times against each and keeps the worst (the rule until 2026-11-13).', rules: { guardSpend: 0, envoltat: true } },
];
const ADDED: readonly Part[] = [
  { id: '', says: '', rules: {} },
  { id: 'both', says: 'A defense that guards an ally still covers its player (as before 2026-11-02).', rules: { guardCoversDefender: true } },
  { id: 'rung', says: 'Every Defense card rolls one rung higher on the ladder.', rules: {}, defenseShift: 1 },
];

export const DEFENSE_RULES: readonly DefenseRule[] = MEETS.flatMap(meets => ADDED.map(added => ({
  id: [meets.id, added.id].filter(Boolean).join('+'),
  says: [meets.says, added.says].filter(Boolean).join(' '),
  rules: { ...meets.rules, ...added.rules },
  ...(added.defenseShift ? { defenseShift: added.defenseShift } : {}),
})));

/** The styles set against the full AI, in the order the report prints them. */
export const HAND_WORTH_STYLES: readonly DuelStyle[] = ['spam', ...HAND_STYLES];

interface Duel { style: DuelStyle; score: number; games: number }

export interface RuleCell {
  rule: string; content: 'kits' | 'twins'; level: number;
  window: Pick<LevelWindow, 'floor' | 'aim' | 'ceiling' | 'floorCards'>;
  /** The PV the hand was measured at: the aim's, or (no aim) the smallest searched. */
  pv: number;
  /** How fights ran at that PV: rounds (median, 9 in 10) and the share that never ended. */
  median: number; p90: number; stalls: number;
  /** Each style's score against the full AI at that PV. */
  hand: Duel[];
  /** The other dumb strategies against the full AI at that PV, and the share of those fights that never ended. */
  dumb: (Duel & { stalls: number })[];
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
export function handBeatsAttacking(c: { hand: readonly Duel[] }): boolean {
  return (['spam', 'attacks'] as const).every(style => {
    const d = c.hand.find(h => h.style === style);
    return !!d && edgeHolds(1 - d.score, d.games);
  });
}

/** What builds the vanilla twins in a child process: the census and the
 *  ladder, as notation, and the twins' numbers where they are not the defaults. */
export interface TwinRecipe {
  cards: readonly CensusCard[];
  ladder: Record<number, { attack: string; defense: string }>;
  params?: Partial<TwinParams>;
}

type Given = { kits: readonly string[]; print: string };

const duelsAt = (styles: readonly DuelStyle[], level: number, duels: number, variant: Variant, given?: Given) => styles.map(style => {
  const d = styleDuel(style, 'ai', level, duels, undefined, variant, given);
  return { style, score: d.score, stalls: d.stalls, games: d.games };
});

function measureCell(rule: DefenseRule, level: number, fights: number, duels: number, content: RuleCell['content'], given?: Given): RuleCell {
  const w = realWindow(level, fights, { rules: rule.rules, given, blameCeiling: false });
  const pv = w.aim ?? 1;
  const at = w.measured.find(m => m.pv === pv);
  const variant = { ...rule.rules, pv };
  const triangle = EDGES.map(([x, y]) => {
    const d = styleDuel(x, y, level, duels, undefined, variant, given);
    return { edge: `${x} > ${y}`, score: d.score, games: d.games };
  });
  return {
    rule: rule.id, content, level, window: { floor: w.floor, aim: w.aim, ceiling: w.ceiling, floorCards: w.floorCards }, pv,
    median: at?.median ?? 0, p90: at?.p90 ?? 0, stalls: at?.stalls ?? 0,
    hand: duelsAt(HAND_WORTH_STYLES, level, duels, variant, given), dumb: duelsAt(OTHER_DUMB, level, duels, variant, given), triangle,
  };
}

export interface ScreenCell {
  rule: string; content: 'kits' | 'twins'; level: number;
  /** The aim found near the start PV (null: none down to the smallest), and how fights ran there. */
  aim: number | null; median: number; p90: number; stalls: number;
  /** The worst card's share of plays felling a fresh hero without an answer at that PV, and whether it is within the bar. */
  unanswerable: number; answered: boolean;
  hand: Duel[];
  /** Only defending against the full AI, and the share of those fights that never ended. */
  turtle: Duel & { stalls: number };
}

/** Does a screened cell pass: quick fights with no knockout without an answer, and the hand clearly ahead of attacking? */
export const screenPasses = (c: ScreenCell): boolean => c.aim !== null && c.answered && handBeatsAttacking(c);

function screenCell(rule: DefenseRule, level: number, fights: number, duels: number, startPV: number, content: ScreenCell['content'], given?: Given): ScreenCell {
  const aim = aimNear(level, fights, startPV, { rules: rule.rules, given });
  const pv = aim ?? 1;
  const at = summarise(kitsDynamics(level, fights, { ...rule.rules, pv }, given));
  const variant = { ...rule.rules, pv };
  return {
    rule: rule.id, content, level, aim, median: at.median, p90: at.p90, stalls: at.stallRate,
    unanswerable: at.unanswerableKOs, answered: at.unanswerableKOs <= MAX_UNANSWERABLE_KOS,
    hand: duelsAt(HAND_WORTH_STYLES, level, duels, variant, given), turtle: duelsAt(['turtle'], level, duels, variant, given)[0],
  };
}

/** The rule's content transform and kits, then `measure` on them: the real
 *  kits, or their twins when a recipe is given. */
async function onContent<T>(set: RunContext['set'], ruleId: string, twins: TwinRecipe | undefined, measure: (rule: DefenseRule, content: 'kits' | 'twins', given?: Given) => T): Promise<T> {
  await installSet(set);
  const rule = DEFENSE_RULES.find(r => r.id === ruleId);
  if (!rule) throw new Error(`no defense rule '${ruleId}' (${DEFENSE_RULES.map(r => r.id).join(', ')})`);
  const shift = rule.defenseShift ?? 0;
  if (!twins) {
    shiftDefenses(shift);
    return measure(rule, 'kits');
  }
  const rungs: Record<number, LadderRung> = Object.fromEntries(Object.keys(twins.ladder).map(Number).map(l => [l, {
    attack: DiceRoll.parse(twins.ladder[l].attack), defense: DiceRoll.parse(twins.ladder[Math.max(1, Math.min(10, l + shift))].defense),
  }]));
  const params = { ...TWIN_DEFAULTS, ...twins.params };
  const kits = theSet().calibration.mainKits.map(k => vanillaTwin(k, twins.cards, rungs, params));
  const print = `${kits.map(vanillaPrint).join('|')}#${JSON.stringify(params)}`;
  return withVanillaSet(kits, () => measure(rule, 'twins', { kits: kits.map(k => k.id), print }));
}

/** One candidate at one level, in a child process (bench `isolated`): on the
 *  real kits, or on their twins when a recipe is given. */
export function defenseRuleCell(set: RunContext['set'], ruleId: string, level: number, fights: number, duels: number, twins?: TwinRecipe): Promise<RuleCell> {
  return onContent(set, ruleId, twins, (rule, content, given) => measureCell(rule, level, fights, duels, content, given));
}

/** One candidate at one level, screened (`ScreenCell`), in a child process. */
export function defenseRuleScreen(set: RunContext['set'], ruleId: string, level: number, fights: number, duels: number, startPV: number, twins?: TwinRecipe): Promise<ScreenCell> {
  return onContent(set, ruleId, twins, (rule, content, given) => screenCell(rule, level, fights, duels, startPV, content, given));
}
