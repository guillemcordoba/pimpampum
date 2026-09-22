// bench-exempt(depth): these are mechanics assertions about the SEARCH, on
// hand-built positions with scripted state. There is no sample size and no
// winrate here — a depth would be noise in the diff rather than information.
/**
 * WHERE THE AI DISAGREES WITH THE RULES.
 *
 * `tests/ai-strength.test.ts` asks whether the AI plays WELL, which needs
 * thousands of combats and an opponent ladder. This file asks a cheaper and
 * sharper question: does the AI's model of the game match the game? The engine
 * is ground truth for that, so these are deterministic and cost nothing.
 *
 * It is also the only class of AI defect §16.1 lets us fix outright. "The AI
 * may be corrected where it DISAGREES WITH THE RULES; it may not be tuned until
 * the tests go green." A weight has no ground truth and does not belong here. A
 * prediction that contradicts what the engine actually does is simply wrong,
 * and no amount of tuning makes it right.
 *
 * Every defect the project has found in the AI so far is of this kind — the
 * roll estimate that forgot `skillLevelBonus`, the AoE priced as single-target,
 * the `restrictTo` that leaked through the pruner (§16), the double-prepared
 * round below (§20.4). None would have been caught by a winrate.
 */
import { describe, it, expect } from 'vitest';
import {
  type ActionDefinition, ActionType, type Character, CombatEngine, createCharacter,
  DiceRoll, EffectRegistry, firstLegalChooser, withSeed,
} from '@pimpampum/engine';
import {
  estimateExpectedDamage, expectedAttackTotal, lookaheadChooser, positionScore,
} from '@pimpampum/ai';
import { valuePosition } from '@pimpampum/bench';

function act(id: string, actionType: ActionType, over: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id, name: id, skillId: 'probe', unlockLevel: 0, actionType,
    speed: 1, dice: new DiceRoll(1, 1), effects: [], description: '', iconPath: '',
    ...over,
  };
}

const atk = (id: string) => act(id, ActionType.Atac);

const fighter = (name: string) => createCharacter({
  name, pv: 10, classCss: 'x', skills: { probe: 1 }, actions: [atk('a1'), atk('a2')],
});

/** A combat with one fighter a side, no content handlers. */
function arena(): { engine: CombatEngine; hero: ReturnType<typeof fighter>; villain: ReturnType<typeof fighter> } {
  const hero = fighter('Hero');
  const villain = fighter('Villain');
  const engine = new CombatEngine([hero], [villain], { registry: new EffectRegistry(), actionChooser: firstLegalChooser });
  return { engine, hero, villain };
}

describe('the search simulates the round it is choosing for', () => {
  /*
   * §20.4. `lookahead.playRound` opens by preparing a round, but the search is
   * invoked from inside `planActions`, which the engine reaches only AFTER its
   * own `prepareRound()`. So the same round was prepared twice, and probing it
   * gave:
   *
   *   REAL    round=1  actors queued: Hero
   *   ROLLOUT round=2  actors queued: Hero, Villain    ← stunned this round
   *
   * The rollout ran a round ahead of the decision, and rebuilt
   * `skippingThisRound` from a `skipTurns` the real round had already spent —
   * so a character stunned for exactly this round acted in every rollout. The
   * AI could not see a turn it had just taken away.
   *
   * `roundPrepared` is the invariant that makes the mistake unrepresentable.
   * These assert the contract; whether the corrected search PLAYS better is a
   * winrate question, and lives in `ai-strength.test.ts`.
   */

  it('a begun round is marked as begun, and a finished one is not', () => {
    const { engine } = arena();
    expect(engine.roundPrepared, 'a fresh combat has no round in progress').toBe(false);
    engine.prepareRound();
    expect(engine.roundPrepared).toBe(true);
    engine.planActions([]);
    let step = engine.resolveNextAction();
    while (step.kind !== 'done') {
      if (step.kind === 'target') engine.setResolveTarget([]);
      step = engine.resolveNextAction();
    }
    engine.finishRound();
    expect(engine.roundPrepared, 'a finished round must not look begun').toBe(false);
  });

  it('a clone taken mid-planning knows the round has already begun', () => {
    // This is the one that matters: the rollout works on a CLONE, so if the
    // flag did not survive cloning the search would prepare all over again and
    // the bug would be exactly as it was.
    const { engine } = arena();
    engine.prepareRound();
    expect(engine.clone().roundPrepared).toBe(true);
  });

  it('a rollout does not advance the round, nor spend a stun the round already spent', () => {
    const { engine, villain } = arena();
    villain.skipTurns = 1; // stunned for exactly this round

    engine.prepareRound();
    const real = engine.planActions([]).map(p => p.actorName);
    expect(real, 'the real round: the stunned villain does not act').toEqual(['Hero']);

    // Exactly what `playRound` now does on the clone it is handed.
    const sim = engine.clone();
    if (!sim.roundPrepared) sim.prepareRound();
    const rollout = sim.planActions([]).map(p => p.actorName);

    expect(sim.round, `rollout simulated round ${sim.round}, decision is for round ${engine.round}`)
      .toBe(engine.round);
    expect(rollout, 'the rollout must see the same actors the real round will')
      .toEqual(real);
  });
});

describe('a restricted search plays only what it is allowed to', () => {
  /*
   * §16's first bug, and the one that silently corrupted the most: `restrictTo`
   * leaked through the `topK` pruner. `bestResponse` prunes candidates by
   * SAMPLING `selectAction`, which knows nothing about the restriction, so a
   * search restricted to attacks evaluated — and played — defenses. The
   * "attacks only" arm was measured at only ~74% attacks.
   *
   * That arm is what requirement 3b reads, so the leak did not produce a wrong
   * verdict so much as a verdict about a policy nobody had asked for.
   *
   * CONSTRUCTED so the answer is exact rather than approximate. `lookahead.legal`
   * documents a deliberate fallback — "a restriction that leaves nothing legal
   * falls back to the full hand", because a character with no attack must still
   * act — so on real content a restricted arm is legitimately under 100%. Here
   * every character always holds two legal attacks, so the fallback can never
   * fire and anything but an attack is the leak.
   */
  const hand = () => [
    atk('a1'), atk('a2'),
    act('d1', ActionType.Defensa, { speed: 5 }),
    act('f1', ActionType.Focus, { speed: 0, dice: undefined }),
  ];
  const mk = (name: string) => createCharacter({
    name, pv: 200, classCss: 'x', skills: { probe: 1 }, actions: hand(),
  });

  /** Play `rounds` rounds and tally what team 0 actually played, by type. */
  function typesPlayed(restrict: ActionType[] | undefined, rounds = 6): Record<string, number> {
    const heroes = [mk('H1'), mk('H2')];
    const villains = [mk('V1'), mk('V2')];
    const chooser = lookaheadChooser(
      { depth: 1, samples: 2, passes: 1, topK: 3, restrictTo: restrict }, [0],
    );
    const engine = new CombatEngine(heroes, villains, {
      registry: new EffectRegistry(), maxRounds: 40, actionChooser: chooser,
    });
    const tally: Record<string, number> = {};
    for (let r = 0; r < rounds && !engine.isOver(); r++) {
      engine.prepareRound();
      engine.planActions([]);
      for (const h of heroes as Character[]) {
        const i = h.playedActionIdx;
        if (i === null || !h.isAlive()) continue;
        const t = String(h.actions[i].def.actionType);
        tally[t] = (tally[t] ?? 0) + 1;
      }
      let step = engine.resolveNextAction();
      while (step.kind !== 'done') {
        if (step.kind === 'target') engine.setResolveTarget([]);
        step = engine.resolveNextAction();
      }
      engine.finishRound();
    }
    return tally;
  }

  it('the premise holds: unrestricted, this hand does play non-attacks', () => {
    // A GUARD ON THE GUARD. If the free hand happened to play nothing but
    // attacks anyway, the restricted assertion below would be true for a reason
    // that has nothing to do with the restriction, and this file would be
    // asserting a coincidence. Same move `harnesses.test.ts` makes on its glob.
    const free = typesPlayed(undefined, 12);
    const nonAttacks = (free[ActionType.Defensa] ?? 0) + (free[ActionType.Focus] ?? 0);
    expect(nonAttacks, `free play never left an attack: ${JSON.stringify(free)}`).toBeGreaterThan(0);
  });

  it('restricted to attacks, it plays attacks and nothing else', () => {
    const only = typesPlayed([ActionType.Atac], 12);
    expect(only[ActionType.Atac] ?? 0, 'the restricted arm played nothing at all').toBeGreaterThan(0);
    expect(
      (only[ActionType.Defensa] ?? 0) + (only[ActionType.Focus] ?? 0),
      `restriction leaked: ${JSON.stringify(only)} — every character here always holds `
      + 'a legal attack, so the documented empty-restriction fallback cannot explain it',
    ).toBe(0);
  });
});

describe('the leaf evaluator agrees with the engine about how a fight ends', () => {
  /*
   * `positionScore` is what the search maximises, so its TERMINAL values have
   * to be the engine's actual outcomes. Three of the four were already right —
   * a wipe is ±100, a mutual wipe is 0. The fourth was missing: the engine
   * stops at `maxRounds` and `winner()` returns null, which is a DRAW, and the
   * evaluator went on reading the board as a comfortable lead instead.
   *
   * These are agreement checks, not judgements about play: whatever the right
   * value of tempo is, "this position is worth a PV lead" and "this position
   * returns null" cannot both be true.
   */
  function atCap(pvUs: number, pvThem: number): CombatEngine {
    const hero = fighter('Hero');
    const villain = fighter('Villain');
    const engine = new CombatEngine([hero], [villain], { registry: new EffectRegistry(), maxRounds: 3, actionChooser: firstLegalChooser });
    hero.currentPV = pvUs;
    villain.currentPV = pvThem;
    while (engine.round < engine.maxRounds) engine.round++;
    return engine;
  }

  it('a board at the round cap is a draw, however far ahead it looks', () => {
    // Winning on PV and running out of rounds still returns `winner: null`.
    expect(positionScore(atCap(10, 1), 0), 'a huge PV lead at the cap is still a draw').toBe(0);
    expect(positionScore(atCap(1, 10), 0), 'and so is a huge PV deficit').toBe(0);
  });

  it('but a WIPE on the final round is still a win', () => {
    // Order matters: the cap must not swallow a result the engine would report.
    const engine = atCap(10, 0);
    engine.teams[1][0].currentPV = 0;
    expect(engine.teams[1][0].isAlive(), 'fixture: the villain must actually be down').toBe(false);
    expect(positionScore(engine, 0)).toBe(100);
  });

  it('below the cap it still scores the board', () => {
    // A guard on the guard: if the cap check swallowed every position this
    // file would be asserting that the evaluator does nothing at all.
    const hero = fighter('Hero');
    const villain = fighter('Villain');
    const engine = new CombatEngine([hero], [villain], { registry: new EffectRegistry(), maxRounds: 40, actionChooser: firstLegalChooser });
    villain.currentPV = 1;
    expect(positionScore(engine, 0), 'a live lead below the cap must be worth something')
      .toBeGreaterThan(0);
  });
});

describe('the AI predicts the blow the engine actually throws', () => {
  /*
   * `expectedAttackTotal` is the number every attack weight is built on, and
   * the engine computes the real thing at `combat.ts`'s contest site. They are
   * the same quantity, so they must agree — and when they did not, nothing
   * noticed for months:
   *
   *   - the estimate forgot `skillLevelBonus`, so at level 5 it priced a 2d6
   *     attack at ~7 when the engine threw ~12 (§16);
   *   - `estimateExpectedDamage` never read `targetCount`, so all eight area
   *     cards were priced as if they struck one body (§16).
   *
   * Both are arithmetic disagreements with the rules. A winrate cannot see
   * either; this can, deterministically, in milliseconds.
   *
   * MEASURED UNDEFENDED AND UNARMOURED, which is what makes the comparison
   * exact: `resolution.ts` says an undefended attack auto-hits for its FULL
   * total and damage is that total minus armour, so with no armour the PV the
   * victim loses IS the attack total. No reimplementation of the engine's
   * formula here — that would only test the copy.
   */
  const SAMPLES = 400;

  /** Mean PV actually removed per attack, over `SAMPLES` undefended swings. */
  function realisedMeanDamage(def: ActionDefinition, level: number, victims: number): number {
    let total = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const attacker = createCharacter({
        name: 'A', pv: 500, classCss: 'x', skills: { probe: level }, actions: [def],
      });
      // Victims hold NO defense action, so nothing contests and nothing guards.
      const defenders = Array.from({ length: victims }, (_, j) => createCharacter({
        name: `D${j}`, pv: 500, classCss: 'x', skills: { probe: 1 }, actions: [atk('theirs')],
      }));
      const engine = new CombatEngine([attacker], defenders, { registry: new EffectRegistry(), maxRounds: 40, actionChooser: firstLegalChooser });
      const before = defenders.reduce((s, d) => s + d.currentPV, 0);
      engine.prepareRound();
      engine.planActions([{ team: 0, idx: 0, actionIdx: 0 }]);
      let step = engine.resolveNextAction();
      while (step.kind !== 'done') {
        if (step.kind === 'target') engine.setResolveTarget([]);
        step = engine.resolveNextAction();
      }
      engine.finishRound();
      total += before - defenders.reduce((s, d) => s + d.currentPV, 0);
    }
    return total / SAMPLES;
  }

  it('single target: the estimate matches the mean total rolled', () => {
    const level = 5;
    const def = act('swing', ActionType.Atac, { dice: new DiceRoll(2, 6), rollBonus: 1, speed: 9 });
    const attacker = createCharacter({
      name: 'A', pv: 500, classCss: 'x', skills: { probe: level }, actions: [def],
    });
    const predicted = expectedAttackTotal(attacker, def);
    const realised = realisedMeanDamage(def, level, 1);
    // 2d6 has σ≈2.4, so over 400 swings the mean carries ≈0.12. Half a point is
    // ~4σ: wide enough never to flake, far tighter than any of the real bugs
    // (the level omission was worth 5 whole points).
    expect(
      Math.abs(predicted - realised),
      `AI predicts ${predicted.toFixed(2)}, engine throws ${realised.toFixed(2)} on average`,
    ).toBeLessThan(0.5);
  });

  it('area: the damage estimate scales with the bodies it actually hits', () => {
    const level = 3;
    const victims = 3;
    const def = act('sweep', ActionType.Atac, {
      dice: new DiceRoll(2, 6), targetCount: victims, speed: 9,
    });
    const attacker = createCharacter({
      name: 'A', pv: 500, classCss: 'x', skills: { probe: level }, actions: [def],
    });
    const enemies = Array.from({ length: victims }, (_, j) => createCharacter({
      name: `D${j}`, pv: 500, classCss: 'x', skills: { probe: 1 }, actions: [atk('theirs')],
    }));
    // No defense actions anywhere, so `estimateExpectedDamage` takes its
    // undefended branch for every body and the prediction is exact rather than
    // blended through P_DEFEND.
    const predicted = estimateExpectedDamage(attacker, def, enemies);
    const realised = realisedMeanDamage(def, level, victims);
    expect(
      Math.abs(predicted - realised),
      `AI predicts ${predicted.toFixed(2)} PV removed across ${victims} bodies, `
      + `engine removes ${realised.toFixed(2)}`,
    ).toBeLessThan(1.0);
  });
});

describe('a tie for best is credited in full, not shared', () => {
  /*
   * §19.5 FAULT 4, and the mutation harness is what put it back on the page.
   *
   * `wasBest` answers "is this card EVER a right play". Two identical cards are
   * both right plays, so both are credited. Sharing the credit answers a
   * different question — "is it UNIQUELY best" — and it punishes a kit for
   * holding two good cards: each duplicate takes half of every tie, both land
   * at ~19.7% against a 25% null, and requirement 4/5 calls both of them DEAD.
   * A card-design loop that deletes good cards for being duplicated is worse
   * than no loop.
   *
   * WHY IT NEEDED THIS TEST. The mutant for this fault was scored as killed for
   * as long as `regret.ts` lived in the simulator and ran through tsx, which
   * does not typecheck: the patched source referenced a `const` before its
   * declaration, the kill set died of a TDZ ReferenceError, and a crash read as
   * a kill. Moving the module to `@pimpampum/bench` — which is consumed as
   * built `dist/` — turned that crash into a compile error, the mutant was
   * rewritten to compile, and it SURVIVED. Nothing in the fast tier checked the
   * tie rule at all.
   *
   * This is the duplicate-invariance relation in its sharpest form. It needs no
   * sample: with common random numbers per position, two identical cards replay
   * the identical rollout, so the tie is exact rather than probable.
   */
  const strong = (id: string) => act(id, ActionType.Atac, { dice: new DiceRoll(6, 6) });

  /**
   * PINNED, because `valuePosition` draws its per-position seed from the global
   * stream and these three tests would otherwise each get a different position
   * depending on what ran before them in the file. At an unpinned seed roughly
   * one position in eight is DECIDED — every branch scores the same — and
   * `valuePosition` correctly returns null for it, which reads as a flaky test
   * rather than as the non-decision it is.
   */
  const SEED = 1;

  /** Price a hand of TWO IDENTICAL STRONG ATTACKS AND ONE FEEBLE ONE.
   *
   *  The weak card is not decoration: a hand of nothing but duplicates is a
   *  position where every branch ties, which `valuePosition` drops as the
   *  non-decision it is, leaving nothing to assert on. */
  function priced() {
    const hero = createCharacter({
      name: 'Hero', pv: 40, classCss: 'x', skills: { probe: 1 },
      actions: [strong('twin-a'), strong('twin-b'), atk('feeble')],
    });
    const villain = createCharacter({
      name: 'Villain', pv: 40, classCss: 'x', skills: { probe: 1 }, actions: [atk('v1'), atk('v2')],
    });
    const engine = new CombatEngine([hero], [villain], {
      registry: new EffectRegistry(), maxRounds: 8, actionChooser: firstLegalChooser,
    });
    engine.prepareRound();
    const pos = withSeed(SEED, () => valuePosition(engine, hero, { rolloutDepth: 0, samples: 1, team: 0 }));
    expect(pos, 'the position came back decided — the feeble card is not weak enough at this seed')
      .not.toBeNull();
    return pos!;
  }

  it('the duplicates tie, which is the premise of the rest', () => {
    const pos = priced();
    const [a, b] = ['twin-a', 'twin-b'].map(id => pos.cards.find(c => c.id === id)!);
    expect(a.score, 'identical cards under common random numbers must score identically')
      .toBeCloseTo(b.score, 10);
    expect(a.score, 'and they must beat the feeble card, or they are not the top')
      .toBeGreaterThan(pos.cards.find(c => c.id === 'feeble')!.score);
  });

  it('every card reaching the top scores wasBest = 1', () => {
    const pos = priced();
    const top = Math.max(...pos.cards.map(c => c.score));
    for (const c of pos.cards.filter(c => c.score >= top)) {
      expect(c.wasBest, `${c.id} ties for best and must be credited in full, not 1/topCount`).toBe(1);
    }
  });

  it('the chance null counts the tie too, so a duplicate still clears it', () => {
    // The null is `topCount / candidates` — what chance alone hands out when m
    // of k cards reach the top. Both halves have to move together: credit the
    // tie in full against a flat 1/k null and every kit looks brilliant.
    const pos = priced();
    const twin = pos.cards.find(c => c.id === 'twin-a')!;
    expect(twin.topCount, 'both duplicates reach the top').toBe(2);
    expect(twin.candidates).toBe(3);
    expect(twin.wasBest, 'credited at 1 against a 2/3 null — above chance, so not dead')
      .toBeGreaterThan(twin.topCount / twin.candidates);
  });
});
