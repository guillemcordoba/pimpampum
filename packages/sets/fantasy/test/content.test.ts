/**
 * THE CONTENT IS WELL-FORMED — invariants every card, kit and creature must
 * hold, each of which fails SILENTLY in play when broken: a card whose effect
 * type has no handler resolves as if it had no effect; a duplicated id makes
 * one card shadow another in every lookup; a gap in a kit's unlock levels is a
 * level that teaches nothing.
 */
import { describe, it, expect } from 'vitest';
import type { ActionDefinition } from '@pimpampum/engine';
import {
  ALL_EQUIPMENT, ALL_POTIONS, ALL_SKILLS, buildCharacter, COP_DESESPERAT, createRegistry, ENEMY_DEFINITIONS,
  fullKitLevel, getAction, getEnemy, unlockedActions,
} from '../src/index.js';

const registry = createRegistry();
const playerCards = ALL_SKILLS.flatMap(s => s.actions);
const enemyCards = ENEMY_DEFINITIONS.flatMap(e => e.skills.flatMap(s => s.actions));
const equipmentCards = ALL_EQUIPMENT.flatMap(e => e.grantsActions ?? []);
const everyCard: ActionDefinition[] = [...playerCards, ...enemyCards, ...equipmentCards, ...ALL_POTIONS, COP_DESESPERAT];

describe('every card', () => {
  it('names only effect types the registry can resolve', () => {
    const missing = everyCard.flatMap(c => c.effects.filter(e => !registry.has(e.type)).map(e => `${c.id}: ${e.type}`));
    expect(missing, 'these effects would silently do nothing').toEqual([]);
  });

  it('has a unique id', () => {
    const seen = new Map<string, number>();
    for (const c of everyCard) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([]);
  });

  it('is findable by its id', () => {
    for (const c of playerCards) expect(getAction(c.id), c.id).toBe(c);
  });

  it('has sane numbers: speed an integer, dice real dice, target count at least one', () => {
    for (const c of everyCard) {
      expect(Number.isInteger(c.speed), c.id).toBe(true);
      if (c.dice) {
        expect(c.dice.numDice, c.id).toBeGreaterThanOrEqual(0);
        expect(c.dice.numDice === 0 || c.dice.sides >= 1, c.id).toBe(true);
      }
      expect(c.targetCount ?? 1, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('says what it does, in a line, when it does something no vanilla card does', () => {
    // CLAUDE.md: a card with a non-standard effect must say so on its face —
    // unless the card face already does: a weapon card's "needs a weapon" line is
    // rendered by the app from the effect itself (useActionDisplay).
    const SELF_DESCRIBING = new Set(['weapon_damage']);
    const silent = [...playerCards, ...enemyCards]
      .filter(c => c.effects.some(e => !SELF_DESCRIBING.has(e.type)) && !c.description.trim())
      .map(c => c.id);
    expect(silent, 'cards with effects but no description').toEqual([]);
  });
});

describe('every kit', () => {
  it('teaches one new card per level: unlock levels run 1..N without gaps', () => {
    for (const s of [...ALL_SKILLS, ...ENEMY_DEFINITIONS.flatMap(e => e.skills)]) {
      const levels = s.actions.map(a => a.unlockLevel).sort((a, b) => a - b);
      expect(levels, s.id).toEqual(levels.map((_, i) => i + 1));
    }
  });

  it('builds a character holding exactly the cards its level unlocks, plus the last resort', () => {
    for (const s of ALL_SKILLS) {
      for (let level = 1; level <= s.actions.length; level++) {
        const c = buildCharacter({ name: 'x', pv: 12, skills: { [s.id]: level } });
        const held = c.actions.map(a => a.def.id).sort();
        const want = [...unlockedActions(s.id, level).map(a => a.id), COP_DESESPERAT.id].sort();
        expect(held, `${s.id} @ ${level}`).toEqual(want);
      }
    }
  });
});

describe('every piece of equipment', () => {
  it('has whole, non-negative numbers — a NaN speed plays silently, scrambling turn order', () => {
    for (const e of ALL_EQUIPMENT) {
      for (const [field, v] of [['passiveArmor', e.passiveArmor], ['speedPenalty', e.speedPenalty]] as const) {
        expect(Number.isInteger(v) && v >= 0, `${e.id}.${field} = ${v}`).toBe(true);
      }
      for (const b of e.rollBonuses) expect(Number.isFinite(b.value), `${e.id} roll bonus`).toBe(true);
    }
  });
});

describe('every creature', () => {
  it('has a positive bulk, a full-kit level, and resolves by id', () => {
    for (const e of ENEMY_DEFINITIONS) {
      expect(e.bulk ?? 1, e.id).toBeGreaterThan(0);
      expect(fullKitLevel(e), e.id).toBeGreaterThanOrEqual(1);
      expect(getEnemy(e.id)).toBe(e);
    }
  });
});
