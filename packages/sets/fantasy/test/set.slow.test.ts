/**
 * WHAT ARMOUR IS FOR (intentions.md). Two requirements, both measured on the
 * same curves — a fight solved for an unarmoured party, replayed with 0, 1, …,
 * all of that party in cuir, and again in ferro:
 *
 *  - A SMALL LEVER: the whole party in iron must not move a fight by more than
 *    fifteen points in its favour — clearly, not merely on the point estimate.
 *  - A SWEET SPOT: armour is right on a few members and wrong on all of them.
 *    Some interior count must clearly beat both nobody and everybody, for each
 *    armour (`sweetSpotVerdict`). Judged on the curve pooled over the fights —
 *    the requirement is about armour in the game, not against one enemy — with
 *    each fight's curve printed beside the verdict.
 *
 * The shapes skip the goblin horde, whose hide-stall (NEXT-STEPS §25.3, F17)
 * makes any fight against it a question about stalling, not armour.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaStderr, isolated, SMOKE } from '@pimpampum/bench';
import { sweetSpotVerdict, type ArmourPoint } from '@pimpampum/playtest';
import { ARMOURS, PARTY, type ArmourCurves } from './set.work.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'set.work.ts');
const BAND = 0.15;
const FIGHTS = [
  ['escamot', [{ enemyId: 'bone-devil', count: 4 }]],
  ['cap', [{ enemyId: 'basilisk', count: 1 }]],
  ['elit', [{ enemyId: 'stone-golem', count: 3 }]],
] as const;
const NAME: Record<number, string> = { 1: 'cuir', 2: 'ferro' };

/**
 * Armours known NOT to have a sweet spot — asserted to STILL fail, so the day
 * one gets it, its test turns red and it leaves this list rather than the
 * finding being forgotten. Cuir (+2, −1) had one when it was tuned, and lost
 * it narrowly when the bone devils changed after: it still peaks at three
 * wearers, but a whole party in it is not CLEARLY worse (NEXT-STEPS §26).
 * Ferro (+3, −2) lost it with the berserk review of 2026-10-03 (Cop d'espatlla
 * removed, Aguantar el cop without a guard roll): measured with the cache off,
 * it peaks at two wearers on the September commit and falls monotonically
 * from the review on (NEXT-STEPS §27.5).
 */
const KNOWN_WITHOUT_SWEET_SPOT = new Set<number>([1, 2]);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const show = (curve: ArmourPoint[]) => curve.map(p => `${p.worn}:${pct(p.winrate)}`).join(' ');

describe('armour', () => {
  let measured: ArmourCurves[];
  beforeAll(async () => {
    measured = (await Promise.all(FIGHTS.map(([label, pool]) => isolated<ArmourCurves | null>(WORK, 'armourCurves', [label, pool]))))
      .filter((s): s is ArmourCurves => s !== null);
  });

  /** The curve over every measured fight: mean winrate, games summed. */
  const pooled = (armour: number): ArmourPoint[] =>
    Array.from({ length: PARTY + 1 }, (_, worn) => {
      const pts = measured.map(m => m.curves[armour][worn]);
      return {
        worn,
        winrate: pts.reduce((s, p) => s + p.winrate, 0) / pts.length,
        games: pts.reduce((s, p) => s + p.games, 0),
      };
    });

  it('was measured on at least one fight', () => {
    expect(measured.length).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)("never moves a fight by more than fifteen points in its wearers' favour", () => {
    for (const m of measured) {
      const iron = m.curves[2], none = iron[0], all = iron[PARTY];
      const d = all.winrate - none.winrate;
      const se = deltaStderr(all.winrate, all.games, none.winrate, none.games);
      expect(d - 2 * se < BAND, `armour is not a small lever — ${m.label}: ${show(iron)}`).toBe(true);
    }
  });

  for (const armour of ARMOURS) {
    const known = KNOWN_WITHOUT_SWEET_SPOT.has(armour);
    it.skipIf(SMOKE)(`${known ? 'KNOWN to fail (F18): ' : ''}${NAME[armour]} has a sweet spot — right on a few, wrong on everyone`, () => {
      const v = sweetSpotVerdict(pooled(armour));
      const detail = `${NAME[armour]} pooled ${show(pooled(armour))} · ${measured.map(m => `${m.label} ${show(m.curves[armour])}`).join(' · ')}`;
      // Printed on a pass too: the curve is what armour tuning is steered by.
      console.log(`${v.ok ? '✅' : '❌'} ${detail}`);
      if (known) {
        expect(v.ok, `${NAME[armour]} now HAS a sweet spot — remove it from KNOWN_WITHOUT_SWEET_SPOT. ${detail}`).toBe(false);
      } else {
        expect(v.ok, `${v.reasons.join('; ')} — ${detail}`).toBe(true);
      }
    });
  }
});
