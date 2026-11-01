/**
 * EVERY MUTANT STILL APPLIES. A mutant whose find-string no longer matches
 * today's source exactly once scores nothing in `mutation.ts`, and they rot
 * silently as code moves (six had, by 2026-11-01). Checked here, in seconds,
 * so a refactor that moves a mutated line fails the fast tier at once.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from '../src/mutants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('the mutants', () => {
  it('each find-string matches its file exactly once', () => {
    const stale = MUTANTS
      .map(m => ({ m, hits: fs.readFileSync(path.join(ROOT, m.file), 'utf8').split(m.find).length - 1 }))
      .filter(({ hits }) => hits !== 1)
      .map(({ m, hits }) => `${hits}× ${m.file}: ${m.label}`);
    expect(stale).toEqual([]);
  });

  it('each one changes something', () => {
    expect(MUTANTS.filter(m => m.find === m.replace).map(m => m.label)).toEqual([]);
  });
});
