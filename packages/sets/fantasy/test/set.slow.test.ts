/**
 * WHAT ARMOUR IS FOR (intentions.md): a small lever. Measured on a fight solved
 * for an unarmoured party, replayed with 0, 1, …, all of that party in cuir,
 * and again in ferro: the whole party in iron must not move a fight by more than
 * fifteen points in its favour — clearly, not merely on the point estimate.
 *
 * The shapes skip the goblin horde, whose hide-stall (NEXT-STEPS §25.3, F17)
 * makes any fight against it a question about stalling, not armour.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaStderr, isolated, SMOKE } from '@pimpampum/bench';
import { ARMOURS, PARTY, type ArmourCurves, type ArmourPoint } from './set.work.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'set.work.ts');
const BAND = 0.15;
const FIGHTS = [
  ['escamot', [{ enemyId: 'bone-devil', count: 4 }]],
  ['cap', [{ enemyId: 'basilisk', count: 1 }]],
  ['elit', [{ enemyId: 'stone-golem', count: 3 }]],
] as const;
const NAME: Record<number, string> = { 1: 'cuir', 2: 'ferro' };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const show = (curve: ArmourPoint[]) => curve.map(p => `${p.worn}:${pct(p.winrate)}`).join(' ');

describe('armour', () => {
  let measured: ArmourCurves[];
  beforeAll(async () => {
    measured = (await Promise.all(FIGHTS.map(([label, pool]) => isolated<ArmourCurves | null>(WORK, 'armourCurves', [label, pool]))))
      .filter((s): s is ArmourCurves => s !== null);
  });

  it('was measured on at least one fight', () => {
    expect(measured.length).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)("never moves a fight by more than fifteen points in its wearers' favour", () => {
    // Printed on a pass too: the curves are what armour is tuned by.
    for (const armour of ARMOURS) {
      console.log(`${NAME[armour]} · ${measured.map(m => `${m.label} ${show(m.curves[armour])}`).join(' · ')}`);
    }
    for (const m of measured) {
      const iron = m.curves[2], none = iron[0], all = iron[PARTY];
      const d = all.winrate - none.winrate;
      const se = deltaStderr(all.winrate, all.games, none.winrate, none.games);
      expect(d - 2 * se < BAND, `armour is not a small lever — ${m.label}: ${show(iron)}`).toBe(true);
    }
  });
});
