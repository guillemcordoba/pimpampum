/**
 * Where the shared content's SOURCE is — Node-only, for measurement.
 *
 * A set's bench fingerprints the code its kits run (so editing a handler
 * invalidates the cached numbers measured with it) and checks its calibration
 * snapshot against the live kit files. Once a kit or a handler lives here, the
 * set has to read this package's `src/` as well as its own, or an edit to it
 * would leave every cached number and every drift report standing.
 *
 * Read from `src/`, beside the `dist/` this runs from.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMON_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
export const COMMON_SKILLS_DIR = path.join(COMMON_SRC, 'skills');

/** Shared skill id → its file in `COMMON_SKILLS_DIR`. A file is not named by
 *  its id (`mestre-armes` is Esgrima), so the pairing is written down. */
export const COMMON_SKILL_FILES: Readonly<Record<string, string>> = {
  'mestre-armes': 'esgrima.ts',
  acrobacia: 'acrobacia.ts',
};
