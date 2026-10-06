/**
 * THE REFERENCE PARTY — the four elements at full kit, asserted at import.
 * (Empty while the set's cards are redesigned from scratch, 2026-10-06.)
 *
 * Every harness measures against a party, so the party is the unit the whole
 * layer is denominated in. The kits are named literally (never a slice of the
 * catalogue) and the level sum is asserted at module load: a content change
 * that moves the benchmark throws, with the numbers, instead of quietly
 * rebasing every scoreboard. (The fantasy set's `reference.ts` has the long
 * story of why.)
 */
import { ALL_SKILLS, type CharacterBuildSpec, getSkill, type PartySpec, PLAYER_PV, type SkillDefinition, standardGear } from '../index.js';
import { pin } from './pinned.js';

/** The kits at the reference table, by id: the four elements, once they exist. */
export const REFERENCE_KITS: readonly string[] = [];

/** Full kit: every card the kit has (`levelOf` clamps this sentinel). */
export const FULL_KIT = Number.MAX_SAFE_INTEGER;

/** Total skill levels across the reference party. Asserted below. */
export const REFERENCE_SIGMA = 0;

/** The armour the reference heroes wear. */
export const REFERENCE_ARMOR = 'armadura-de-cuir';

/** Every player kit, in catalogue order (the set has no second skills). */
export const MAIN_KITS: SkillDefinition[] = ALL_SKILLS;

function skill(skillId: string): SkillDefinition {
  const found = getSkill(skillId);
  if (!found) {
    throw new Error(
      `set-elements/reference: unknown skill '${skillId}'. Either the kit was renamed or removed from `
      + `catalog.ts, or REFERENCE_KITS is stale.`,
    );
  }
  return found;
}

/** One reference hero: the kit at the given level, in leather. */
export function hero(name: string, skillId: string, level: number = FULL_KIT): CharacterBuildSpec {
  const s = skill(skillId);
  return {
    name,
    classCss: s.classCss,
    iconPath: s.iconPath,
    pv: PLAYER_PV,
    category: 'player',
    equipment: standardGear(1),
    skills: { [s.id]: levelOf(s, level) },
  };
}

export function levelOf(s: SkillDefinition, level: number): number {
  return Math.max(1, Math.min(s.actions.length, level));
}

function localReferenceParty(level: number = FULL_KIT): PartySpec {
  return { characters: REFERENCE_KITS.map((id, i) => hero(`Heroi ${i + 1}`, pin(id), level)) };
}

/** Σ of a party spec's skill levels. */
export function sigmaOf(spec: PartySpec): number {
  if (!Array.isArray(spec.characters)) return NaN;
  return spec.characters.reduce(
    (n, c) => n + Object.values(c.skills ?? {}).reduce((m, v) => m + v, 0), 0,
  );
}

const measured = sigmaOf(localReferenceParty());
if (measured !== REFERENCE_SIGMA) {
  const detail = REFERENCE_KITS.map(id => `${id}=${levelOf(skill(pin(id)), FULL_KIT)}`).join(' + ');
  throw new Error(
    `set-elements/reference: the reference party is Σ${measured}, but REFERENCE_SIGMA says ${REFERENCE_SIGMA}.\n`
    + `  ${detail} = ${measured}\n`
    + `A kit gained or lost cards, so the benchmark moved. Update REFERENCE_SIGMA and re-run the scoreboards.`,
  );
}

