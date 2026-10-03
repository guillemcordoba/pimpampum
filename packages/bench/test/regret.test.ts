/**
 * PER-DECISION CARD VALUE — the statistical rules of `regret.ts`, on
 * hand-built positions with no content and no set installed.
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, ActionType, CombatEngine, createCharacter, DiceRoll, EffectRegistry, firstLegalChooser, withSeed } from '@pimpampum/engine';
import { valuePosition, clusteredRatio, clusteredStderr, crossFittedCost, crossFittedGainsWhenBest, scoreCards } from '../src/index.js';

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


describe('a tie for best is credited in full, not shared', () => {
  /*
   * §19.5 FAULT 4, and the mutation harness is what put it back on the page.
   *
   * `wasBest` answers "is this card EVER a right play". Two identical cards are
   * both right plays, so both are credited. Sharing the credit answers a
   * different question — "is it UNIQUELY best" — and it punishes a kit for
   * holding two good cards: each duplicate takes half of every tie, both land
   * at ~19.7% against a 25% null, and the dead-card rule of the day called both DEAD.
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
   * `valuePosition` correctly prices no card for it, which reads as a flaky test
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
    expect(pos?.cards.length, 'the position came back decided — the feeble card is not weak enough at this seed')
      .toBeGreaterThan(0);
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

  it('a DECIDED position — every card scores the same — prices no card and costs nothing', () => {
    // Identical cards replay identical rollouts under common random numbers,
    // so every branch ties exactly. That is a decision whose choice cost
    // nothing (counted, at 0), and no sample for which card is best.
    const hero = createCharacter({
      name: 'Hero', pv: 40, classCss: 'x', skills: { probe: 1 }, actions: [strong('same-a'), strong('same-b')],
    });
    const villain = createCharacter({
      name: 'Villain', pv: 40, classCss: 'x', skills: { probe: 1 }, actions: [act('v1', ActionType.Atac, { dice: new DiceRoll(1, 4) })],
    });
    const engine = new CombatEngine([hero], [villain], {
      registry: new EffectRegistry(), maxRounds: 8, actionChooser: firstLegalChooser,
    });
    engine.prepareRound();
    const pos = withSeed(SEED, () => valuePosition(engine, hero, { rolloutDepth: 0, samples: 2, team: 0 }));
    expect(pos).toEqual({ choiceCost: 0, cards: [] });
  });

  it('prices the cost of a random pick: the top score minus the mean', () => {
    const pos = priced();
    const top = Math.max(...pos.cards.map(c => c.score));
    const mean = pos.cards.reduce((n, c) => n + c.score, 0) / pos.cards.length;
    expect(pos.choiceCost).toBeCloseTo(top - mean, 10);
    expect(pos.choiceCost, 'the feeble card is worse, so a random pick costs something').toBeGreaterThan(0);
  });
});

describe('the cost of a random pick is cross-fitted', () => {
  // Branches with per-rollout scores; `score` is their mean, as valuePosition builds it.
  const branch = (samples: number[]) => ({ samples, score: samples.reduce((a, x) => a + x, 0) / samples.length });

  it('a clearly better card costs what the plain difference says', () => {
    expect(crossFittedCost([branch([10, 10, 10, 10]), branch([0, 0, 0, 0])])).toBeCloseTo(5, 10);
  });

  it('THE NULL: cards worth exactly the same cost nothing on average — the plain max does not', () => {
    // Three cards, identical in truth, scored with rollout noise. The plain
    // "top minus mean" takes a max over noise and reads a cost every time.
    let state = 12345;
    const noise = () => { state = (state * 1103515245 + 12345) % 2 ** 31; return state / 2 ** 31 * 20 - 10; };
    let cross = 0, plain = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const bs = [0, 1, 2].map(() => branch(Array.from({ length: 6 }, noise)));
      cross += crossFittedCost(bs);
      plain += Math.max(...bs.map(b => b.score)) - bs.reduce((a, b) => a + b.score, 0) / bs.length;
    }
    expect(Math.abs(cross / N), 'cross-fitted cost of equal cards').toBeLessThan(0.15);
    expect(plain / N, 'the biased form the cross-fit replaces').toBeGreaterThan(1);
  });
});


describe('the gain when a card is the best play is cross-fitted', () => {
  const branch = (samples: number[]) => ({ samples, score: samples.reduce((a, x) => a + x, 0) / samples.length });

  it('a card clearly best on every sample gains its true lead; the others are never best', () => {
    expect(crossFittedGainsWhenBest([branch([10, 10, 10, 10]), branch([4, 4, 4, 4]), branch([0, 0, 0, 0])]))
      .toEqual([[6, 6], [], []]);
  });

  it('THE NULL: cards worth the same gain nothing on average when "best" — the naive lead does', () => {
    let state = 4242;
    const noise = () => { state = (state * 1103515245 + 12345) % 2 ** 31; return state / 2 ** 31 * 20 - 10; };
    let cross = 0, crossN = 0, naive = 0, naiveN = 0;
    for (let i = 0; i < 4000; i++) {
      const bs = [0, 1, 2].map(() => branch(Array.from({ length: 6 }, noise)));
      for (const g of crossFittedGainsWhenBest(bs).flat()) { cross += g; crossN++; }
      const scores = bs.map(b => b.score).sort((a, b) => b - a);
      naive += scores[0] - scores[1]; naiveN++;
    }
    expect(Math.abs(cross / crossN), 'cross-fitted gain of equal cards').toBeLessThan(0.2);
    expect(naive / naiveN, 'the naive lead the cross-fit replaces').toBeGreaterThan(1);
  });
});

describe('a mean whose observation COUNT depends on the noise is a ratio', () => {
  it('weights by observation, where a per-fight average is biased', () => {
    // Fight 0: two replicated wins (+3, +3). Fight 1: one lucky pick (−6).
    // Per observation the lead is zero; equal-weight fights read −1.5.
    const obs = [{ fight: 0, g: 3 }, { fight: 0, g: 3 }, { fight: 1, g: -6 }];
    expect(clusteredRatio(obs, o => o.g).mean).toBeCloseTo(0, 10);
    expect(clusteredStderr(obs, o => o.g).mean).toBeCloseTo(-1.5, 10);
  });

  it('is what a card\'s gain when best is summarised with', () => {
    const o = (fight: number, gainsWhenBest: number[]) => ({ value: 0, winValue: 0, wasBest: gainsWhenBest.length ? 1 : 0, gainsWhenBest, fight });
    const [card] = scoreCards({ byCard: new Map([['c', [o(0, [3, 3]), o(1, [-6])]]]), costs: [], positions: 2, fights: 2 });
    expect(card.gainWhenBest).toBeCloseTo(0, 10);
  });

  it('agrees with the per-fight mean when every fight has the same count', () => {
    const obs = [{ fight: 0, g: 1 }, { fight: 0, g: 3 }, { fight: 1, g: 5 }, { fight: 1, g: 7 }];
    expect(clusteredRatio(obs, o => o.g).mean).toBeCloseTo(clusteredStderr(obs, o => o.g).mean, 10);
    expect(clusteredRatio(obs, o => o.g).stderr).toBeGreaterThan(0);
  });
});
