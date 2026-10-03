/**
 * THE LOG PARSER AGAINST THE ENGINE THAT WRITES THE LOG.
 *
 * `combatlog.ts` reads the engine's prose, so the two are coupled — and a
 * pattern that stops matching produces a short table, not an error. The guard
 * the module has (`assertParsed`) only fires when NOTHING parses. This checks
 * the stronger thing: every attack line a real fight writes is read, with the
 * total the engine actually rolled — including the lines with a negative bonus
 * (fatigue), which print a different minus sign.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CombatEngine, DiceRoll, EffectRegistry, withSeed } from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, randomLegalChooser } from '@pimpampum/engine/testing';
import { assertParsed, parseAttacks } from '../src/index.js';

const fightArb = fc.record({
  fatigueA: fc.integer({ min: 0, max: 5 }),
  fatigueB: fc.integer({ min: 0, max: 5 }),
  levelA: fc.integer({ min: 0, max: 4 }),
  armourB: fc.integer({ min: 0, max: 2 }),
  bonus: fc.integer({ min: -3, max: 3 }),
  seed: fc.integer(),
});

function fight(f: typeof fightArb extends fc.Arbitrary<infer T> ? T : never) {
  return withSeed(f.seed, () => {
    const hand = () => [
      attackCard('Tall', { dice: new DiceRoll(2, 6), rollBonus: f.bonus, speed: 2 }),
      defenseCard('Escut', { dice: new DiceRoll(2, 6), rollBonus: 0, speed: 3 }),
    ];
    const a = [fighter('Ada', hand(), { pv: 15, ai: true, fatigue: f.fatigueA, level: f.levelA })];
    const b = [fighter('Bru', hand(), { pv: 15, ai: true, fatigue: f.fatigueB, equipment: f.armourB ? [armour(f.armourB)] : [] })];
    const engine = new CombatEngine(a, b, { registry: new EffectRegistry(), actionChooser: randomLegalChooser, maxRounds: 30 });
    engine.runCombat();
    return engine.logEntries;
  });
}

describe('parseAttacks reads what the engine writes', () => {
  it('every attack roll in a fight is parsed — none silently dropped', () => {
    fc.assert(fc.property(fightArb, f => {
      const log = fight(f);
      const rolls = log.filter(e => e.kind === 'roll');
      const parsed = parseAttacks(log);
      expect(parsed.length, rolls.map(r => r.message).join('\n')).toBe(rolls.length);
    }));
  });

  it('reads the total the engine rolled, and the damage it dealt', () => {
    fc.assert(fc.property(fightArb, f => {
      const log = fight(f);
      for (const a of parseAttacks(log)) {
        const line = log[a.at].message;
        // The engine prints the final total after the last `=` or `→` of the
        // attack side; the parser must agree with it.
        const attackSide = line.split(': atac ')[1].split(/ vs | — /)[0];
        const printed = Number(attackSide.split(/[=→]/).at(-1));
        expect(a.roll, line).toBe(printed);
        expect(a.damage).toBeGreaterThanOrEqual(0);
        if (a.blocked) expect(a.damage).toBe(0);
      }
    }));
  });

  it('the numbers it reads reproduce the damage through the rules', () => {
    // Damage is the margin minus armour: parsed totals that disagree with the
    // damage the engine printed are totals read off the wrong part of the line.
    fc.assert(fc.property(fightArb, f => {
      const log = fight(f);
      const armourOf = (name: string) => (name.startsWith('Bru') ? f.armourB : 0);
      for (const a of parseAttacks(log)) {
        const margin = a.defenseRoll === undefined ? a.roll : a.roll - a.defenseRoll;
        if (a.defenseRoll !== undefined && margin <= 0) { expect(a.blocked, log[a.at].message).toBe(true); continue; }
        expect(a.damage, log[a.at].message).toBe(Math.max(0, margin - armourOf(a.target)));
      }
    }));
  });

  it('fails loudly when a run read nothing', () => {
    expect(() => assertParsed(0, 10)).toThrow();
    expect(() => assertParsed(0, 0)).not.toThrow();
    expect(() => assertParsed(3, 10)).not.toThrow();
  });
});
