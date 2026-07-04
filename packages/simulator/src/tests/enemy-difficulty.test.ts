import { describe, it, expect } from 'vitest';
import { ENEMY_TEMPLATES } from '@pimpampum/enemies';
import { calibrateSpecies, CALIBRATION_EXCLUDED } from '../calibration.js';

/**
 * Guard: the encounter model's promised winrates must match simulated reality
 * for every calibrated species. When this fails after adding an enemy or
 * changing enemy cards, run `pnpm --filter @pimpampum/simulator calibrate`
 * and write the suggested `difficulty` into the enemy's template.
 *
 * Lighter probe than the calibrate script (2 targets, fewer games): ~±4pp of
 * sampling noise, so the 12pp tolerance only trips on real drift. The tight
 * 3pp acceptance window lives in `pnpm calibrate` (heavy sampling, ±1pp),
 * which /calibrate iterates until every species fits.
 */
describe('enemy difficulty calibration', () => {
  const candidates = ENEMY_TEMPLATES.filter(t => !CALIBRATION_EXCLUDED.has(t.id));

  it.each(candidates.map(t => [t.id, t] as const))(
    '%s: model-promised winrate matches simulation',
    (_id, template) => {
      const r = calibrateSpecies(template, { targets: [0.4, 0.75], configs: 12, games: 10 });
      expect(Math.abs(r.real - r.claim),
        `claim ${(100 * r.claim).toFixed(0)}% vs real ${(100 * r.real).toFixed(0)}% — ` +
        `run \`pnpm --filter @pimpampum/simulator calibrate\` and set difficulty ≈ ${r.suggested.toFixed(2)}`,
      ).toBeLessThan(0.12);
    },
    120_000,
  );
});
