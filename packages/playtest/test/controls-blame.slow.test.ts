/**
 * THE CULPRIT SEARCH, CONTROLLED: a kit whose problem is ONE known card.
 *
 * `blameKit` takes each card out of hand in turn and ranks the removals by how
 * far they move a failing verdict back toward passing. Here the answer is
 * known by construction — three plain cards and one 20d6 that sweeps every
 * enemy first — so the search must put the planted card at the top, and by a
 * margin, or its rankings mean nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { blameIsolated, type Culprit, type KitReport } from '../src/index.js';
import { GAMES, run, SMOKE, SYNTHETIC_MODULE } from './budgets.js';

describe('the culprit search finds a planted card', () => {
  let report: KitReport, culprits: Culprit[];
  beforeAll(async () => {
    [report, culprits] = await Promise.all([
      run('plantedKit', [], GAMES),
      blameIsolated({
        set: { module: SYNTHETIC_MODULE, export: 'SYNTHETIC' },
        subject: { control: 'plantedKit', args: [] }, games: GAMES,
      }, 'strength'),
    ]);
  });

  it('ranks every card of the kit', () => {
    expect(culprits.length).toBe(4);
  });

  it.skipIf(SMOKE)('the premise: the planted kit is above the power band', () => {
    expect(report.strength.ok, report.strength.detail).toBe(false);
    expect(report.strength.band!.delta).toBeGreaterThan(0);
  });

  it.skipIf(SMOKE)('names the planted card first, clearly ahead of the rest', () => {
    const planted = report.cards.find(c => c.name === 'Planted')!.id;
    expect(culprits[0].card, JSON.stringify(culprits)).toBe(planted);
    expect(culprits[0].shift, JSON.stringify(culprits)).toBeGreaterThan(2 * Math.max(0.01, culprits[1].shift));
  });
});
