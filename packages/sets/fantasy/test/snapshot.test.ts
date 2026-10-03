/**
 * THE CALIBRATION SNAPSHOT (src/bench/pinned.ts) — the pinned kits every
 * baseline is measured with, so that editing a live kit re-measures that kit
 * and nothing else.
 *
 * What must hold for that to be safe: the calibration fields ONLY pinned kits
 * and a subject is always live; a pinned kit never leaks into anything that
 * iterates the catalogue (the drawn party above all); its handlers resolve;
 * and, where nothing has drifted, it IS its live twin, card for card. Drift
 * itself is reported, not failed — polishing a kit against a still ruler is the
 * point — except for a kit the snapshot does not have at all, which the
 * calibration cannot field.
 */
import { describe, it, expect, onTestFinished } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setRng, seededRng } from '@pimpampum/engine';
import { ALL_SKILLS, buildReferenceParty, getSkill } from '../src/index.js';
import { calibrationDrift, FANTASY, pin, PIN, PINNED, REFRESHED } from '../src/bench/index.js';
import { pinSource } from '../src/bench/pin-source.js';
import { LIVE } from '../src/bench/pinned.js';

const unpin = (id: string) => id.slice(0, -PIN.length);

describe('the calibration fields pinned kits, the subject is live', () => {
  it('every kit the calibration names is pinned', () => {
    const { referenceKits, company, standIns } = FANTASY.calibration;
    for (const id of [...referenceKits, ...company.flat(), ...standIns]) {
      expect(id.endsWith(PIN), id).toBe(true);
      expect(getSkill(id), id).toBeDefined();
    }
  });

  it('a subject is built from the live kit', () => {
    expect(Object.keys(FANTASY.hero('x', 'berserk').skills)).toEqual(['berserk']);
    expect(FANTASY.calibration.mainKits.every(id => !id.endsWith(PIN))).toBe(true);
  });
});

describe('a pinned kit stays out of the catalogue', () => {
  it('is not listed', () => {
    expect(ALL_SKILLS.filter(s => s.id.endsWith(PIN)).map(s => s.id)).toEqual([]);
    expect(FANTASY.kitIds('player').filter(id => id.endsWith(PIN))).toEqual([]);
  });

  it('is never fielded by a drawn party', () => {
    setRng(seededRng(7));
    onTestFinished(() => setRng(null));
    for (let i = 0; i < 200; i++) {
      for (const c of buildReferenceParty({ count: 4, levels: 6 })) {
        expect([...c.skills.keys()].filter(id => id.endsWith(PIN))).toEqual([]);
      }
    }
  });
});

describe('a pinned kit works', () => {
  it('carries its own pinned handlers, all of them resolvable', () => {
    const registry = FANTASY.registry();
    for (const s of PINNED) {
      for (const a of s.actions) {
        for (const e of a.effects) expect(registry.has(e.type), `${a.id}: ${e.type}`).toBe(true);
      }
      for (const type of Object.keys(s.effects ?? {})) expect(type.endsWith(PIN), type).toBe(true);
    }
  });

  it('where nothing drifted, is its live twin card for card', () => {
    const drifted = new Set(calibrationDrift());
    for (const s of PINNED) {
      const live = getSkill(unpin(s.id))!;
      if (drifted.has(live.id)) continue;
      const shape = (a: typeof s.actions[number]) => ({
        id: a.id.replace(PIN, ''), speed: a.speed, type: a.actionType, dice: a.dice?.toString(),
        unlock: a.unlockLevel, targets: a.targetCount, effects: a.effects.map(e => e.type.replace(PIN, '')),
      });
      expect(s.actions.map(shape), s.id).toEqual(live.actions.map(shape));
    }
  });
});

describe('pinning a source file', () => {
  const skill = { id: 'k', actions: [{ id: 'k-card' }], effects: { k_fx: {} } };

  it('pins quoted ids and bare effect keys, and re-roots imports', () => {
    const out = pinSource(
      "import { x } from '../types.js';\nconst e = { k_fx: 1 };\naction({ id: 'k-card', skillId: 'k', effects: [{ type: 'k_fx' }] });\n",
      skill,
    );
    expect(out).toContain("from '../../players/types.js'");
    expect(out).toContain("{ 'k_fx@cal': 1 }");
    expect(out).toContain("id: 'k-card@cal', skillId: 'k@cal'");
    expect(out).toContain("type: 'k_fx@cal'");
  });

  it('leaves other names alone — a status key or a longer id containing one', () => {
    const out = pinSource("setStatus('k-card-extra'); hasStatus('furia'); const q = { value: 1 };", skill);
    expect(out).toContain("'k-card-extra'");
    expect(out).toContain("'furia'");
    expect(out).toContain('{ value: 1 }');
  });
});

describe('drift', () => {
  it('the snapshot has every live kit (a missing one cannot be fielded — refresh)', () => {
    const drifted = calibrationDrift();
    // Reported on every run, never failed: the baselines do not reflect these
    // kits' edits, which is the point while polishing and a decision after.
    console.log(drifted.length
      ? `calibration snapshot (${REFRESHED}) is stale for: ${drifted.join(', ')} — pnpm calibration:refresh when the baselines should follow`
      : `calibration snapshot (${REFRESHED}) matches the live kits`);
    const missing = drifted.filter(d => d.includes('('));
    expect(missing, 'run pnpm calibration:refresh').toEqual([]);
  });

  it('names exactly the kit that was edited', () => {
    // On a COPY of the live kits: a test must never edit src.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.cpSync(LIVE, dir, { recursive: true });
    // Whatever has drifted already (a kit being polished) stays reported; the
    // edit adds exactly its own kit.
    const before = calibrationDrift(dir);
    expect(before).toEqual(calibrationDrift());
    // A kit whose file is named by its id, and that has not drifted already.
    const edited = ['gel', 'metge', 'runes', 'berserk', 'volcanic', 'nigromant', 'earthbender'].find(k => !before.includes(k));
    let after = before;
    if (edited) {
      const file = path.join(dir, `${edited}.ts`);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/speed: (-?\d+)/, (_, n) => `speed: ${Number(n) + 1}`));
      after = calibrationDrift(dir);
      expect(after.filter(d => !before.includes(d))).toEqual([edited]);
    }
    fs.writeFileSync(path.join(dir, 'new-kit.ts'), '');
    expect(calibrationDrift(dir).filter(d => !after.includes(d))).toEqual(['new-kit (not in the snapshot)']);
  });

  it('pin() is the id the calibration uses', () => {
    expect(FANTASY.calibration.referenceKits[0]).toBe(pin('enginyer-explosius'));
  });
});
