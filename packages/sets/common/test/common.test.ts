import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ActionType } from '@pimpampum/engine';
import { COMMON_EFFECTS, COMMON_SKILLS, MESTRE_ARMES } from '../src/index.js';
import { COMMON_SKILL_FILES, COMMON_SKILLS_DIR } from '../src/bench/index.js';

describe('Esgrima', () => {
  it('keeps the weapon master id and its five cards, in order', () => {
    expect(MESTRE_ARMES.id).toBe('mestre-armes');
    expect(MESTRE_ARMES.displayName).toBe('Esgrima');
    expect(MESTRE_ARMES.classCss).toBe('mestre-armes');
    expect(MESTRE_ARMES.actions.map(a => [a.id, a.unlockLevel, a.actionType])).toEqual([
      ['atac-llampec', 1, ActionType.Atac],
      ['contraatac', 2, ActionType.Defensa],
      ['tall-precis', 3, ActionType.Atac],
      ['estat-de-flux', 4, ActionType.Focus],
      ['atac-encadenat', 5, ActionType.Atac],
    ]);
    expect(MESTRE_ARMES.actions.every(a => a.skillId === 'mestre-armes')).toBe(true);
  });
});

describe('the shared skills', () => {
  it('call only handlers they carry or COMMON_EFFECTS provides', () => {
    for (const s of COMMON_SKILLS) {
      for (const a of s.actions) {
        for (const e of a.effects) {
          expect(e.type in COMMON_EFFECTS || e.type in (s.effects ?? {}), `${a.id}: ${e.type}`).toBe(true);
        }
      }
    }
  });

  it('each has its file written down, and every file is one of them', () => {
    expect(Object.keys(COMMON_SKILL_FILES).sort()).toEqual(COMMON_SKILLS.map(s => s.id).sort());
    for (const [id, file] of Object.entries(COMMON_SKILL_FILES)) {
      expect(fs.readFileSync(path.join(COMMON_SKILLS_DIR, file), 'utf8')).toContain(`id: '${id}'`);
    }
    expect(fs.readdirSync(COMMON_SKILLS_DIR).filter(f => f.endsWith('.ts')).sort())
      .toEqual(Object.values(COMMON_SKILL_FILES).sort());
  });
});
