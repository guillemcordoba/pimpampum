import { describe, it, expect } from 'vitest';
import { pinSource } from '../src/bench/index.js';

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
