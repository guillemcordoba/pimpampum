/**
 * THE CODE A KIT RUNS, fingerprinted — not just its card data.
 *
 * A card's data says which handler it calls and with what params; it cannot
 * say what the handler DOES. Editing a handler used to leave every cached
 * number standing, measured with the old code. So a kit's print includes the
 * source of its own file (where its handlers and status behaviours live, by the
 * co-location rule) and of everything shared (generic effects, equipment, the
 * builders) — editing one kit's file still invalidates only that kit's rows,
 * and editing shared code invalidates everyone's, which is correct.
 *
 * A missing tree prints as such rather than as nothing, so it can never
 * collide with a real print.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_SKILLS_DIR, COMMON_SRC } from './common-source.js';

/** Under a set's `src/`: the dirs whose files are each ONE kit's own. */
const KIT_DIRS = ['players/skills', 'enemies/creatures'];

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(full) : e.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * The print of one kit of the set whose `src/` this is: the kit's own file
 * (found by its id, in `dir`) plus the shared code. A live player kit may be
 * one set-common holds.
 */
export function sourcePrinter(src: string): (dir: string, id: string) => string {
  const memo = new Map<string, string>();

  function hashFiles(files: string[]): string {
    const h = crypto.createHash('sha1');
    // RELATIVE paths: an absolute one made the same content fingerprint
    // differently in every clone and worktree, so a cache could never be shared.
    for (const f of files.sort()) { h.update(path.relative(src, f)); h.update(fs.readFileSync(f, 'utf8')); }
    return h.digest('hex').slice(0, 12);
  }

  /** Every content file that is not one kit's own, and not calibration — the
   *  set's, and set-common's (the builders and generic handlers are there). */
  function sharedPrint(): string {
    let p = memo.get('shared');
    if (p === undefined) {
      const own = KIT_DIRS.map(d => path.join(src, d));
      const files = [
        ...tsFiles(src).filter(f => !f.startsWith(path.join(src, 'bench')) && !own.some(d => f.startsWith(d))),
        ...tsFiles(COMMON_SRC).filter(f => !f.startsWith(path.join(COMMON_SRC, 'bench')) && !f.startsWith(COMMON_SKILLS_DIR)),
      ];
      p = files.length ? hashFiles(files) : 'no-source';
      memo.set('shared', p);
    }
    return p;
  }

  return (dir, id) => {
    const k = `${dir}:${id}`;
    let p = memo.get(k);
    if (p === undefined) {
      const dirs = [path.join(src, dir), ...(dir === 'players/skills' ? [COMMON_SKILLS_DIR] : [])];
      const mine = dirs.flatMap(tsFiles)
        .filter(f => fs.readFileSync(f, 'utf8').includes(`'${id}'`));
      p = `${mine.length ? hashFiles(mine) : 'no-file'}+${sharedPrint()}`;
      memo.set(k, p);
    }
    return p;
  };
}
