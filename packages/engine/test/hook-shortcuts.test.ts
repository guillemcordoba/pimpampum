/**
 * The engine skips a walk over a character's statuses when none of them has
 * the hook it is about to ask, and a walk over a card's effects for one hook
 * once it has made it. Both shortcuts must never skip something that is there:
 * a stale answer would silently drop a status's or a handler's mechanics.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry, type StatusBehavior, type StatusEntry } from '../src/index.js';
import { attackCard, fighter } from '../src/testing.js';

const hiding: StatusBehavior = { untargetable: () => true };
const inert: StatusBehavior = { positionValue: () => 0 };

describe('holdsStatusWith', () => {
  it('follows every way a status comes and goes', () => {
    const c = fighter('A', [attackCard()]);
    expect(c.holdsStatusWith('untargetable')).toBe(false);
    c.setStatus('inert', 1, 1, undefined, inert);
    expect(c.holdsStatusWith('untargetable')).toBe(false);
    expect(c.holdsStatusWith('positionValue')).toBe(true);
    c.setStatus('hidden', 1, 1, undefined, hiding);
    expect(c.holdsStatusWith('untargetable')).toBe(true);
    c.clearStatus('hidden');
    expect(c.holdsStatusWith('untargetable')).toBe(false);
    c.statuses.set('hidden', { value: 1, remaining: 1, behavior: hiding });
    expect(c.holdsStatusWith('untargetable')).toBe(true);
    c.setStatus('hidden', 1, 1);   // the same key, now without a behaviour
    expect(c.holdsStatusWith('untargetable')).toBe(false);
    c.setStatus('hidden', 1, 1, undefined, hiding);
    c.advanceTurn();               // one turn: it expires
    expect(c.holdsStatusWith('untargetable')).toBe(false);
    c.setStatus('hidden', 1, -1, undefined, hiding);
    expect(c.cloneState().holdsStatusWith('untargetable')).toBe(true);
    c.statuses.clear();
    expect(c.holdsStatusWith('positionValue')).toBe(false);
  });

  it('answers for a plain Map assigned in place of the statuses', () => {
    const c = fighter('A', [attackCard()]);
    c.statuses = new Map<string, StatusEntry>([['hidden', { value: 1, remaining: 1, behavior: hiding }]]);
    expect(c.holdsStatusWith('untargetable')).toBe(true);
  });
});

describe('EffectRegistry.effectsWith', () => {
  it('lists the effects whose handler has the hook, in order, and forgets on (un)register', () => {
    const registry = new EffectRegistry();
    const effects = [{ type: 'a' }, { type: 'b' }, { type: 'c', params: { n: 1 } }];
    registry.register('a', { onResolve: () => {} });
    registry.register('c', { onResolve: () => {}, canPlay: () => true });
    expect(registry.effectsWith(effects, 'onResolve').map(h => h.eff)).toEqual([effects[0], effects[2]]);
    expect(registry.effectsWith(effects, 'canPlay').map(h => h.eff)).toEqual([effects[2]]);
    expect(registry.effectsWith(effects, 'onPlay')).toEqual([]);
    registry.register('b', { onPlay: () => {} });
    expect(registry.effectsWith(effects, 'onPlay').map(h => h.eff)).toEqual([effects[1]]);
    registry.unregister('a');
    expect(registry.effectsWith(effects, 'onResolve').map(h => h.eff)).toEqual([effects[2]]);
  });
});
