/**
 * WHICH CARD IS IT? — a failing verdict, re-measured once per card with that
 * card taken out of hand, ranked by how far each removal moves the failing
 * number toward passing.
 *
 * Found by hand first: the triangle's Aggro > Power edge went even, and taking
 * each Power card out in turn showed Rugit de guerra and Cures de camp holding
 * it up (NEXT-STEPS §36). A failing check should say that itself, so the kit
 * suite and the triangle test attach this ranking to their failure messages.
 *
 * Content-agnostic: cards are named by id, taken out of hands
 * (`CellSetup.withoutCard`, the `prepare` hook of `headToHead`), never edited.
 * The holder keeps its skill, its level and every other card.
 */
import type { ActionDefinition } from '@pimpampum/engine';
import { dropCard, games as sized, headToHead, mirrorParty, theSet, triangleStyles } from '@pimpampum/bench';
import { analyze, cardsOf, type AnalyzeBudget, type KitReport, type Subject } from './analyze.js';

export interface Culprit {
  card: string;
  /** The failing number with every card, and without this one. */
  before: number;
  after: number;
  /** How far removing it moves the number toward passing; positive = this card
   *  is part of the problem. */
  shift: number;
}

/** Rank by shift, biggest culprit first. */
const ranked = (cs: Culprit[]): Culprit[] => cs.sort((a, b) => b.shift - a.shift);

/** Every distinct card the mirror party holds, but last-resort cards. */
function partyCards(): ActionDefinition[] {
  const seen = new Map<string, ActionDefinition>();
  for (const c of theSet().buildParty(mirrorParty())) {
    for (const a of c.actions) if (!a.def.lastResort) seen.set(a.def.id, a.def);
  }
  return [...seen.values()];
}

/**
 * A triangle edge that should hold and does not: which of the LOSING style's
 * cards keep it from losing? Each is taken out of every hand on the losing
 * side, and the edge re-measured; the shift is the winner's gain.
 */
export function blameEdge(winner: string, loser: string, games = sized(400)): Culprit[] {
  const styles = Object.fromEntries(triangleStyles().map(s => [s.name, s.chooser]));
  if (!styles[winner] || !styles[loser]) throw new Error(`blameEdge: no style '${winner}' or '${loser}'.`);
  const before = headToHead(styles[winner], styles[loser], games).winrate;
  return ranked(partyCards().map(card => {
    const after = headToHead(styles[winner], styles[loser], games, undefined,
      (_w, l) => dropCard(l, card.id)).winrate;
    return { card: card.id, before, after, shift: after - before };
  }));
}

/** The kit requirements a removal can be judged on. */
export type BlameRequirement = 'strength' | 'duration';

/** The failing number, signed so that a SMALLER value is closer to passing. */
function badness(r: KitReport, requirement: BlameRequirement, above: boolean): number {
  if (requirement === 'strength') return above ? r.fullKit.delta : -r.fullKit.delta;
  return r.fullKit.p90Rounds + 100 * r.fullKit.stallRate;
}

/**
 * A kit failing requirement 1 or 2: which of its cards is it? Each card is
 * taken out of the subject's hand and the kit re-measured (without the card
 * value, which neither requirement reads).
 *
 * Out of band ABOVE, a card is a culprit if removing it lowers the delta; out
 * of band BELOW, if removing it raises it (dead weight). Fights that do not
 * end: if removing it shortens them.
 */
export function blameKit(
  subject: Subject, requirement: BlameRequirement, games: number, budget: AnalyzeBudget = {},
): Culprit[] {
  const cheap: AnalyzeBudget = { ...budget, skip: ['cardValue'] };
  const full = analyze(subject, games, cheap);
  const above = (full.fullKit.delta ?? 0) > 0;
  const before = badness(full, requirement, above);
  return ranked(cardsOf(subject)
    .filter(c => !c.lastResort && c.actionType !== undefined)
    .map(card => {
      const after = badness(analyze(subject, games, { ...cheap, withoutCard: card.id }), requirement, above);
      return { card: card.id, before, after, shift: before - after };
    }));
}

/** The ranking in words, for a failure message. */
export function showCulprits(cs: Culprit[], top = 3, unit = ''): string {
  return cs.slice(0, top)
    .map(c => `${c.card} (${c.shift >= 0 ? '+' : ''}${unit === '%' ? (100 * c.shift).toFixed(1) + 'pp' : c.shift.toFixed(2)})`)
    .join(', ');
}

