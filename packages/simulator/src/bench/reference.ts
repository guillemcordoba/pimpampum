/**
 * THE REFERENCE PARTY — one definition, asserted at import.
 *
 * Every harness in this package measures something *against a party*, so the
 * party is the unit the whole layer is denominated in. It used to be written
 * out separately in seven files as `MAINS.slice(0, 4)`, which had three
 * failure modes, all silent:
 *
 *  - POSITIONAL. `slice(0, 4)` reads whichever four kits happen to come first
 *    in `ALL_SKILLS`. Adding a kit to `catalog.ts`, or reordering it, swapped
 *    the benchmark out from under every number in the package with no warning.
 *  - EMERGENT Σ. The level sum was never chosen, it fell out of how many cards
 *    each kit happened to have (`Math.min(actions.length, 5)`). Σ20 today only
 *    because all four of these kits have ≥5 actions; earthbender has 4, which
 *    is almost certainly where the docs' long-standing "Σ19" came from.
 *  - DRIFT. Seven copies of the same `hero()` helper, some resolving through
 *    `ALL_SKILLS`, some through `PLAYER_SKILLS`, some clamping the level.
 *
 * So the kits are named literally and the level sum is asserted at module
 * load. A content change that moves the benchmark now throws, at import, with
 * the numbers in the message — instead of quietly rebasing the scoreboard.
 */
import { ALL_SKILLS, COMPLEMENTARY_SKILLS, PLAYER_PV, PLAYER_SKILLS } from '@pimpampum/skills';
import type { CharacterBuildSpec, PartySpec, SkillDefinition } from '@pimpampum/skills';

/**
 * The four kits at the reference table, BY ID. Not a slice — the point is that
 * this list changes only when someone edits this line.
 *
 * Changing it re-bases every measurement in the package, so treat it the way
 * you would treat a unit: a run before the change and a run after it are not
 * comparable, whatever both printed.
 */
export const REFERENCE_KITS = [
  'enginyer-explosius', 'mestre-armes', 'nigromant', 'berserk',
] as const;

/**
 * Reference heroes are built at FULL KIT — every card the kit has.
 *
 * It used to be a flat `5`, which is an absolute number in a system where a
 * level is an ordinal ("level N = the first N actions"). Two kits had already
 * outgrown it: nigromant and berserk have six cards and were being fielded with
 * five, while every comment and doc said "at full kit". The gap only widens as
 * kits grow — a ten-card kit built at 5 is half a kit, and the benchmark
 * quietly becomes "a party of beginners".
 *
 * `FULL_KIT` is a sentinel, not a level: `levelOf` clamps it to whatever the
 * kit actually has.
 */
export const FULL_KIT = Number.MAX_SAFE_INTEGER;

/**
 * Total skill levels across the reference party — the number the docs quote
 * when they say how strong the benchmark table is. Asserted below.
 *
 * The balance principle (CLAUDE.md) puts a fair table at ~6-7 levels per
 * player, so Σ22 over four heroes is still a modest party. Read every kit
 * verdict in this package with that in mind: a stronger table pushes every
 * enemy PV up and every kit verdict down.
 *
 * It WILL move as kits gain cards, and that is correct — the reference party is
 * "these four kits, fully learnt", not "these four kits at a fixed number". The
 * guard below makes the move loud instead of silent, so the scoreboards get
 * re-run rather than compared across a change of unit.
 */
export const REFERENCE_SIGMA = 22;

/** Passive armour the reference heroes wear (cuir, +1). */
export const REFERENCE_ARMOR = 'armadura-de-cuir';

/** Every non-complementary player kit, in catalogue order. Iterate this when
 *  the question is "each main kit in turn"; it is NOT the reference party. */
export const MAIN_KITS: SkillDefinition[] = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));

function skill(skillId: string): SkillDefinition {
  const found = ALL_SKILLS.find(s => s.id === skillId);
  if (!found) {
    throw new Error(
      `bench/reference: unknown skill '${skillId}'. Either the kit was renamed or removed from `
      + `catalog.ts, or REFERENCE_KITS is stale. Fix the list rather than the caller — every `
      + `measurement in this package is denominated in this party.`,
    );
  }
  return found;
}

/**
 * One reference hero: the given kit at the given level, properly equipped.
 *
 * EQUIPMENT IS NOT COSMETIC. An unequipped party is a catastrophically weaker
 * benchmark — no shield means no defense card, and a weapon kit with no weapon
 * cannot play its cards at all, they roll flat zero. So shield + leather
 * always, and an axe whenever the kit has a card that needs one.
 */
export function hero(name: string, skillId: string, level: number = FULL_KIT): CharacterBuildSpec {
  const s = skill(skillId);
  const equipment = ['escut', REFERENCE_ARMOR];
  if (s.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return {
    name,
    classCss: s.classCss,
    iconPath: s.iconPath,
    pv: PLAYER_PV,
    category: 'player',
    equipment,
    skills: { [s.id]: levelOf(s, level) },
  };
}

/** A kit only knows as many actions as it has, so a level request is clamped. */
export function levelOf(s: SkillDefinition, level: number): number {
  return Math.max(1, Math.min(s.actions.length, level));
}

/** The reference party, as an EXPLICIT party spec (same heroes every game, so
 *  the balancer quotes the honest binomial error rather than an inflated one). */
export function referenceParty(level: number = FULL_KIT): PartySpec {
  return { characters: REFERENCE_KITS.map((id, i) => hero(`Heroi ${i + 1}`, id, level)) };
}

/** Σ of a party spec's skill levels — what the docs quote as "Σ20". */
export function sigmaOf(spec: PartySpec): number {
  if (!Array.isArray(spec.characters)) return NaN;
  return spec.characters.reduce(
    (n, c) => n + Object.values(c.skills ?? {}).reduce((m, v) => m + v, 0), 0,
  );
}

// --- The guard --------------------------------------------------------------
// Runs at import, in every harness, because the failure it catches is one
// nobody goes looking for: the numbers still print, they are simply about a
// different party than the one the report claims.
const measured = sigmaOf(referenceParty());
if (measured !== REFERENCE_SIGMA) {
  const detail = REFERENCE_KITS
    .map(id => `${id}=${levelOf(skill(id), FULL_KIT)}`).join(' + ');
  throw new Error(
    `bench/reference: the reference party is Σ${measured}, but REFERENCE_SIGMA says ${REFERENCE_SIGMA}.\n`
    + `  ${detail} = ${measured}\n`
    + `A kit gained or lost cards, so the benchmark moved. Every number measured before this change `
    + `is about a different party than every number measured after it. Decide which you want, update `
    + `REFERENCE_SIGMA (and the docs that quote it), and RE-RUN the scoreboards — do not just widen `
    + `the constant.`,
  );
}

for (const id of REFERENCE_KITS) {
  if (COMPLEMENTARY_SKILLS.has(id)) {
    throw new Error(
      `bench/reference: '${id}' is a COMPLEMENTARY kit (designed as a second skill, never a lone `
      + `main one — see skills/party.ts). A reference hero built on one alone is not a hero the `
      + `game intends, and every winrate measured against this party would be flattered.`,
    );
  }
}
