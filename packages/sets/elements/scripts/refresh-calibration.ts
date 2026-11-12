/**
 * TAKE A NEW CALIBRATION SNAPSHOT of this set — what that does, and when to
 * want it: `refreshCalibration` (`@pimpampum/set-common/bench`).
 *
 * Run: pnpm calibration:refresh
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshCalibration } from '@pimpampum/set-common/bench';
import { ALL_SKILLS } from '../src/players/catalog.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

await refreshCalibration(
  path.join(SRC, 'players/skills'), path.join(SRC, 'bench/calibration-kits'), id => ALL_SKILLS.some(s => s.id === id),
);
