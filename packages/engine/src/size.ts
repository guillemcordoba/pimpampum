/**
 * Character size: a free choice at character creation (it does NOT count
 * against the skill-sum budget) trading PV against action speed. Enemies are
 * always Mitjà — enemy templates bake their durability into base PV directly.
 *
 * Lore: a hulking brute soaks blows but telegraphs every move; a small, wiry
 * fighter strikes first and slips away, at the cost of a frailer body.
 */

export type CharacterSize = 'gran' | 'mitja' | 'petit';

export interface SizeSpec {
  /** Catalan label used in displays and logs. */
  name: string;
  /** Added once to max PV at character creation. */
  pvModifier: number;
  /** Added to the effective speed of every action (stacks with armour penalties). */
  speedModifier: number;
}

/** Tune by editing values here (validated via the simulator's per-size report). */
export const SIZE_TABLE: Record<CharacterSize, SizeSpec> = {
  gran:  { name: 'Gran',  pvModifier: 3,  speedModifier: -1 },
  mitja: { name: 'Mitjà', pvModifier: 0,  speedModifier: 0 },
  petit: { name: 'Petit', pvModifier: -3, speedModifier: 1 },
};

export const DEFAULT_SIZE: CharacterSize = 'mitja';

export const ALL_SIZES: readonly CharacterSize[] = ['gran', 'mitja', 'petit'];

export function sizePvModifier(size: CharacterSize): number {
  return SIZE_TABLE[size].pvModifier;
}

export function sizeSpeedModifier(size: CharacterSize): number {
  return SIZE_TABLE[size].speedModifier;
}

export function sizeName(size: CharacterSize): string {
  return SIZE_TABLE[size].name;
}
