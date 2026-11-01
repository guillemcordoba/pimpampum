/**
 * EVERY STATUS PRICES ITSELF (rule of 2026-11-01). The AI's evaluator sees a
 * status only through its price, so content applies the engine's status kinds
 * (`STATUS_KINDS`, priced by the engine) — and a one-of-a-kind
 * `StatusBehavior` must declare `positionValue` itself (0 is a fine price for
 * one that lives and dies inside its round, said on purpose).
 *
 * `KNOWN_UNPRICED` is what the card migration still has to price or move onto
 * a kind, as of 2026-11-01. It may only shrink: a new unpriced behaviour
 * fails, and one that got priced must leave the list.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sets');

const KNOWN_UNPRICED = [
  'common/src/effects/focus.ts CARREGAT',
  'common/src/skills/acrobacia.ts LLANCAT',
  'common/src/skills/acrobacia.ts RESCAT',
  'common/src/skills/artifex.ts BUMERANG',
  'common/src/skills/artifex.ts PARAIGUA',
  'common/src/skills/artifex.ts GANXO',
  'elements/src/enemies/creatures/arquer-yuyan.ts SENSE_DANY',
  'elements/src/enemies/creatures/shirshu.ts CEGUES',
  'elements/src/enemies/creatures/unagi.ts PANXA',
  'elements/src/players/effects/generic.ts VANISHED',
  'elements/src/players/effects/status-behaviors.ts DOT',
  'elements/src/players/effects/status-behaviors.ts REGEN',
  'fantasy/src/enemies/creatures/goblin.ts AMAGAT',
  'fantasy/src/enemies/creatures/goblin.ts DESCOBERT',
  'fantasy/src/players/effects/attack-effects.ts INDEFENSABLE',
  'fantasy/src/players/effects/focus-effects.ts MARCA_OBJECTIU',
  'fantasy/src/players/effects/focus-effects.ts ARMA_ENVERINADA',
  'fantasy/src/players/effects/status-behaviors.ts DOT',
  'fantasy/src/players/effects/status-behaviors.ts REGEN',
  'fantasy/src/players/skills/berserk.ts FURIA_ESTAT',
  'fantasy/src/players/skills/berserk.ts AGUANTANT',
  'fantasy/src/players/skills/explosives-engineer.ts BANDOLER',
  'fantasy/src/players/skills/explosives-engineer.ts ENCEGAT',
  'fantasy/src/players/skills/metge.ts ADRENALINA',
  'fantasy/src/players/skills/runes.ts RUNA_FULLA',
  'fantasy/src/players/skills/runes.ts RUNA_CONFUSIO',
  'fantasy/src/players/skills/runes.ts RUNA_ESCUT',
  'fantasy/src/players/skills/volcanic.ts RIU_DE_LAVA',
];

/** Every `const NAME: StatusBehavior = { … }` in the sets' sources (the
 *  pinned calibration copies aside), and whether its body prices it. */
function behaviours(): { id: string; priced: boolean }[] {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['calibration-kits', 'node_modules', 'dist', 'test'].includes(e.name)) walk(p); }
      else if (p.endsWith('.ts')) files.push(p);
    }
  };
  walk(SETS);
  const out: { id: string; priced: boolean }[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*:\s*StatusBehavior\s*=\s*\{/g)) {
      let depth = 0, j = src.indexOf('{', m.index! + m[0].length - 1);
      const start = j;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      out.push({ id: `${path.relative(SETS, f)} ${m[1]}`, priced: /\bpositionValue\b/.test(src.slice(start, j)) });
    }
  }
  return out;
}

describe('every status prices itself', () => {
  const all = behaviours();

  it('finds the behaviours it checks', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('no unpriced behaviour beyond the known list', () => {
    expect(all.filter(b => !b.priced).map(b => b.id).filter(id => !KNOWN_UNPRICED.includes(id))).toEqual([]);
  });

  it('the known list only holds behaviours still unpriced (strike one out once priced)', () => {
    const unpriced = new Set(all.filter(b => !b.priced).map(b => b.id));
    expect(KNOWN_UNPRICED.filter(id => !unpriced.has(id))).toEqual([]);
  });
});
