/**
 * THE CALIBRATION SNAPSHOT — pinned copies of a set's player kits, and the
 * ruler every kit is measured against. Each set holds its own
 * (`src/bench/pinned.ts`); what they do with it is here.
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
import { liveKitFile, liveKitFiles, PIN, pinSource, type PinnableSkill } from './pin-source.js';

/**
 * Every id the copy carries must be pinned. The rename works on string
 * literals, so an id a shared factory supplies by default escapes it — and an
 * unpinned card id shares its live twin's statistics and lookups silently.
 */
export function assertPinned(
  set: string, copy: { id: string; actions: { id: string; skillId: string }[]; effects?: Record<string, unknown> },
): void {
  const loose = [copy.id, ...copy.actions.flatMap(a => [a.id, a.skillId]), ...Object.keys(copy.effects ?? {})]
    .filter(id => !id.endsWith(PIN));
  if (loose.length) {
    throw new Error(
      `${set}/pinned: the calibration copy of '${copy.id}' has unpinned ids or effect types: ${loose.join(', ')}. `
      + `They are not string literals in the kit's own file (a shared factory's default?). Pass them `
      + `explicitly in the live kit, then run pnpm calibration:refresh.`,
    );
  }
}

export interface Snapshot {
  /** The dir of the set's own live kits, and the dir of the copies. */
  live: string;
  copies: string;
  /** Live skill id → the file its copy is in (the snapshot's `PINNED_FILES`). */
  files: Readonly<Record<string, string>>;
  getSkill(id: string): PinnableSkill | undefined;
  /** Does the set's catalogue list this (shared) kit? */
  fielded(id: string): boolean;
}

/**
 * Which live kits differ from their calibration copy — the kits whose edits
 * the baselines do NOT yet reflect. Empty means the ruler is the game.
 *
 * Re-pins each live file and compares it with the copy, byte for byte: the
 * same function made the copy, so equal means nothing has changed since. A
 * shared kit the set fields is read from set-common (`liveKitFile`).
 */
export function snapshotDrift({ live, copies, files, getSkill, fielded }: Snapshot): string[] {
  if (!fs.existsSync(live)) return [];
  const snapshotted = new Set(Object.entries(files).map(([id, file]) => liveKitFile(id, file, live)));
  const unsnapshotted = liveKitFiles(live, fielded).filter(f => !snapshotted.has(f))
    .map(f => `${path.basename(f, '.ts')} (not in the snapshot)`);
  const drifted = Object.entries(files).flatMap(([id, file]) => {
    const skill = getSkill(id);
    const liveFile = liveKitFile(id, file, live);
    if (!skill || !fs.existsSync(liveFile)) return [`${id} (no longer a live kit)`];
    const copy = fs.readFileSync(path.join(copies, file), 'utf8');
    return pinSource(fs.readFileSync(liveFile, 'utf8'), skill) === copy ? [] : [id];
  });
  return [...drifted, ...unsnapshotted];
}
