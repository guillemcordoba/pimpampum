import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ActionType } from '@pimpampum/engine';
import { ACROBACIA, ARTIFEX, COMMON_EFFECTS, COMMON_SKILLS, MESTRE_ARMES, MESTRE_DEL_XI } from '../src/index.js';
import { COMMON_SKILL_FILES, COMMON_SKILLS_DIR } from '../src/bench/index.js';

describe('Esgrima', () => {
  it('keeps the weapon master id, and its ten cards in order', () => {
    expect(MESTRE_ARMES.id).toBe('mestre-armes');
    expect(MESTRE_ARMES.displayName).toBe('Esgrima');
    expect(MESTRE_ARMES.classCss).toBe('mestre-armes');
    expect(MESTRE_ARMES.actions.map(a => [a.id, a.unlockLevel, a.actionType])).toEqual([
      ['finta-traidora', 1, ActionType.Atac],
      ['retruc-d-acer', 2, ActionType.Defensa],
      ['guardia-camaleo', 3, ActionType.Focus],
      ['bufetada-insolent', 4, ActionType.Atac],
      ['bloqueig-d-escorpi', 5, ActionType.Defensa],
      ['brac-mort', 6, ActionType.Defensa],
      ['bardissa-d-acer', 7, ActionType.Atac],
      ['punt-feble', 8, ActionType.Focus],
      ['estocada-fantasma', 9, ActionType.Atac],
      ['tall-rere-tall', 10, ActionType.Atac],
    ]);
    expect(MESTRE_ARMES.actions.every(a => a.skillId === 'mestre-armes')).toBe(true);
  });
});

describe('Acrobàcia', () => {
  it('has its id, and its ten cards in order — none of them needs a weapon', () => {
    expect(ACROBACIA.id).toBe('acrobacia');
    expect(ACROBACIA.displayName).toBe('Acrobàcia');
    expect(ACROBACIA.actions.map(a => [a.id, a.unlockLevel, a.actionType])).toEqual([
      ['escombrada', 1, ActionType.Atac],
      ['esquiva-i-traveta', 2, ActionType.Defensa],
      ['trampoli-de-mans', 3, ActionType.Focus],
      ['puntada-d-espagat', 4, ActionType.Atac],
      ['tombarella-de-rescat', 5, ActionType.Defensa],
      ['cavalcar-l-enemic', 6, ActionType.Atac],
      ['trepitjar-caps', 7, ActionType.Atac],
      ['salt-mortal', 8, ActionType.Atac],
      ['malabars-a-puntades', 9, ActionType.Atac],
      ['capbusso-suicida', 10, ActionType.Atac],
    ]);
    expect(ACROBACIA.actions.every(a => a.skillId === 'acrobacia')).toBe(true);
    expect(ACROBACIA.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))).toBe(false);
  });
});

describe('Artífex', () => {
  it('has its id, and its ten cards in order — none of them needs a weapon', () => {
    expect(ARTIFEX.id).toBe('artifex');
    expect(ARTIFEX.displayName).toBe('Artífex');
    expect(ARTIFEX.actions.map(a => [a.id, a.unlockLevel, a.actionType])).toEqual([
      ['bumerang', 1, ActionType.Atac],
      ['parany-de-molla', 2, ActionType.Defensa],
      ['automat-de-corda', 3, ActionType.Focus],
      ['paraigua-blindat', 4, ActionType.Defensa],
      ['ganxo-salvavides', 5, ActionType.Defensa],
      ['ballesta-sentinella', 6, ActionType.Focus],
      ['trepant-incansable', 7, ActionType.Atac],
      ['baldufa-de-ganivets', 8, ActionType.Atac],
      ['colos-de-butxaca', 9, ActionType.Defensa],
      ['boa-mecanica', 10, ActionType.Atac],
    ]);
    expect(ARTIFEX.actions.every(a => a.skillId === 'artifex')).toBe(true);
    expect(ARTIFEX.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))).toBe(false);
  });
});

describe('Mestre del xi', () => {
  it('has its id, and its ten cards in order — none of them needs a weapon', () => {
    expect(MESTRE_DEL_XI.id).toBe('mestre-del-xi');
    expect(MESTRE_DEL_XI.displayName).toBe('Mestre del xi');
    expect(MESTRE_DEL_XI.actions.map(a => [a.id, a.unlockLevel, a.actionType])).toEqual([
      ['cop-al-nervi', 1, ActionType.Atac],
      ['pinca-entumidora', 2, ActionType.Defensa],
      ['desbloquejar-el-cos', 3, ActionType.Focus],
      ['poder-apagat', 4, ActionType.Atac],
      ['bloqueig-mutu', 5, ActionType.Defensa],
      ['rafega-de-dits', 6, ActionType.Atac],
      ['tocs-en-cadena', 7, ActionType.Atac],
      ['cop-de-vida', 8, ActionType.Focus],
      ['toc-de-la-mort', 9, ActionType.Atac],
      ['tempesta-de-son', 10, ActionType.Atac],
    ]);
    expect(MESTRE_DEL_XI.actions.every(a => a.skillId === 'mestre-del-xi')).toBe(true);
    expect(MESTRE_DEL_XI.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))).toBe(false);
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
