/**
 * THIS SET'S CALIBRATION SNAPSHOT — the pinned copies of its player kits
 * (`calibration-kits/`), registered unlisted, and their drift from the live
 * kits. What a snapshot is and why: `@pimpampum/set-common/bench` (`snapshot.ts`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPinned, PIN, pin, snapshotDrift } from '@pimpampum/set-common/bench';
import { ALL_SKILLS, getSkill, registerSkill, type SkillDefinition } from '../index.js';
import { PINNED_FILES, PINNED_SKILLS, REFRESHED } from './calibration-kits/index.js';

export { PIN, pin, REFRESHED };

for (const s of PINNED_SKILLS) {
  assertPinned('set-elements', s);
  registerSkill(s, false);
}

export const PINNED: readonly SkillDefinition[] = PINNED_SKILLS;

/** Where the live kits and their copies are — parameters of the check only so a test can point it at an edited copy. */
export const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
export const LIVE = path.join(SRC, 'players/skills');
export const COPIES = path.join(SRC, 'bench/calibration-kits');

export function calibrationDrift(live = LIVE, copies = COPIES): string[] {
  return snapshotDrift({
    live, copies, files: PINNED_FILES, getSkill, fielded: id => ALL_SKILLS.some(s => s.id === id),
  });
}
