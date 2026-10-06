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
 *  - DRAWN (`count`/`levels`/`armor`/`fatigue`): only how many players there
 *    are, how many skill levels each has, what armour they wear and how tired
 *    they are — a representative party is drawn from those inputs. Used when
 *    no concrete party exists (the simulator's sweeps and the balancer tests).
 *
 * Each drawn hero carries ONE kit, drawn from the whole catalogue (the set has no second
 * skills).
 *
 * Randomness flows through the engine's `random()`, so a seeded caller gets a
 * reproducible party (the solver relies on this for common random numbers).
 */
import { Character, random } from '@pimpampum/engine';
import { ALL_SKILLS } from './catalog.js';
import { buildCharacter } from './build.js';
import { standardGear } from './equipment.js';
import { SkillDefinition } from './types.js';
/**
 * The party spec is declared ONCE, by the measurement layer that has to size a
 * sample from it (`@pimpampum/bench/gameset` — a module with no Node imports,
 * so this stays browser-safe). It used to be declared here too, field for
 * field, and two copies of a contract drift. Armour is 0-2 and fatigue 0-5 in
 * this set; out-of-range values clamp.
 */
import { isExplicitParty, type PartySpec } from '@pimpampum/bench/gameset';
export { isExplicitParty };
export type { PartySpec, DrawnPartySpec, ExplicitPartySpec } from '@pimpampum/bench/gameset';

/** Default PV pool for a player character (rules.md provisional default). */
export const PLAYER_PV = 12;



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

/** One kit at `levels` — heroes in this set carry a single skill. */
function drawSkills(levels: number): Record<string, number> {
  const kit: SkillDefinition | undefined = shuffled(ALL_SKILLS)[0];
  return kit ? { [kit.id]: Math.max(1, Math.min(kit.actions.length, levels)) } : {};
}

/** Build one representative player with the given levels and armour. */
export function buildReferencePlayer(name: string, levels: number, armor = 0, pv = PLAYER_PV, fatigue = 0): Character {
  const skills = drawSkills(levels);
  const chosen = ALL_SKILLS.filter(s => skills[s.id] !== undefined);
  const equipment = standardGear(armor);
  return buildCharacter({
    name,
    classCss: chosen[0]?.classCss ?? 'aire',
    iconPath: chosen[0]?.iconPath,
    pv,
    skills,
    equipment,
    fatigue,
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
      per(spec.fatigue, i, 0),
    ));
}
