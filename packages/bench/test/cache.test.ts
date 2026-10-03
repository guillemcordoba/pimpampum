/**
 * THE CACHE MUST NEVER SERVE A NUMBER FOR CONTENT AS IT USED TO BE.
 *
 * So the fingerprints are tested as METAMORPHIC relations: change anything that
 * can change a fight and the print must change; change only presentation and
 * it must not.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';
import { actionPrint, enginePrint, fingerprintedSources, key, useSet, type GameSet } from '../src/index.js';
import { FINGERPRINTED } from '../src/cache.js';
import { SYNTHETIC } from '../src/testing.js';

const base: ActionDefinition = {
  id: 'c', name: 'Card', skillId: 'k', unlockLevel: 1, actionType: ActionType.Atac, speed: 2,
  dice: new DiceRoll(2, 6), effects: [{ type: 'x', params: { amount: 1 } }], description: 'd', iconPath: 'i',
};

/** Every field that changes how a card plays, and a different value for it. */
const behavioural: [string, Partial<ActionDefinition>][] = [
  ['id', { id: 'other' }],
  ['unlockLevel', { unlockLevel: 2 }],
  ['actionType', { actionType: ActionType.Defensa }],
  ['speed', { speed: 3 }],
  ['dice count', { dice: new DiceRoll(3, 6) }],
  ['dice sides', { dice: new DiceRoll(2, 8) }],
  ['dice modifier', { dice: new DiceRoll(2, 6, 2) }],
  ['rollBonus', { rollBonus: 1 }],
  ['targetCount', { targetCount: 3 }],
  ['rollPerTarget', { rollPerTarget: true }],
  ['isConsumable', { isConsumable: true }],
  ['canReviveTarget', { canReviveTarget: true }],
  ['lastResort', { lastResort: true }],
  ['effect type', { effects: [{ type: 'y', params: { amount: 1 } }] }],
  ['effect params', { effects: [{ type: 'x', params: { amount: 2 } }] }],
];

describe('a card\'s fingerprint', () => {
  it.each(behavioural)('changes when %s changes', (_what, patch) => {
    expect(actionPrint({ ...base, ...patch })).not.toBe(actionPrint(base));
  });

  it('ignores what only changes how the card LOOKS', () => {
    expect(actionPrint({ ...base, name: 'Renamed', description: 'new text', iconPath: 'x.svg' }))
      .toBe(actionPrint(base));
  });

  it('does not depend on the order fields were written in', () => {
    const shuffled = Object.fromEntries(Object.entries(base).reverse()) as unknown as ActionDefinition;
    expect(actionPrint(shuffled)).toBe(actionPrint(base));
  });
});

describe('a cache key', () => {
  it('is deterministic, and different for different inputs', () => {
    useSet(SYNTHETIC);
    fc.assert(fc.property(fc.array(fc.string(), { maxLength: 4 }), fc.array(fc.string(), { maxLength: 4 }), (a, b) => {
      expect(key(...a)).toBe(key(...a));
      if (JSON.stringify(a) !== JSON.stringify(b) && a.join('') !== b.join('')) {
        expect(key(...a)).not.toBe(key(...b));
      }
    }));
  });

  it('belongs to one set: the same question in two sets is two keys', () => {
    useSet(SYNTHETIC);
    const k1 = key('base', 'shape0', 'row0');
    useSet({ ...SYNTHETIC, id: 'another' } as GameSet);
    const k2 = key('base', 'shape0', 'row0');
    useSet(SYNTHETIC);
    expect(k1).not.toBe(k2);
  });

  it('carries a fingerprint of the rules AND the instrument', () => {
    // Stable within a process, and non-trivial.
    expect(enginePrint()).toBe(enginePrint());
    expect(enginePrint()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('the rules-and-instrument fingerprint', () => {
  it('covers every package that decides a measured fight, and no content', () => {
    // It once hashed the engine alone; when the AI moved out, AI changes stopped
    // invalidating cached baselines. Whatever a package ends up called, the
    // rules, the policy, the measuring and the solver must all be in here.
    expect([...FINGERPRINTED].sort()).toEqual(['ai', 'bench', 'combat-balancer', 'engine']);
  });

  it('actually READS their source — a list of names hashes nothing', () => {
    // From the package refactor until 2026-10-03 the walk looked one directory
    // above the repo, found nothing, and hashed "missing" four times: the list
    // above was right and the fingerprint was a constant. Name a file from
    // each package, including this very module.
    const files = fingerprintedSources();
    expect(files.bench).toContain('packages/bench/src/cache.ts');
    expect(files.engine).toContain('packages/engine/src/combat.ts');
    expect(files.ai.length).toBeGreaterThan(0);
    expect(files['combat-balancer'].length).toBeGreaterThan(0);
  });
});
