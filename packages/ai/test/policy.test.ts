/**
 * THE AI IS AN INSTRUMENT, so its correctness is tested apart from its
 * strength. Strength — does it beat simpler policies, is it exploitable — is a
 * winrate question and lives with the synthetic set's slow tests. This file
 * asks what can be answered exactly, on synthetic fighters:
 *
 *  - it only ever plays and targets what the rules allow;
 *  - it is a pure function of the fight and the seed;
 *  - thinking about a fight does not change the fight;
 *  - on positions with ONE right answer, it finds it;
 *  - its evaluator is symmetric, and the seam that lets content price its own
 *    statuses actually reaches it.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ActionType, availableActionIndices, type ActionDefinition, type Character, CombatEngine, DiceRoll,
  EffectRegistry, type StatusBehavior, withSeed,
} from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard } from '@pimpampum/engine/testing';
import { aiPolicy, bestResponse, DEFAULT_LOOKAHEAD, pickResolveTargets, positionScore } from '../src/index.js';

const at = (team: number, idx: number) => ({ team, idx });

// --- generated fights -------------------------------------------------------

const cardArb = fc.record({
  type: fc.constantFrom(ActionType.Atac, ActionType.Atac, ActionType.Defensa, ActionType.Focus),
  n: fc.integer({ min: 1, max: 3 }),
  speed: fc.integer({ min: 0, max: 5 }),
  targets: fc.constantFrom(1, 1, 2),
});
const fighterArb = fc.record({
  cards: fc.array(cardArb, { minLength: 1, maxLength: 4 }),
  pv: fc.integer({ min: 3, max: 20 }),
  armour: fc.integer({ min: 0, max: 2 }),
});
const fightArb = fc.record({
  a: fc.array(fighterArb, { minLength: 1, maxLength: 3 }),
  b: fc.array(fighterArb, { minLength: 1, maxLength: 3 }),
  seed: fc.integer(),
});
type FightSpec = typeof fightArb extends fc.Arbitrary<infer T> ? T : never;

function team(specs: FightSpec['a'], prefix: string): Character[] {
  return specs.map((s, i) => fighter(`${prefix}${i}`, s.cards.map((c, j): ActionDefinition => ({
    id: `${prefix}${i}-${j}`, name: `c${j}`, skillId: 'test', unlockLevel: 0, actionType: c.type,
    speed: c.speed, dice: new DiceRoll(c.n, 6), targetCount: c.targets, effects: [],
    description: '', iconPath: '',
  })), { pv: s.pv, ai: true, equipment: s.armour ? [armour(s.armour)] : [] }));
}

/** Every decision the policy makes in a fight, checked against the rules. */
function playChecked(f: FightSpec, depth: number): { winner: number | null; rounds: number } {
  return withSeed(f.seed, () => {
    const policy = aiPolicy({ depth, samples: 2 });
    const engine = new CombatEngine(team(f.a, 'A'), team(f.b, 'B'), {
      registry: new EffectRegistry(), maxRounds: 12,
      actionChooser: (e, actor) => {
        const idx = policy.actionChooser(e, actor);
        const legal = availableActionIndices(actor, e.registry);
        expect(idx === null || legal.includes(idx), `${actor.name} chose ${idx}, legal ${legal}`).toBe(true);
        return idx;
      },
      targetChooser: (e, actor, def, req, count, pool, speed) => {
        const picked = policy.targetChooser(e, actor, def, req, count, pool, speed);
        expect(picked.length).toBeLessThanOrEqual(count);
        for (const t of picked) expect(pool).toContain(t);
        return picked;
      },
    });
    return engine.runCombat();
  });
}

describe('the policy obeys the rules', () => {
  it('depth 0: every card it plays is legal, every target is in the pool', () => {
    fc.assert(fc.property(fightArb, f => { playChecked(f, 0); }), { numRuns: 60 });
  });

  it('depth 1: the same, with the search in the loop', () => {
    fc.assert(fc.property(fightArb, f => { playChecked(f, 1); }), { numRuns: 25 });
  });

  it('is a pure function of the fight and the seed', () => {
    fc.assert(fc.property(fightArb, f => {
      expect(playChecked(f, 1)).toEqual(playChecked(f, 1));
    }), { numRuns: 15 });
  });
});

describe('thinking does not change the fight', () => {
  it('a best-response solve leaves every character and the round exactly as it found them', () => {
    fc.assert(fc.property(fightArb, f => withSeed(f.seed, () => {
      const engine = new CombatEngine(team(f.a, 'A'), team(f.b, 'B'), {
        registry: new EffectRegistry(), maxRounds: 12, ...aiPolicy({ depth: 0 }),
      });
      engine.runRound();
      if (engine.isOver()) return;
      engine.prepareRound();
      const snap = () => JSON.stringify({
        round: engine.round, prepared: engine.roundPrepared, log: engine.logEntries.length,
        chars: engine.teams.flat().map(c => [
          c.currentPV, [...c.skills], [...c.statuses.keys()], c.guards.length, c.playedActionIdx, c.skipTurns,
        ]),
      });
      const before = snap();
      bestResponse(engine, 0, { ...DEFAULT_LOOKAHEAD, samples: 2 });
      expect(snap()).toBe(before);
    })), { numRuns: 25 });
  });
});

describe('positions with one right answer', () => {
  /** What depth 1 plays for the hero, over many seeds. */
  function picks(build: () => { engine: CombatEngine; hero: Character }, seeds = 20): number[] {
    const out: number[] = [];
    for (let s = 0; s < seeds; s++) {
      withSeed(s, () => {
        const { engine, hero } = build();
        engine.prepareRound();
        out.push(bestResponse(engine, 0, { ...DEFAULT_LOOKAHEAD, samples: 4 }).choices.get(hero)!);
      });
    }
    return out;
  }

  it('takes the kill when a kill is on the table', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [attackCard('tickle'), attackCard('kill', { rollBonus: 10 })], { pv: 20, ai: true });
      const foe = fighter('Foe', [attackCard('poke')], { pv: 5, ai: true });
      const engine = new CombatEngine([hero], [foe], { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
      return { engine, hero };
    });
    expect(chosen.every(i => i === 1), `picked ${chosen}`).toBe(true);
  });

  it('guards when guarding is the only way to live', () => {
    // One PV left, a certain lethal blow incoming, and an attack that cannot
    // end the fight first. Every rollout that attacks loses; guarding survives.
    const chosen = picks(() => {
      const hero = fighter('Hero', [attackCard('flail', { speed: 0 }), defenseCard('brace', { speed: 5 })], { pv: 1, ai: true });
      const foe = fighter('Foe', [attackCard('execute', { rollBonus: 5, speed: 1 })], { pv: 100, ai: true });
      const engine = new CombatEngine([hero], [foe], { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
      return { engine, hero };
    });
    expect(chosen.every(i => i === 1), `picked ${chosen}`).toBe(true);
  });

  it('does not waste the turn on a card that does nothing', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [focusCard('idle'), attackCard('hit', { dice: new DiceRoll(2, 6) })], { pv: 20, ai: true });
      const foe = fighter('Foe', [attackCard('poke')], { pv: 30, ai: true });
      const engine = new CombatEngine([hero], [foe], { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
      return { engine, hero };
    });
    expect(chosen.every(i => i === 1), `picked ${chosen}`).toBe(true);
  });
});

describe('the evaluator', () => {
  it('is zero-sum: what one side gains the other loses', () => {
    fc.assert(fc.property(fightArb, fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 6 }), (f, hits) => {
      const engine = new CombatEngine(team(f.a, 'A'), team(f.b, 'B'), {
        registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }),
      });
      engine.teams.flat().forEach((c, i) => c.loseLife(hits[i] ?? 0));
      expect(positionScore(engine, 0) + positionScore(engine, 1)).toBeCloseTo(0, 9);
    }));
  });

  it('a status that says what it is worth is worth that to its holder\'s side', () => {
    // The seam eleven "dead" cards were waiting for (CLAUDE.md): a status that
    // prices itself through `positionValue` must reach the search's score.
    const hero = fighter('Hero', [attackCard()], { pv: 10, ai: true });
    const foe = fighter('Foe', [attackCard()], { pv: 10, ai: true });
    const engine = new CombatEngine([hero], [foe], { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
    const base = positionScore(engine, 0);
    const WORTH: StatusBehavior = { positionValue: () => 0.5 };
    hero.setStatus('ward', 1, -1, undefined, WORTH);
    expect(positionScore(engine, 0)).toBeGreaterThan(base);
    expect(positionScore(engine, 1)).toBeLessThan(-base + 1e-9);
    hero.clearStatus('ward');
    foe.setStatus('ward', 1, -1, undefined, WORTH);
    expect(positionScore(engine, 0)).toBeLessThan(base);
  });

  it('prefers health, then prefers being more', () => {
    const mk = () => {
      const heroes = [fighter('H1', [attackCard()], { pv: 10 }), fighter('H2', [attackCard()], { pv: 10 })];
      const foes = [fighter('F1', [attackCard()], { pv: 10 }), fighter('F2', [attackCard()], { pv: 10 })];
      return new CombatEngine(heroes, foes, { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
    };
    const even = mk();
    const hurtFoe = mk(); hurtFoe.teams[1][0].loseLife(5);
    const deadFoe = mk(); deadFoe.teams[1][0].loseLife(10);
    expect(positionScore(even, 0)).toBeCloseTo(0, 9);
    expect(positionScore(hurtFoe, 0)).toBeGreaterThan(0);
    expect(positionScore(deadFoe, 0)).toBeGreaterThan(positionScore(hurtFoe, 0));
  });
});

describe('aiming at an enemy: attacks finish the wounded, everything else spares them', () => {
  function target(card: ReturnType<typeof attackCard>): string {
    const hero = fighter('Hero', [card], { pv: 20 });
    const hurt = fighter('Hurt', [attackCard('stab')], { pv: 20, ai: true });
    const fresh = fighter('Fresh', [attackCard('stab')], { pv: 20, ai: true });
    const engine = new CombatEngine([hero], [hurt, fresh], { registry: new EffectRegistry(), ...aiPolicy({ depth: 0 }) });
    hurt.loseLife(15);
    engine.prepareRound();
    return pickResolveTargets(engine, hero, card, 'enemy', 1, [hurt, fresh], 5)[0].name;
  }

  it('an attack goes for the wounded enemy', () => {
    expect(target(attackCard('hit'))).toBe('Hurt');
  });

  it('a non-attack card (a curse, a swallow) goes to the healthy one', () => {
    expect(target(focusCard('curse'))).toBe('Fresh');
  });
});
