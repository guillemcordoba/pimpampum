/**
 * THE CALIBRATION SNAPSHOT — pinned copies of the player kits, and the ruler
 * every kit is measured against.
 *
 * The calibration (reference party, stand-ins, company rows) names every player
 * kit, so it used to be built from the LIVE kits: editing berserk moved the
 * solved shapes and every baseline, and the next measurement of ANY kit
 * recalibrated from scratch — over an hour, for a one-card tweak. Worse, the
 * edit moved the ruler it was being measured with.
 *
 * So the calibration fields the copies in `calibration-kits/`, which only
 * `pnpm calibration:refresh` rewrites. A live edit re-measures that kit's own
 * rows and nothing else. The price is DRIFT — while you polish, the table still
 * seats the old version of every kit — which `calibrationDrift()` reports, so
 * a stale ruler is a visible decision rather than an accident.
 *
 * The copies are renamed at the source (`berserk@cal`, its cards and effect
 * types likewise), so a pinned kit and its live self can share a table without
 * sharing a lookup or a handler. They are registered UNLISTED: they resolve by
 * id, and nothing that iterates `ALL_SKILLS` — the drawn party above all —
 * ever meets them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkill, registerSkill, type SkillDefinition } from '../index.js';
import { PINNED_FILES, PINNED_SKILLS, REFRESHED } from './calibration-kits/index.js';
import { PIN, pinSource } from './pin-source.js';

export { PIN, REFRESHED };

/** The pinned id for a live kit id. */
export const pin = (id: string): string => id + PIN;

// Every id the copy carries must be pinned. The rename works on string
// literals, so an id a shared factory supplies by default escapes it — and an
// unpinned card id shares its live twin's statistics and lookups silently.
for (const s of PINNED_SKILLS) {
  const loose = [s.id, ...s.actions.flatMap(a => [a.id, a.skillId]), ...Object.keys(s.effects ?? {})]
    .filter(id => !id.endsWith(PIN));
  if (loose.length) {
    throw new Error(
      `set-fantasy/pinned: the calibration copy of '${s.id}' has unpinned ids or effect types: ${loose.join(', ')}. `
      + `They are not string literals in the kit's own file (a shared factory's default?). Pass them `
      + `explicitly in the live kit, then run pnpm calibration:refresh.`,
    );
  }
  registerSkill(s, false);
}

export const PINNED: readonly SkillDefinition[] = PINNED_SKILLS;

/** Where the live kits and their copies are — parameters of the check only so a test can point it at an edited copy. */
export const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
export const LIVE = path.join(SRC, 'players/skills');
export const COPIES = path.join(SRC, 'bench/calibration-kits');

/**
 * Which live kits differ from their calibration copy — the kits whose edits
 * the baselines do NOT yet reflect. Empty means the ruler is the game.
 *
 * Re-pins each live file and compares it with the copy, byte for byte: the
 * same function made the copy, so equal means nothing has changed since.
 */
export function calibrationDrift(live = LIVE, copies = COPIES): string[] {
  if (!fs.existsSync(live)) return [];
  const pinnedFiles = new Set(Object.values(PINNED_FILES));
  const unsnapshotted = fs.readdirSync(live).filter(f => f.endsWith('.ts') && !pinnedFiles.has(f))
    .map(f => `${f.replace(/\.ts$/, '')} (not in the snapshot)`);
  const drifted = Object.entries(PINNED_FILES).flatMap(([id, file]) => {
    const skill = getSkill(id);
    const liveFile = path.join(live, file);
    if (!skill || !fs.existsSync(liveFile)) return [`${id} (no longer a live kit)`];
    const copy = fs.readFileSync(path.join(copies, file), 'utf8');
    return pinSource(fs.readFileSync(liveFile, 'utf8'), skill) === copy ? [] : [id];
  });
  return [...drifted, ...unsnapshotted];
}
