/**
 * REQUIREMENT 5 — HERO SCALE: a fast attack is weak, or something answers it
 * (intentions.md). Measured heroes against heroes at the players' own PV
 * (`measureHeroScale`), where a blow that takes a fresh hero to 0 is a KO; the
 * kit cells fight creatures of 30-120 PV and never see one (OPEN.md B19).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { isolated, SMOKE } from '@pimpampum/bench';
import { FAST_ONE_SHOT_MAX, type HeroScaleReport } from '@pimpampum/playtest';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hero-scale.work.ts');

/**
 * Fast attacks KNOWN to one-shot too often today, by level — asserted to STILL
 * do so, so the day one is fixed its test turns red and it leaves the list.
 * Filled from the measurement, never by guessing.
 */
const KNOWN: Record<number, Record<string, string>> = {
  // Mestre del xi's three fast 1d6 blows (2026-11-02: 0.15 KOs a play at level
  // 6, 0.22 at level 10; OPEN.md B19).
  6: { 'rafega-de-dits': 'three fast 1d6 blows' },
  10: { 'rafega-de-dits': 'three fast 1d6 blows' },
};

for (const level of [6, 10]) {
  describe(`hero scale, level ${level}`, () => {
    let r: HeroScaleReport;
    beforeAll(async () => { r = await isolated<HeroScaleReport>(WORK, 'heroScale', [level]); });

    it('was measured', () => { expect(r.fights).toBeGreaterThan(0); });

    it.skipIf(SMOKE)('no fast attack one-shots a fresh hero with nothing to answer it, but the KNOWN ones', () => {
      const rate = (id: string) => {
        const c = r.cards.find(x => x.id === id);
        return c ? `${c.oneShots} KOs in ${c.plays} plays` : 'never played';
      };
      for (const id of Object.keys(KNOWN[level])) {
        expect(r.fastAttacks.broken, `${id} no longer one-shots more than ${FAST_ONE_SHOT_MAX * 100}% of its plays (${rate(id)}). Delete it from KNOWN.`).toContain(id);
      }
      const unknown = r.fastAttacks.broken.filter(id => !(id in KNOWN[level]));
      expect(unknown, unknown.map(id => `${id}: ${rate(id)}`).join('; ')).toEqual([]);
    });
  });
}
