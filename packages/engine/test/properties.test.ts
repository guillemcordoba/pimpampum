/**
 * INVARIANTS OF ANY FIGHT — checked on fights fast-check generates, not on
 * fights someone thought of.
 *
 * A generated fight is two small teams of synthetic fighters (random dice,
 * speeds, types, target counts, armour, fatigue, PV) played by a uniformly
 * random LEGAL chooser, so every legal path gets walked rather than the paths
 * an AI happens to prefer. The engine's own seeded stream does the rest, and
 * fast-check shrinks a failure to the smallest fight that still breaks.
 *
 * Replay a failure with `FC_SEED=<seed> FC_PATH=<path>` from its report.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ActionType, type ActionDefinition, type Character, CombatEngine, DiceRoll, EffectRegistry, withSeed,
} from '../src/index.js';
import { armour, fighter, randomLegalChooser } from '../src/testing.js';

declare const process: { env: Record<string, string | undefined> };
fc.configureGlobal({
  seed: process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined,
  numRuns: 150,
});
/** A replay path belongs to one property, so it is passed per assert (a global
 *  `path` is not a thing — the first version set one and it did nothing). */
const REPLAY = process.env.FC_PATH ? { path: process.env.FC_PATH } : {};

const cardArb = fc.record({
  type: fc.constantFrom(ActionType.Atac, ActionType.Atac, ActionType.Defensa, ActionType.Focus),
  n: fc.integer({ min: 0, max: 4 }),
  s: fc.constantFrom(4, 6, 8),
  speed: fc.integer({ min: 0, max: 5 }),
  targets: fc.constantFrom(1, 1, 1, 2, 99),
  unlock: fc.integer({ min: 0, max: 3 }),
});

const fighterArb = fc.record({
  cards: fc.array(cardArb, { minLength: 1, maxLength: 4 }),
  pv: fc.integer({ min: 1, max: 30 }),
  level: fc.integer({ min: 0, max: 4 }),
  armour: fc.integer({ min: 0, max: 2 }),
  fatigue: fc.integer({ min: 0, max: 5 }),
});

export type FighterSpec = typeof fighterArb extends fc.Arbitrary<infer T> ? T : never;

const fightArb = fc.record({
  a: fc.array(fighterArb, { minLength: 1, maxLength: 3 }),
  b: fc.array(fighterArb, { minLength: 1, maxLength: 3 }),
  seed: fc.integer(),
  maxRounds: fc.integer({ min: 1, max: 25 }),
});

function build(spec: FighterSpec, name: string): Character {
  const actions: ActionDefinition[] = spec.cards.map((c, i) => ({
    id: `${name}-${i}`, name: `${name}-${i}`, skillId: 'test', unlockLevel: c.unlock,
    actionType: c.type, speed: c.speed,
    dice: c.n > 0 ? new DiceRoll(c.n, c.s) : undefined,
    targetCount: c.targets, effects: [], description: '', iconPath: '',
  }));
  // Every fighter keeps one card they can always play, as every real hand does.
  actions.push({
    id: `${name}-last`, name: 'last', skillId: 'test', unlockLevel: 0, actionType: ActionType.Atac,
    speed: 0, dice: new DiceRoll(1, 4), lastResort: true, effects: [], description: '', iconPath: '',
  });
  return fighter(name, actions, {
    pv: spec.pv, level: spec.level, fatigue: spec.fatigue, ai: true,
    equipment: spec.armour ? [armour(spec.armour)] : [],
  });
}

interface Trace {
  winner: number | null;
  rounds: number;
  pv: number[][];
  log: string[];
}

/** Play a generated fight round by round, checking the per-round invariants. */
function play(f: { a: FighterSpec[]; b: FighterSpec[]; seed: number; maxRounds: number }, names = (t: number, i: number) => `T${t}F${i}`): Trace {
  return withSeed(f.seed, () => {
    const teamA = f.a.map((s, i) => build(s, names(0, i)));
    const teamB = f.b.map((s, i) => build(s, names(1, i)));
    const all = [...teamA, ...teamB];
    const fatigue = all.map(c => c.fatigue);
    const engine = new CombatEngine(teamA, teamB, {
      registry: new EffectRegistry(), actionChooser: randomLegalChooser, maxRounds: f.maxRounds,
    });
    const pv: number[][] = [];
    let levels = all.map(c => c.getSkillLevel('test'));
    while (!engine.isOver() && engine.round < engine.maxRounds) {
      engine.runRound();
      for (const c of all) {
        expect(c.currentPV).toBeGreaterThanOrEqual(0);
        expect(c.currentPV).toBeLessThanOrEqual(c.maxPV);
        expect(Number.isFinite(c.currentPV)).toBe(true);
      }
      // Fatigue is the DM's: the engine never moves it.
      expect(all.map(c => c.fatigue)).toEqual(fatigue);
      // Levels only ever go up, and by at most one per contest.
      const now = all.map(c => c.getSkillLevel('test'));
      now.forEach((l, i) => expect(l).toBeGreaterThanOrEqual(levels[i]));
      levels = now;
      pv.push(all.map(c => c.currentPV));
    }
    const result = engine.runCombat();
    return { ...result, pv, log: engine.logEntries.map(e => e.message) };
  });
}

describe('any fight', () => {
  it('ends within the round cap, keeps PV in range, never touches fatigue, never unlearns', () => {
    fc.assert(fc.property(fightArb, f => {
      const t = play(f);
      expect(t.rounds).toBeLessThanOrEqual(f.maxRounds);
    }), REPLAY);
  });

  it('names a winner only when the other side is down, and a draw otherwise', () => {
    fc.assert(fc.property(fightArb, f => {
      const t = play(f);
      const last = t.pv.at(-1);
      if (!last) return;
      const aliveA = last.slice(0, f.a.length).some(p => p > 0);
      const aliveB = last.slice(f.a.length).some(p => p > 0);
      const expected = aliveA && !aliveB ? 0 : aliveB && !aliveA ? 1 : null;
      expect(t.winner).toBe(expected);
      if (t.winner === null && (aliveA || aliveB)) expect(t.rounds).toBe(f.maxRounds);
    }), REPLAY);
  });

  it('is DETERMINISTIC: the same seed replays the same fight, log and all', () => {
    fc.assert(fc.property(fightArb, f => {
      expect(play(f)).toEqual(play(f));
    }), REPLAY);
  });

  it('does not care what anyone is called', () => {
    // Names never enter a roll or a decision. If renaming moved an outcome, a
    // name would be leaking into the rules — through a sort, a map key, a tie.
    fc.assert(fc.property(fightArb, f => {
      const plain = play(f);
      const renamed = play(f, (t, i) => `zz-${1000 - i}-${t}`);
      expect(renamed.winner).toBe(plain.winner);
      expect(renamed.rounds).toBe(plain.rounds);
      expect(renamed.pv).toEqual(plain.pv);
    }), REPLAY);
  });
});

describe('a cloned combat', () => {
  it('plays out EXACTLY as the original would, and leaves the original untouched', () => {
    // The lookahead's whole premise: a clone is the same fight. Played under the
    // same seed from the same point, it must reach the same end — and the
    // original must be exactly where it was left.
    fc.assert(fc.property(fightArb, fc.integer({ min: 0, max: 3 }), (f, prefix) => {
      const make = () => {
        const teamA = f.a.map((s, i) => build(s, `A${i}`));
        const teamB = f.b.map((s, i) => build(s, `B${i}`));
        const engine = new CombatEngine(teamA, teamB, {
          registry: new EffectRegistry(), actionChooser: randomLegalChooser, maxRounds: f.maxRounds,
        });
        withSeed(f.seed, () => { for (let r = 0; r < prefix && !engine.isOver(); r++) engine.runRound(); });
        return engine;
      };
      const snapshot = (e: CombatEngine) => e.teams.flat().map(c => [c.currentPV, c.getSkillLevel('test'), c.statuses.size]);

      const original = make();
      const before = snapshot(original);
      const clone = original.clone();
      const cloneEnd = withSeed(f.seed + 1, () => clone.runCombat());
      expect(snapshot(original)).toEqual(before);
      expect(original.round).toBe(Math.min(prefix, original.round));

      const reference = make();
      const refEnd = withSeed(f.seed + 1, () => reference.runCombat());
      expect(cloneEnd).toEqual(refEnd);
      expect(snapshot(clone)).toEqual(snapshot(reference));
    }), REPLAY);
  });
});
