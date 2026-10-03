/**
 * Every main kit has its own requirement file — adding a kit to the catalogue
 * fails here until someone says how it is judged.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_KITS } from '../../src/bench/index.js';
import { KNOWN } from './known.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('the per-kit suites', () => {
  it('cover every main kit', () => {
    const missing = MAIN_KITS.map(k => k.id).filter(id => !fs.existsSync(path.join(HERE, `${id}.slow.test.ts`)));
    expect(missing, 'add a kits/<id>.slow.test.ts for each').toEqual([]);
  });

  it('list known failures only for kits that exist, with a real reason', () => {
    for (const [kit, reqs] of Object.entries(KNOWN)) {
      expect(MAIN_KITS.some(k => k.id === kit), `KNOWN names '${kit}', which is not a main kit`).toBe(true);
      for (const why of Object.values(reqs)) expect(why!.length).toBeGreaterThanOrEqual(20);
    }
  });
});
