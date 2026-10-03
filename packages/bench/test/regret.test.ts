/**
 * PER-DECISION CARD VALUE — the statistical rules of `regret.ts`, on
 * hand-built positions with no content and no set installed.
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, ActionType, CombatEngine, createCharacter, DiceRoll, EffectRegistry, firstLegalChooser, withSeed } from '@pimpampum/engine';
import { valuePosition } from '../src/index.js';

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
