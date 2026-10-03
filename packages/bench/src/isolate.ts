/**
 * RUN A MEASUREMENT IN ITS OWN PROCESS, and await its result.
 *
 * Measurements here are synchronous and a real one runs for minutes. Inside a
 * vitest worker that fails a run the test cannot see: the worker's RPC channel
 * to the reporter times out after sixty seconds of a blocked event loop
 * (hard-coded in the RPC layer, not configurable) and vitest reports
 * `Timeout calling "onTaskUpdate"` even when every assertion passed. It was the
 * red in every full slow run.
 *
 * So a long measurement runs in a child, and the caller only waits. The child
 * imports a module, calls one of its exports with JSON arguments, and hands the
 * JSON result back. Nothing about the measurement changes — only whose event
 * loop it blocks. `.ts` modules work too: the child runs under tsx, so a test
 * can isolate a helper that lives beside it.
 *
 * The called function must install whatever set it measures (`useSet`): a child
 * starts with nothing installed, which bench will say loudly rather than guess.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The BUILT child, wherever this module is imported from (`src/` in tests). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'isolate-child.js');

export function isolated<T>(module: string, fn: string, args: unknown[] = []): Promise<T> {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bench-isolated-')), 'result.json');
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--import', 'tsx', CHILD, JSON.stringify({ module, fn, args, out })],
      { env: process.env, maxBuffer: 64 << 20, timeout: 14_400_000 },
      (err, _stdout, stderr) => {
        try {
          if (err) throw new Error(`isolated ${fn} failed:\n${String(stderr).trim().split('\n').slice(-8).join('\n') || err.message}`);
          resolve(JSON.parse(fs.readFileSync(out, 'utf8')) as T);
        } catch (e) {
          reject(e);
        } finally {
          fs.rmSync(path.dirname(out), { recursive: true, force: true });
        }
      });
  });
}
