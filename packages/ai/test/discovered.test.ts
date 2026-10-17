/**
 * DISCOVERED TESTS — positions where, played to the end with the AI on both
 * sides afterwards, another card won clearly more often than the AI's,
 * shrunk to the smallest that still showed it (`tools/src/ai-shrink.ts`).
 * OPEN ones are `todo` until the AI is fixed; flip `todo` to false in the
 * JSON once it passes, and it guards the fix from then on.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiPicks, type Position } from '../src/audit/index.js';

interface Discovered { id: string; todo: boolean; position: Position; ai: { actions: number[]; cards: string[] }; better: { cards: string[] } }
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'discovered.json');
const tests: Discovered[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];

describe('the AI no longer plays a card a discovery showed losing', () => {
  it('the file parses', () => { expect(Array.isArray(tests)).toBe(true); });
  for (const t of tests) {
    if (t.todo) { it.todo(`${t.id}: ${t.ai.cards.join(',')} → ${t.better.cards.join(',')} (open)`); continue; }
    it(`${t.id}: not ${t.ai.cards.join(',')}`, () => {
      for (const [key, p] of aiPicks(t.position, 4)) {
        expect(key, `the AI played ${t.ai.cards.join(',')} again (${p.count}/4 seeds)`).not.toBe(t.ai.actions.join(','));
      }
    });
  }
});
