/** The child half of `isolated`: import, call, write the JSON result, exit. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const { module, fn, args, out } = JSON.parse(process.argv.at(-1)!) as {
  module: string; fn: string; args: unknown[]; out: string;
};
const url = module.startsWith('file:') ? module : pathToFileURL(module).href;
const mod = await import(url) as Record<string, unknown>;
const f = mod[fn];
if (typeof f !== 'function') throw new Error(`${module} exports no function '${fn}'`);
const result = await (f as (...a: unknown[]) => unknown)(...args);
fs.writeFileSync(out, JSON.stringify(result ?? null));
