/**
 * A tiny content set for the balancer's own tests: heroes and creatures made
 * of plain dice, built straight from the engine's test fixtures.
 *
 * The balancer cannot see bench's synthetic set (bench depends on the balancer),
 * and it should not need to: all it asks of content is `EncounterContent`.
 */
import { type Character, DiceRoll, EffectRegistry } from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard } from '@pimpampum/engine/testing';
import type { EncounterContent, FieldedGroup } from '../src/index.js';

/** A party: how many heroes, and how tough each is. */
export interface TestParty {
  heroes: number; armour?: number; fixed?: boolean;
  /** Also hold BAIT: a card that does nothing, whose AI hint says it is worth
   *  everything. The depth-0 AI believes hints and plays it all fight; the
   *  depth-1 AI plays the round out and never does. Two AIs that disagree about
   *  the whole fight, on purpose. */
  bait?: boolean;
}

const CREATURES: Record<string, { bulk: number; dice: string }> = {
  rat: { bulk: 1, dice: '2d6' },
  ogre: { bulk: 2, dice: '3d6' },
  // Cannot hurt a hero through a raised guard: the fight it offers is a draw at
  // best, so some targets are out of reach at any PV.
  mouse: { bulk: 1, dice: '1d1' },
};

export const CONTENT: EncounterContent<TestParty> = {
  registry: () => {
    const r = new EffectRegistry();
    r.register('bait', { aiWeight: () => 1000 });
    return r;
  },
  buildParty: p => Array.from({ length: p.heroes }, (_, i) => fighter(`H${i}`, [
    attackCard('cut', { dice: new DiceRoll(2, 6), speed: 2 }),
    defenseCard('parry', { dice: new DiceRoll(2, 6), rollBonus: 0, speed: 3 }),
    ...(p.bait ? [focusCard('bait', { effects: [{ type: 'bait' }] })] : []),
  ], { pv: 12, ai: true, equipment: p.armour ? [armour(p.armour)] : [] })),
  isFixedParty: p => p.fixed ?? true,
  buildEncounter: (groups: FieldedGroup[]): Character[] => groups.flatMap(g => {
    const c = CREATURES[g.enemyId];
    if (!c) return [];
    return Array.from({ length: g.count }, (_, i) => fighter(`${g.enemyId}${i}`, [
      attackCard('bite', { dice: DiceRoll.parse(c.dice), speed: 2 }),
    ], { pv: g.pv, ai: true }));
  }),
  creature: id => (CREATURES[id] ? { bulk: CREATURES[id].bulk, fullKitLevel: 1 } : undefined),
};

/** Cheap settings: depth 0 throughout, so a solve costs seconds, not minutes. */
export const FAST = { aiDepth: 0, searchGames: 80, games: 400 } as const;
