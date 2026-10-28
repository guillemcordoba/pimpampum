/**
 * THE AUDIT'S DEFECTS AS PUZZLES — one small position per mismatch the
 * overnight AI audit kept finding (NEXT-STEPS §51-52), each built from
 * made-up cards so its right answer follows from arithmetic alone.
 *
 * Every puzzle is asserted TWICE: the referee (`audit/referee.ts`, a Nash
 * solver that plays the fight to its real end) must agree with the arithmetic
 * — that is what keeps the puzzle honest — and then the production AI must
 * find the same play. Dice are fixed (`Nd1` always rolls N) and levels are 0,
 * so the arithmetic in each comment is exact.
 *
 * A puzzle the AI still fails is `it.fails`: the fast tier stays green while
 * the defect is open, and the day the AI is fixed the `.fails` turns red and
 * has to be removed — so a fix cannot land without the puzzle noticing.
 */
import { describe, it, expect } from 'vitest';
import {
  CombatEngine, DiceRoll, EffectRegistry, withSeed,
  type ActionDefinition, type Character, type StatusBehavior,
} from '@pimpampum/engine';
import { attackCard, fighter, focusCard } from '@pimpampum/engine/testing';
import { aiPolicy, bestResponse, DEFAULT_LOOKAHEAD, rolloutOdds, selectAction } from '../src/index.js';
import { aiPicks, buildEngine, CONTROLS, Referee, type CardSpec, type FighterSpec, type Position } from '../src/audit/index.js';

// --- positions in the audit's own vocabulary --------------------------------

/** A fixed-dice card; `fast` exactly where the puzzle needs it to go first. */
const fixed = (arch: string, n: number, fast = false, extra: Record<string, number> = {}): CardSpec =>
  ({ arch, p: { n, s: 1, fast: fast ? 1 : 0, fatigue: 0, ...extra } });
const body = (name: string, pv: number, cards: CardSpec[], maxPv = pv): FighterSpec =>
  ({ name, maxPv, pv, armour: 0, level: 0, fatigue: 0, cards });
const position = (id: string, roundsLeft: number, us: FighterSpec[], them: FighterSpec[]): Position =>
  ({ id, roundsLeft, teams: [us, them], tags: { shape: `${us.length}x${them.length}`, horizon: roundsLeft, side: 'hero' } });

/** The referee's pure answer for team 0, as archetype names per acting seat. */
function refereeAnswer(pos: Position): { cards: string; p: number } {
  const engine = buildEngine(pos, { actionChooser: () => null });
  const root = new Referee().solve(engine, 0);
  const team = engine.teams[0];
  const byCards = new Map<string, number>();
  root.rows.forEach((r, i) => {
    const k = r.map(x => team[x.idx].actions[x.actionIdx].def.id.split('.')[0]).join(',');
    byCards.set(k, (byCards.get(k) ?? 0) + root.sol.row[i]);
  });
  const [cards, p] = [...byCards].sort((a, b) => b[1] - a[1])[0];
  return { cards, p };
}

/** What the production AI plays for team 0, per seed (the audit's own check). */
function aiAnswer(pos: Position): string[] {
  const engine = buildEngine(pos, { actionChooser: () => null });
  const out: string[] = [];
  for (const { actions, count } of aiPicks(pos, 4).values()) {
    const acting = engine.teams[0].filter(c => c.currentPV > 0);
    const k = actions.map((a, s) => acting[s].actions[a].def.id.split('.')[0]).join(',');
    for (let i = 0; i < count; i++) out.push(k);
  }
  return out;
}

// (a) STUN — a lost turn is invisible to a leaf scored at the end of the round
// it was inflicted in. Stun now: the foe's 10 still lands this round, its next
// is lost, then a strike: hero 10, foe 30−3−4 = 23 → −13. Strike twice: the
// hero takes 20 and falls, foe 22 → −22.
const STUN = position('stun', 2,
  [body('H', 20, [fixed('strike', 4), fixed('stun', 3)])],
  [body('F', 30, [fixed('strike', 10)])]);

// (b) DELAYED DAMAGE, UNPRICED — the audit's `bomb-long-unpriced` control: the
// 8 lands as round 2 opens, after the leaf was read. Bomb then strike: foe 19,
// hero 14 → −5. Strikes only: foe 24 → −10.
const BOMB = CONTROLS.find(c => c.position.id === 'bomb-long-unpriced')!.position;

// (c) REVIVE — the raised body's worth is what it does NEXT round. Revive B (3
// PV) now, then A and B strike 12 each for two rounds: 48 ≥ 40, the foe falls
// in round 3. Strike three times instead: 36, the foe stands on 4 and B stays
// down. The leaf sees only 3 PV and one more body. The revive is fast, so the
// foe's blow cannot interrupt it.
const REVIVE = position('revive', 3,
  [body('A', 10, [fixed('strike', 12), { arch: 'revive', p: { amount: 3, fast: 1 } }]),
    body('B', 0, [fixed('strike', 12)], 40)],
  [body('F', 40, [fixed('strike', 1)])]);

describe('audit defects as puzzles: the referee agrees with the arithmetic', () => {
  it('(a) stun: take the next turn, not 1 more PV', () => expect(refereeAnswer(STUN)).toEqual({ cards: 'stun', p: 1 }));
  it('(b) unpriced delayed damage: plant the bomb', () => expect(refereeAnswer(BOMB)).toEqual({ cards: 'bomb', p: 1 }));
  it('(c) revive: raise the hitter, not one more blow', () => expect(refereeAnswer(REVIVE)).toEqual({ cards: 'revive', p: 1 }));
});

describe('audit defects as puzzles: the production AI', () => {
  it('(a) stun', () => expect(aiAnswer(STUN)).toEqual(Array(4).fill('stun')));
  it('(b) unpriced delayed damage', () => expect(aiAnswer(BOMB)).toEqual(Array(4).fill('bomb')));
  it('(c) revive', () => expect(aiAnswer(REVIVE)).toEqual(Array(4).fill('revive')));
});

// --- (d) FOCUS FIRE ----------------------------------------------------------
//
// Two heroes, two foes, two rounds. Small (20 PV) mauls for 15; Big (100 of
// 200 PV) clubs for 12; both go for H1, who is on 14. H0 can strike (12, fast)
// or guard H1 (10). H1 strikes (fast).
//   strike: both strikes on Small fell it before it swings; Big's 12 leaves
//           H1 on 2. Next round Big alone. Small is gone for good.
//   guard:  Small and Big land 5 and 2 through the guard; H1 hits Big. Next
//           round both foes swing again and H1 falls.
// No single strike kills Small, so the aim rule the rollouts use — a kill
// bonus only when ONE blow makes it, otherwise the more WOUNDED FRACTION (Big,
// at half) — sends both rollout strikes at Big, and the strike looks like 24
// PV off a 200-PV body while H1 dies.
const FOCUS = position('focus-fire', 2,
  [body('H0', 30, [fixed('strike', 12, true), fixed('guard', 10)]),
    body('H1', 14, [fixed('strike', 12, true)], 30)],
  [body('Big', 100, [fixed('strike', 12)], 200),
    body('Small', 20, [fixed('strike', 15)])]);

describe('audit defects as puzzles: focus fire', () => {
  it('(d) the referee strikes with both', () => expect(refereeAnswer(FOCUS)).toEqual({ cards: 'strike,strike', p: 1 }));
  it('(d) the AI strikes with both', () => expect(aiAnswer(FOCUS)).toEqual(Array(4).fill('strike,strike')));
});

// --- (e) THE TWO EARLIER MISMATCHES (NEXT-STEPS §49) -------------------------

/** Dodge every blow this round. */
const HIDDEN: StatusBehavior = { modifyIncomingDamage: () => 0 };
/** Attacks against the holder +20 until the end of next round, priced like a
 *  cautious content author would price a small exposure (a terra: −0.1). */
const EXPOSED: StatusBehavior = { attackRollAgainstHolder: () => 20, positionValue: () => -0.1 };

function inlineRegistry(): EffectRegistry {
  const r = new EffectRegistry();
  r.register('hide', {
    getTargetRequirement: () => 'none',
    onResolve(ctx) { ctx.source.setStatus('hidden', 1, 1, undefined, HIDDEN); },
  });
  r.register('expose', {
    onAttackHit(ctx) { if (ctx.target && (ctx.damageDealt ?? 0) > 0) ctx.target.setStatus('exposed', 20, 2, undefined, EXPOSED); },
  });
  return r;
}
const hide: ActionDefinition = focusCard('hide', { fast: true, effects: [{ type: 'hide' }] });

// (e1) THE OPPONENT MODEL NEVER HIDES. The rollouts play the other side with
// the depth-0 heuristic, which prices an attack by its damage and a Focus at a
// flat 1.2. A foe on 10 PV facing a 20-point slam can claw for 6 and die, or
// hide and lose nothing: hiding is strictly better (the referee: hide, p = 1).
// The heuristic claws ~98% of the time, so the search plans against a foe that
// walks into the slam — the real goblins hid 43% of the time, the model 1%.
function hideEngine(policy: { actionChooser: CombatEngine['actionChooser'] }) {
  const foe = fighter('Foe', [attackCard('claw', { dice: new DiceRoll(6, 1) }), hide], { pv: 10, ai: true });
  const hero = fighter('Hero', [attackCard('slam', { dice: new DiceRoll(20, 1) })], { pv: 30, ai: true });
  return { engine: new CombatEngine([foe], [hero], { registry: inlineRegistry(), maxRounds: 4, ...policy }), foe };
}

// (e2) A STATUS PRICED BELOW WHAT IT DOES. Two rounds left; foe on 100. Trip
// (1) exposes it to +20 on the next round's blow: 1 + 35 = 36. Strike twice:
// 30. The −0.1 price says the exposure is worth one PV of a 100-PV foe.
function exposeEngine(policy: { actionChooser: CombatEngine['actionChooser'] }, maxRounds: number) {
  const hero = fighter('Hero', [
    attackCard('strike', { dice: new DiceRoll(15, 1) }),
    attackCard('trip', { dice: new DiceRoll(1, 1), effects: [{ type: 'expose' }] }),
  ], { pv: 20, ai: true });
  const foe = fighter('Foe', [attackCard('poke')], { pv: 100, ai: true });
  return { engine: new CombatEngine([hero], [foe], { registry: inlineRegistry(), maxRounds, ...policy }), hero };
}

// (e1b) …AND THE SEARCH THEREFORE NEVER BREAKS A HIDE (§49.3's Trampolí, in
// miniature). One round; the foe (10 PV) holds a claw that cannot hurt them
// (a 0 blow: it was a slow claw the strikes always beat, and there is no slow
// any more) and a hide (fast). H1 slams for 20. H0 jabs for 1 (fast — ahead
// of the fast hide, it breaks it) or strikes for 8, a normal blow that lands
// after it.
//   jab:    the hide never happens; the slam fells the foe → 60 − 0 = 60.
//   strike: if the foe hides, nothing wounds it → 60 − 10 = 50; if it claws,
//           the strike and slam fell it → 60.
// The foe loses nothing by hiding and the claw never matters, so in every
// equilibrium it hides with some chance and the jab is the only answer. A
// model in which the foe always claws sees the two as equal and keeps the
// heuristic's pick, the strike.
const BREAK_HIDE = position('break-hide', 1,
  [body('H0', 30, [fixed('strike', 8), fixed('jab', 1, true)]), body('H1', 30, [fixed('strike', 20)])],
  [body('F', 10, [fixed('strike', 0), { arch: 'hide', p: { fast: 1 } }])]);

describe('audit defects as puzzles: breaking a hide', () => {
  it('(e1b) the referee jabs', () => expect(refereeAnswer(BREAK_HIDE)).toEqual({ cards: 'jab,strike', p: 1 }));
  it('(e1b) the AI jabs', () => expect(aiAnswer(BREAK_HIDE)).toEqual(Array(4).fill('jab,strike')));
});

describe('audit defects as puzzles: the two earlier mismatches', () => {
  it('(e1) the referee hides', () => {
    const { engine, foe } = hideEngine({ actionChooser: () => null });
    const root = new Referee().solve(engine, 0);
    const hid = root.rows.reduce((s, r, i) => s + (foe.actions[r[0].actionIdx].def.id === 'hide' ? root.sol.row[i] : 0), 0);
    expect(hid).toBeCloseTo(1, 6);
  });

  // The model that matters is the one the SEARCH's rollouts play the foe with
  // (`rolloutOdds`), not the depth-0 policy on its own, which still claws.
  it('(e1) the opponent model hides at least half the time', () => {
    const { engine, foe } = hideEngine({ actionChooser: (e, a) => selectAction(e, a).actionIdx });
    engine.prepareRound();
    const odds = rolloutOdds(engine, foe);
    const hid = odds.indices.reduce((s, idx, k) => s + (foe.actions[idx].def.id === 'hide' ? odds.weights[k] / odds.total : 0), 0);
    expect(hid).toBeGreaterThanOrEqual(0.5);
  });

  it('(e2) the referee trips', () => {
    const { engine, hero } = exposeEngine({ actionChooser: () => null }, 2);
    const root = new Referee().solve(engine, 0);
    const tripped = root.rows.reduce((s, r, i) => s + (hero.actions[r[0].actionIdx].def.id === 'trip' ? root.sol.row[i] : 0), 0);
    expect(tripped).toBeCloseTo(1, 6);
  });

  it('(e2) the AI trips', () => {
    const chosen: string[] = [];
    for (let s = 0; s < 8; s++) {
      withSeed(s, () => {
        // One round more than the referee, as the audit shows the AI (check.ts).
        const { engine, hero } = exposeEngine(aiPolicy({ depth: 0 }), 3);
        engine.prepareRound();
        chosen.push(hero.actions[bestResponse(engine, 0, DEFAULT_LOOKAHEAD).choices.get(hero)!].def.id);
      });
    }
    expect(chosen).toEqual(Array(8).fill('trip'));
  });
});



// --- (f) THE CONTROLS, ASKED OF THE AI ---------------------------------------
//
// The referee is held to every control in `audit.test.ts`; the AI is asked
// them here. `bomb-short` failed after the `tempo` leaf: a bomb that fells the
// foe as next round opens was scored as a win PLUS next round's blows, above
// the strike that fells it now (§52.6).
describe('audit defects as puzzles: the AI plays every control\'s answer', () => {
  for (const c of CONTROLS) {
    it(`(f) ${c.position.id}: ${c.answer}`, () => expect(aiAnswer(c.position)).toEqual(Array(4).fill(c.answer)));
  }
});

// --- (g) THE REFEREE'S CURRENCY (§52.6) ---------------------------------------
//
// One round. H0 (4 of 40 PV) can strike the boss for 6 or guard itself (10
// against its 5). H1 (40) strikes for 6. The boss hits one of them for 5.
// The referee pays PV: killing H0 is worth 4 to the boss, hitting H1 worth 5,
// so it hits H1 whatever H0 does and H0's guard saves nothing — strike.
// The AI's leaf prices a BODY (its bodies term; the fractions add to it), so
// its model of the boss takes the kill, and it guards — still with the PV term
// in absolute PV; only without the bodies term does it strike. Which is right
// depends on the currency, not on play: a cut fight paid in PV cannot see the
// turns a fallen hero no longer takes. Moving the AI toward the referee's
// currency (absolute PV) wins the night's replay (−3.6pp of ruled-out picks)
// and turns the reference party's 69.5% against a basilisk into 14.1%.
// Pinned both ways so a change to either side is seen.
const CURRENCY = position('currency', 1,
  [body('H0', 4, [fixed('strike', 6), fixed('guard', 10)], 40), body('H1', 40, [fixed('strike', 6)])],
  [body('Boss', 200, [fixed('strike', 5)])]);

describe('audit defects as puzzles: the referee pays PV, the AI health fractions', () => {
  it('(g) the referee strikes', () => expect(refereeAnswer(CURRENCY)).toEqual({ cards: 'strike,strike', p: 1 }));
  it('(g) the AI guards the body', () => expect(aiAnswer(CURRENCY)).toEqual(Array(4).fill('guard,strike')));
});
