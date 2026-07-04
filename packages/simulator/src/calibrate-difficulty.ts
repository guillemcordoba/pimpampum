/**
 * Recalibrate enemy `difficulty` factors against the encounter model.
 * Run after adding an enemy or changing enemy cards:
 *
 *     pnpm --filter @pimpampum/simulator calibrate            # all species
 *     pnpm --filter @pimpampum/simulator calibrate basilisk   # just one
 *
 * For each species it prints the model's promised winrate, the measured one,
 * and the `difficulty` value to write into the template if they disagree.
 * Iterate (apply → rebuild → rerun) until suggested ≈ current; the
 * `enemy-difficulty` guard test enforces the fit stays within tolerance.
 */
import { ENEMY_TEMPLATES } from '@pimpampum/enemies';
import { calibrateSpecies, CALIBRATION_EXCLUDED } from './calibration.js';

const only = process.argv[2];
const templates = only ? ENEMY_TEMPLATES.filter(t => t.id === only) : ENEMY_TEMPLATES;
if (only && templates.length === 0) {
  console.error(`Unknown enemy id "${only}". Valid ids: ${ENEMY_TEMPLATES.map(t => t.id).join(', ')}`);
  process.exit(1);
}

/** Acceptance window between promised and observed winrate. The sampling
 *  below (~2600 games/species) has ±1pp of noise, so 3pp is a real signal. */
const TOLERANCE = 0.03;
const SAMPLING = { configs: 36, games: 18 };

for (const t of templates) {
  const r = calibrateSpecies(t, SAMPLING);
  const drift = Math.abs(r.real - r.claim);
  const excluded = CALIBRATION_EXCLUDED.has(t.id) ? '  [EXCLUDED from guard test — kit broken]' : '';
  const verdict = drift <= TOLERANCE ? 'OK  ' : 'DRIFT';
  console.log(
    `${verdict} ${t.id.padEnd(14)} difficulty ${r.difficulty.toFixed(2)}  ` +
    `claim ${(100 * r.claim).toFixed(1)}%  real ${(100 * r.real).toFixed(1)}%  ` +
    `(drift ${(100 * drift).toFixed(1)}pp, ${r.games} games)  → suggested ${r.suggested.toFixed(2)}${excluded}`);
}
