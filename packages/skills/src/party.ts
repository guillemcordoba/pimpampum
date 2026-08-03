/**
 * Reference party generation.
 *
 * The encounter balancer prices a fight by SIMULATING it, so it needs actual
 * player characters. There are two ways to give it some:
 *
 *  - EXPLICIT (`characters`): the real party at the GM's table, kits and gear
 *    and all. Every game builds exactly these, so the winrate the balancer
 *    reports is *this party's* winrate rather than an average over parties of
 *    a similar shape. This is what the web app's encounter creator passes.
 *  - DRAWN (`count`/`levels`/`armor`): only how many players there are, how
 *    many skill levels each has and what armour they wear — a representative
 *    party is drawn from those inputs. Used when no concrete party exists
 *    (the simulator's sweeps and the balancer test suite).
 *
 * The draw models INTENDED play rather than uniform randomness: the first
 * skill is always a MAIN kit, and the complementary kits (metge/runes/ombres/
 * gel) were designed as second skills and only ever appear as one. Weapon kits
 * are guaranteed a weapon, otherwise their cards roll flat zero.
 *
 * Randomness flows through the engine's `random()`, so a seeded caller gets a
 * reproducible party (the solver relies on this for common random numbers).
 */
import { Character, random } from '@pimpampum/engine';
import { PLAYER_SKILLS } from './catalog.js';
import { buildCharacter, CharacterBuildSpec } from './build.js';
import { SkillDefinition } from './types.js';

/** Default PV pool for a player character (rules.md provisional default). */
export const PLAYER_PV = 12;

/** Skills DESIGNED as complementary second kits — never a lone main skill. */
export const COMPLEMENTARY_SKILLS = new Set(['metge', 'runes', 'ombres', 'gel']);

/** Passive-armour value → the Armor item that provides it. */
const ARMOR_BY_VALUE: Record<number, string | null> = {
  0: null,
  1: 'armadura-de-cuir',
  2: 'armadura-de-ferro',
};

/** A party described only by its shape — a representative one is drawn. */
export interface DrawnPartySpec {
  /** How many players. */
  count: number;
  /** Total skill levels per player. A single number applies to everyone;
   *  a array gives each player their own (short arrays repeat the last). */
  levels: number | number[];
  /** Passive armour (0-2) per player, same broadcasting rule as `levels`. */
  armor?: number | number[];
  /** PV per player (default PLAYER_PV). */
  pv?: number;
  /** Name prefix for generated characters. */
  prefix?: string;
  characters?: undefined;
}

/** The real party: build exactly these characters, every game. */
export interface ExplicitPartySpec {
  /** The actual heroes — their own skills, levels, PV, equipment and potions.
   *  Nothing is drawn, so the simulation is about THIS party. */
  characters: CharacterBuildSpec[];
}

export type PartySpec = DrawnPartySpec | ExplicitPartySpec;

/** True when the party is fixed rather than redrawn each simulated game.
 *  Callers use this to decide whether party-composition variance is a source
 *  of sampling noise (see the stderr inflation in the balancer). */
export function isExplicitParty(spec: PartySpec): spec is ExplicitPartySpec {
  return Array.isArray(spec.characters);
}

function per(value: number | number[] | undefined, i: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;
  return value.length === 0 ? fallback : value[Math.min(i, value.length - 1)];
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Spread `levels` total ordinals over 1-2 skills, main kit first. */
function drawSkills(levels: number): Record<string, number> {
  const mains = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
  const main = shuffled(mains)[0];
  const chosen: SkillDefinition[] = [main];
  // A second skill only when there are enough levels for it to mean anything.
  if (levels >= 3 && random() < 0.5) {
    chosen.push(shuffled(PLAYER_SKILLS.filter(s => s !== main))[0]);
  }
  const skills: Record<string, number> = {};
  let remaining = Math.max(1, levels);
  chosen.forEach((s, i) => {
    const last = i === chosen.length - 1;
    const want = last ? remaining : Math.round(remaining * (0.5 + random() * 0.3));
    skills[s.id] = Math.max(1, Math.min(s.actions.length, want));
    remaining -= skills[s.id];
  });
  return skills;
}

/** Build one representative player with the given levels and armour. */
export function buildReferencePlayer(name: string, levels: number, armor = 0, pv = PLAYER_PV): Character {
  const skills = drawSkills(levels);
  const chosen = PLAYER_SKILLS.filter(s => skills[s.id] !== undefined);
  const equipment: string[] = ['escut'];
  const armorItem = ARMOR_BY_VALUE[Math.max(0, Math.min(2, Math.round(armor)))];
  if (armorItem) equipment.push(armorItem);
  // Weapon kits roll 0 without a wielded weapon, so guarantee the MID weapon
  // (defaulting to the bastó would hand them the worst weapon by accident).
  const usesWeapon = chosen.some(s =>
    s.actions.some(a => a.effects.some(e => e.type === 'weapon_damage')));
  if (usesWeapon) equipment.push('destral');
  return buildCharacter({
    name,
    classCss: chosen[0]?.classCss ?? 'guerrer',
    iconPath: chosen[0]?.iconPath,
    pv,
    skills,
    equipment,
  });
}

/** Build a whole party from the balancer's player inputs: the explicit heroes
 *  when it has them, otherwise a representative draw. */
export function buildReferenceParty(spec: PartySpec): Character[] {
  if (isExplicitParty(spec)) {
    return spec.characters.map((c, i) => buildCharacter({
      ...c,
      name: c.name || `Heroi ${i + 1}`,
      pv: c.pv || PLAYER_PV,
      category: 'player',
    }));
  }
  const prefix = spec.prefix ?? 'Heroi ';
  return Array.from({ length: Math.max(1, spec.count) }, (_, i) =>
    buildReferencePlayer(
      `${prefix}${i + 1}`,
      per(spec.levels, i, 6),
      per(spec.armor, i, 0),
      spec.pv ?? PLAYER_PV,
    ));
}
