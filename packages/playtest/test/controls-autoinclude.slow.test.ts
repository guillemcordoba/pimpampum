/**
 * REQUIREMENT 5 — a card that is always the answer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KitReport } from '../src/index.js';
import { cardId, expectWellFormed, FOR_CARDS, GAMES, run, SMOKE } from './budgets.js';

describe('a kit with one card that is ALWAYS the right play', () => {
  let r: KitReport;
  beforeAll(async () => { r = await run('dominantKit', [], GAMES, FOR_CARDS); });

  it('produces a whole report', () => expectWellFormed(r, 3));

  it.skipIf(SMOKE)('requirement 5 fails the kit, naming the dominant card', () => {
    expect(r.autoInclude.ok, r.autoInclude.detail).toBe(false);
    expect(r.autoInclude.cards, r.autoInclude.detail).toContain(cardId(r, 'Answer'));
  });

  it.skipIf(SMOKE)('does NOT call the feeble cards auto-include — they are the other tail', () => {
    for (const name of ['Feeble', 'Feeble2']) {
      expect(r.autoInclude.cards, r.autoInclude.detail).not.toContain(cardId(r, name));
    }
  });
});
