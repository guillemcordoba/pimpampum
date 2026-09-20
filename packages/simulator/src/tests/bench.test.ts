/**
 * THE ANTI-DRIFT GUARD.
 *
 * Every defect this file checks for was a real one, and every one of them was
 * SILENT: the harnesses kept printing numbers, the numbers were simply about
 * something other than what the report said. Nothing failed, so nothing was
 * noticed — in one case for a whole session's worth of conclusions.
 *
 * So the invariants are asserted structurally, by scanning the source, rather
 * than trusted to review. A convention nobody can violate by accident is worth
 * more here than a convention written down: the cost of a wrong number in this
 * package is a content decision made on it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_KIT, MAIN_KITS, REFERENCE_KITS, REFERENCE_SIGMA,
  hero, referenceParty, sigmaOf,
} from '../bench/reference.js';
import { deltaStderr, gamesFor, maxOfKBias, pct, significant, stderr } from '../bench/report.js';
import {
  CALIBRATION_KITS, COMPANY, FAIR, FIELDED, SATURATION, SHAPES, UNFIELDED_ENEMIES,
  UNLISTED_BODIES, calibrationKit,
} from '../bench/shapes.js';
import { ALL_SKILLS } from '@pimpampum/skills';
import { ENEMY_DEFINITIONS } from '@pimpampum/enemies';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every .ts file under src/, with its path relative to src/. */
function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) out.push({ rel: path.relative(SRC, full), text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}

/** Source with comments stripped, so a rule about CODE is not tripped by prose
 *  describing the rule. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * ESCAPE HATCH, WITH A REASON ATTACHED.
 *
 * Some files genuinely should not obey one of these rules — a harness that
 * computes exact probabilities from convolved dice has no sampling error to
 * quote, and a mechanics seam test has no AI to set a depth for. A rule with
 * no way out gets deleted the first time it is inconvenient; a rule you can
 * only escape by writing down WHY survives.
 *
 *   // bench-exempt(interval): exact convolved-dice probabilities, not a sample
 *
 * The reason is required and is asserted to be substantive, so the hatch
 * cannot become a silent `// eslint-disable`.
 */
const MIN_REASON = 20;
function exemption(text: string, rule: string): string | null {
  const m = text.match(new RegExp(`bench-exempt\\(${rule}\\):\\s*(.+)`));
  return m ? m[1].trim() : null;
}

/** Files subject to `rule`, plus the reasons given by those that opted out. */
function subjectTo(rule: string): { files: { rel: string; text: string }[]; reasons: [string, string][] } {
  const files: { rel: string; text: string }[] = [];
  const reasons: [string, string][] = [];
  for (const s of sources()) {
    if (s.rel === 'tests/bench.test.ts') continue;     // this file states the rules
    const why = exemption(s.text, rule);
    if (why) reasons.push([s.rel, why]);
    else files.push(s);
  }
  return { files, reasons };
}

describe('the escape hatch cannot be used silently', () => {
  it('every exemption gives a substantive reason', () => {
    for (const rule of ['seeded', 'depth', 'interval']) {
      for (const [rel, why] of subjectTo(rule).reasons) {
        expect(why.length, `${rel}: bench-exempt(${rule}) needs a real reason, got "${why}"`)
          .toBeGreaterThanOrEqual(MIN_REASON);
      }
    }
  });
});

describe('the reference party is one thing, and says so when it moves', () => {
  it('is defined by named kits, never by position in the catalogue', () => {
    // The failure this replaces: `MAINS.slice(0, 4)`, copy-pasted into seven
    // files. Adding a kit to catalog.ts or reordering it swapped the benchmark
    // out from under every number in the package, silently.
    expect(REFERENCE_KITS).toEqual(['enginyer-explosius', 'mestre-armes', 'nigromant', 'berserk']);
    for (const s of sources()) {
      if (s.rel === 'tests/bench.test.ts') continue;
      expect(
        code(s.text),
        `${s.rel}: re-derives the reference party positionally. Import referenceParty() from bench/reference.ts.`,
      ).not.toMatch(/\.slice\(0,\s*4\)/);
    }
  });

  it('holds the level sum the docs quote', () => {
    // bench/reference.ts throws at import if this drifts; assert it here too so
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

describe('randomness is seeded', () => {
  it('nothing in src draws from bare Math.random()', () => {
    // An unseeded arm inside a `withSeed` block is the worst case: it LOOKS
    // reproducible, shares no random numbers with the arm it is compared
    // against, and quietly widens every difference the harness reports.
    // play.ts is the one exception — it deliberately replaces the global with a
    // seeded LCG so a hand-played script always replays the same game.
    const offenders = subjectTo('seeded').files
      .filter(s => /Math\.random\s*\(/.test(code(s.text)))
      .map(s => s.rel);
    expect(offenders, `use random() from @pimpampum/engine instead: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('AI depth is never implicit', () => {
  it('every CombatEngine states its aiDepth or supplies an actionChooser', () => {
    // The engine defaults aiDepth to 0. The balancer prices at 1. A harness
    // that omits the option therefore measures weaker play than the number it
    // is checking was made with — which is exactly how main.ts came to grade
    // depth-1 solves with depth-0 play, for as long as that file existed.
    // An actionChooser satisfies the rule because it bypasses aiDepth entirely.
    const offenders: string[] = [];
    for (const s of subjectTo('depth').files) {
      const stripped = code(s.text);
      // Match the option object of each `new CombatEngine(...)` construction.
      for (const m of stripped.matchAll(/new CombatEngine\([^;]*?\{([^{}]*)\}/g)) {
        const opts = m[1];
        if (!/aiDepth/.test(opts) && !/actionChooser/.test(opts)) {
          offenders.push(`${s.rel}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `state the depth explicitly:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

describe('no winrate is printed without its error bar', () => {
  it('percentages go through bench/report.ts', () => {
    // Before this rule only experiment-seat.ts quoted an interval; everything
    // else printed one decimal of false precision, and a 2pp difference off 300
    // games read as a finding.
    const offenders: string[] = [];
    for (const s of subjectTo('interval').files) {
      if (s.rel.startsWith('bench/') || s.rel.startsWith('tests/')) continue;
      for (const m of code(s.text).matchAll(/toFixed\(\d\)[^`'"\n]{0,12}%/g)) {
        offenders.push(`${s.rel}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `format winrates with pct()/pctCoarse()/deltaPP() from bench/report.ts:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the report maths', () => {
  it('quotes a wider interval for a smaller sample', () => {
    expect(stderr(0.5, 100)).toBeGreaterThan(stderr(0.5, 1000));
  });

  it('never quotes ±0 at the extremes — a 0% cell is "we saw nothing", not certainty', () => {
    expect(stderr(0, 300)).toBeGreaterThan(0);
    expect(pct(1, 300)).toMatch(/±[1-9]|±0\.[1-9]/);
  });

  it('prices a DIFFERENCE wider than either side of it', () => {
    const d = deltaStderr(0.6, 300, 0.4, 300);
    expect(d).toBeGreaterThan(stderr(0.6, 300));
    expect(d).toBeGreaterThan(stderr(0.4, 300));
  });

  it('calls a gap inside the noise insignificant', () => {
    expect(significant(0.52, 300, 0.50, 300)).toBe(false);   // 2pp off 300 games
    expect(significant(0.70, 300, 0.50, 300)).toBe(true);    // 20pp off 300 games
  });

  it('agrees with the sample size the docs quote for a 3pp level step', () => {
    // NEXT-STEPS §5.1 used ~2000 games per level at ±1.1pp for exactly this.
    expect(gamesFor(3)).toBeGreaterThan(1500);
    expect(gamesFor(3)).toBeLessThan(3000);
  });

  it('knows the max of k noisy samples overstates the truth, and by how much', () => {
    // Winner's curse. The balancer documents it at ~4pp; a report card taking
    // the toughest of 14 baselines is doing it at ~1.7σ.
    expect(maxOfKBias(1)).toBe(0);
    expect(maxOfKBias(14)).toBeGreaterThan(1.5);
    expect(maxOfKBias(14)).toBeLessThan(2.0);
    expect(maxOfKBias(20)).toBeGreaterThan(maxOfKBias(5));
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
      expect(row, `company ${i} already contains its stand-in ${calibrationKit(i)}`)
        .not.toContain(calibrationKit(i));
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
});

/**
 * WHAT A CARD IS WORTH IS NOT WHAT THE AI THINKS OF IT.
 *
 * Requirement 4/5 spent three sessions as a play rate — "how often did the AI
 * choose this card out of the turns it was legal" — and in that form it made a
 * hand-written evaluator the judge of the content the evaluator exists to
 * serve. The same eleven cards read DEAD, then ALIVE, then dead again while not
 * one die changed; what moved was a weight in `ai.ts`. It is now a LEAVE-ONE-OUT
 * ABLATION: play the kit, play it again with the card physically absent from
 * the hand, subtract.
 *
 * These guards exist because the play-rate version is the easy thing to write.
 * The counters are still there (they explain a verdict, which is a real job),
 * and nothing but a test stops the next edit from quietly promoting them back
 * into the verdict itself.
 */
describe('a card is judged by its absence, not by the AI', () => {
  const lib = fs.readFileSync(path.join(SRC, 'kit-analyzer-lib.ts'), 'utf8');

  it('the 4/5 verdict is computed from an ablation run', () => {
    const block = lib.slice(lib.indexOf('// 4/5.'), lib.indexOf('// 7.'));
    expect(block.length, 'could not find the 4/5 block — did the markers move?').toBeGreaterThan(200);
    expect(
      /setupFor\([^)]*,\s*c\.id\)/.test(block),
      'requirement 4/5 no longer builds an ABLATED subject (`setupFor(subject, level, c.id)`). '
      + 'Whatever it is measuring now, it is not what the kit loses without the card.',
    ).toBe(true);
    expect(
      block.includes('pairedMatrixDelta'),
      'the ablation must be read with the PAIRED estimator: both arms meet the same cells from '
      + 'the same seeds, and treating them as independent puts a bar wider than any card is worth '
      + 'around every value, which hands the verdict to noise.',
    ).toBe(true);
  });

  it('play rate never decides the verdict', () => {
    const block = lib.slice(lib.indexOf('// 4/5.'), lib.indexOf('// 7.'));
    // `legal`/`played` may be READ (they annotate a value) but must not be
    // compared against a threshold — that is the old test wearing new clothes.
    const rate = /(played\s*\/\s*legal|rate)\s*[+\-]?[^;]*[<>]/.test(block);
    expect(
      rate,
      'a play rate is being compared against a threshold inside requirement 4/5. Counting how '
      + 'often the AI picked a card measures the AI. Report it as the EXPLANATION of an ablation '
      + 'value if it helps; do not let it decide anything.',
    ).toBe(false);
  });

  it('the ablation removes the card, not the skill level', () => {
    const ref = fs.readFileSync(path.join(SRC, 'bench/reference.ts'), 'utf8');
    const fn = ref.slice(ref.indexOf('export function heroWithout'));
    expect(
      fn.slice(0, fn.indexOf('\n}')).includes('...base'),
      'heroWithout must start from the full hero and drop one card id. Rebuilding it at a lower '
      + 'LEVEL would remove the card and the +1 on every roll that comes with it, and the '
      + 'difference measured would be mostly the bonus.',
    ).toBe(true);
  });

  it('a negative ablation value flags the AI, it does not fail the kit', () => {
    // A larger choice set cannot hurt someone who plays it optimally — you can
    // always ignore a card. So value < 0 says the AI is drawn to the card
    // wrongly, NOT that the card is bad, and failing the kit on it would put
    // the evaluator back in the judge's seat by the other door. The ONE claim
    // that survives a better player is value > 0: a lower bound on what the
    // card is worth.
    const block = lib.slice(lib.indexOf('// 4/5.'), lib.indexOf('// 7.'));
    const ok = block.match(/ok:\s*([^,\n]+)/);
    expect(ok, 'no ok: line in the 4/5 verdict').not.toBeNull();
    expect(
      /misplay|negative|trap/i.test(ok![1]),
      `requirement 4/5 fails on "${ok![1].trim()}". A card the AI plays WORSE for holding is a `
      + 'finding about the AI, and an optimal player is never hurt by an extra option. Report it, '
      + 'do not fail the kit on it.',
    ).toBe(false);
  });

  it('an ablated subject is keyed apart from the whole kit', () => {
    // Same cells, same games, same seed — the ONLY thing separating an ablated
    // run from the full-kit run in the cache is the card in the key. Drop it
    // and every ablation reads back the full kit's own numbers, which is a
    // value of exactly zero for every card: the verdict this test defends,
    // arrived at by never running the experiment.
    const fn = lib.slice(lib.indexOf('export function subjectPrintFor'));
    expect(fn.slice(0, fn.indexOf('\n}')).includes('without')).toBe(true);
  });
});
