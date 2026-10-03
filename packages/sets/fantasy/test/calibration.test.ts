/**
 * THE FANTASY SET'S CALIBRATION DATA — the reference party, the fight shapes,
 * the company rows — checked for the properties every number measured in this
 * set rests on. Data checks, instant: nothing is solved or played here.
 */
import { describe, it, expect } from 'vitest';
import { MAX_MEDIAN_ROUNDS } from '@pimpampum/playtest';
import { referenceParty, standInFor } from '@pimpampum/bench';
import { ALL_SKILLS, ENEMY_DEFINITIONS } from '../src/index.js';
import {
  CALIBRATION_KITS, COMPANY, FAIR, FANTASY, pin, FIELDED, FULL_KIT, hero, MAIN_KITS, REFERENCE_KITS,
  MAX_AVG_ROUNDS, REFERENCE_SIGMA, SATURATION, SHAPES, sigmaOf, UNFIELDED_ENEMIES, UNLISTED_BODIES,
} from '../src/bench/index.js';

/** A declared exemption must say why, in a real sentence. */
const MIN_REASON = 20;

describe('the reference party is one thing, and says so when it moves', () => {
  it('is defined by named kits, never by position in the catalogue', () => {
    // The failure this replaces: `MAINS.slice(0, 4)`, copy-pasted into seven
    // files. Reordering the catalogue swapped the benchmark out from under
    // every number, silently. (The repo-wide scan for the pattern lives with
    // the other conventions, in tools.)
    expect(REFERENCE_KITS).toEqual(['enginyer-explosius', 'mestre-armes', 'nigromant', 'berserk']);
    // …and fielded from the calibration SNAPSHOT (bench/pinned.ts), never live.
    expect(FANTASY.calibration.referenceKits).toEqual(REFERENCE_KITS.map(pin));
  });

  it('holds the level sum the docs quote', () => {
    // reference.ts throws at import if this drifts; assert it here too so
    // the failure names the number rather than arriving as a module load error.
    expect(sigmaOf(referenceParty())).toBe(REFERENCE_SIGMA);
  });

  it('equips every hero — an unequipped party is a different, much weaker benchmark', () => {
    // A weapon kit with no weapon cannot play its cards at all (they roll flat
    // zero) and no shield means no defense card, so a missing item is not a
    // detail, it is a different experiment.
    for (const c of referenceParty().characters!) {
      expect(c.equipment, `${c.name} has no shield`).toContain('escut');
      expect(c.equipment, `${c.name} has no armour`).toContain('armadura-de-cuir');
    }
    const weaponKit = hero('W', 'mestre-armes', FULL_KIT);
    expect(weaponKit.equipment, 'a weapon kit must be given a weapon').toContain('destral');
  });

  it('never builds a reference hero on a complementary kit alone', () => {
    // Complementary kits (metge/runes/ombres/gel) are designed as SECOND
    // skills; a hero built on one alone is not a hero the game intends, and
    // every winrate measured against such a party is flattered.
    for (const id of REFERENCE_KITS) {
      expect(MAIN_KITS.some(s => s.id === id), `${id} is not a main kit`).toBe(true);
    }
  });
});

describe('the fight matrix', () => {
  it('measures each kit on more than one shape of fight', () => {
    // A kit that shines against a horde and folds against a boss must not be
    // able to read as fine.
    expect(SHAPES.length).toBeGreaterThan(1);
    expect(COMPANY.length).toBeGreaterThan(1);
  });

  it('writes no PV down — shapes are solved, so they cannot go stale', () => {
    // A hand-written PV is a number the solver returned under rules and an AI
    // that have both since changed. Three harnesses were still carrying
    // `horned-devil @ 118 PV`, a sponge the duration budget now refuses.
    for (const s of SHAPES) {
      for (const g of s.pool) {
        expect(Object.keys(g), `${s.label} pins a PV`).not.toContain('pv');
      }
    }
  });

  it('every company row is a real table: mains plus a complementary kit', () => {
    // And the calibration party must have this SAME shape, or the 60% it is
    // priced to does not transfer to the cells that actually get fought.
    for (const row of COMPANY) {
      expect(row.length).toBe(3);
      const mains = row.filter(id => MAIN_KITS.some(s => s.id === id)).length;
      expect(mains, `${row.join('/')} has no complementary kit`).toBeLessThan(3);
      expect(mains, `${row.join('/')} has too few mains`).toBeGreaterThan(0);
    }
  });

  it('never seats a calibration stand-in beside a copy of itself', () => {
    // The first version of the calibration party used one stand-in for every
    // row and produced `volcanic | mestre-armes | volcanic | metge` — a doubled
    // kit, which is neither neutral nor a table anyone would field.
    COMPANY.forEach((row, i) => {
      expect(row, `company ${i} already contains its stand-in ${standInFor(i)}`)
        .not.toContain(standInFor(i));
    });
  });

  it('gives every company row a stand-in', () => {
    expect(CALIBRATION_KITS.length).toBe(COMPANY.length);
    for (const id of CALIBRATION_KITS) {
      expect(MAIN_KITS.some(s => s.id === id), `${id} is not a main kit`).toBe(true);
    }
  });

  it('measures every player kit as an ALLY, not only as a subject', () => {
    // A kit missing from every COMPANY row is scored when it is the subject and
    // never once beside anyone — which is most of what a complementary kit is
    // FOR. `ombres` sat in that hole until a fourth row was added. Adding a
    // skill now fails here until someone says where it gets measured.
    const inCompany = new Set(COMPANY.flat());
    const orphans = ALL_SKILLS.filter(s => !inCompany.has(s.id)).map(s => s.id);
    expect(
      orphans,
      `these kits appear in no COMPANY row, so nothing is ever measured beside them: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('either fields every creature or says why not', () => {
    // A player kit is only ever measured against the creatures in SHAPES, so a
    // creature in none of them is one no kit is ever tested against. That was
    // true of half the roster and nothing said so. It is a DECLARED gap now.
    const fielded = new Set(SHAPES.flatMap(s => s.pool.map(p => p.enemyId)));
    const undeclared = ENEMY_DEFINITIONS
      .filter(e => !fielded.has(e.id) && !UNFIELDED_ENEMIES[e.id])
      .map(e => e.id);
    expect(
      undeclared,
      `no SHAPE fields these, and UNFIELDED_ENEMIES does not say why: ${undeclared.join(', ')}. `
      + 'Add a shape, or record the reason — do not leave a creature measured nowhere.',
    ).toEqual([]);

    for (const [id, why] of Object.entries(UNFIELDED_ENEMIES)) {
      expect(ENEMY_DEFINITIONS.some(e => e.id === id), `UNFIELDED_ENEMIES names '${id}', which no longer exists`).toBe(true);
      expect(fielded.has(id), `'${id}' IS fielded now — drop its UNFIELDED_ENEMIES entry`).toBe(false);
      expect(why.length, `'${id}' needs a real reason`).toBeGreaterThanOrEqual(MIN_REASON);
    }
  });

  it('knows how many bodies to field for every creature', () => {
    // `bodiesFor` falls back to a flat ${UNLISTED_BODIES}, which is fine for a squad and
    // meaningless for a horde or a boss — and the fallback is silent. Adding a
    // creature now fails here until someone picks a number for it.
    const missing = ENEMY_DEFINITIONS.filter(e => FIELDED[e.id] === undefined).map(e => e.id);
    expect(
      missing,
      `no body count for ${missing.join(', ')} — they would silently field ${UNLISTED_BODIES}`,
    ).toEqual([]);
    for (const id of Object.keys(FIELDED)) {
      expect(ENEMY_DEFINITIONS.some(e => e.id === id), `FIELDED names '${id}', which no longer exists`).toBe(true);
    }
  });

  it('aims inside the usable band, and leaves room on both sides', () => {
    // FAIR is only where a shape is AIMED. What a cell has to BE is
    // unsaturated, which is a far weaker requirement — and the reason three of
    // four shapes stopped being excluded (NEXT-STEPS §12.4).
    expect(FAIR).toBeGreaterThan(SATURATION.min);
    expect(FAIR).toBeLessThan(SATURATION.max);
    expect(SATURATION.min).toBeGreaterThan(0);
    expect(SATURATION.max).toBeLessThan(1);
  });

  it('solves the shapes inside the duration requirement every kit is held to', () => {
    // The cells inherit the shapes' length. Solved to a looser budget than
    // requirement 2's median bar, the calibration alone fails that requirement
    // for every kit measured in it — which it did, at the solver's default of 6.
    expect(FANTASY.calibration.maxAvgRounds).toBe(MAX_AVG_ROUNDS);
    expect(MAX_AVG_ROUNDS).toBeLessThanOrEqual(MAX_MEDIAN_ROUNDS);
  });
});
