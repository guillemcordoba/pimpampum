/**
 * The simplify night run refuses any change that moves the behaviour
 * fingerprint. If the fingerprint itself stopped being deterministic (an
 * unseeded random draw, a clock, a worker race), every night would be refused
 * for no reason — so a small batch must give the same hash twice.
 */
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX = path.join(PKG, 'node_modules', '.bin', 'tsx');

describe('the behaviour fingerprint', () => {
  it('gives the same hash twice', async () => {
    const { stdout } = await promisify(execFile)(TSX, [path.join(PKG, 'src', 'fingerprint.ts'), '--fights', '6', '--twice'], { cwd: PKG });
    expect(stdout).toMatch(/^fingerprint [0-9a-f]{12} /m);
  }, 60_000);
});
