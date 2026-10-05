/**
 * TAKE A NEW CALIBRATION SNAPSHOT — the one deliberate way to move the ruler.
 *
 * The calibration (reference party, stand-ins, company rows) is built from
 * PINNED copies of the player kits in `src/bench/calibration-kits/`, so editing
 * a live kit re-measures only that kit and every baseline stays cached. This
 * script re-copies the live kits over the pinned ones. Run it when you WANT the
 * baselines to follow the game — after a polishing pass — and expect the next
 * measurement to recalibrate from scratch.
 *
 * Each copy is renamed at the SOURCE: every string literal naming the kit's
 * skill id, one of its card ids or one of its own effect types gets `@cal`
 * appended, so a pinned kit can sit at the same table as its live self without
 * sharing a lookup, a handler or a card statistic. Source, not runtime, because
 * handlers look ids up by literal (`EXPLOSIVE_SKILL_ID`); a runtime rename would
 * miss those and quietly field a different kit. Anything the rename cannot reach
 * (an id built by a shared factory's default) is caught when the snapshot is
 * imported (`src/bench/pinned.ts`), not here.
 *
 * Run: pnpm calibration:refresh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIN_HEADER, pinSource, type PinnableSkill } from '../src/bench/pin-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = path.join(ROOT, 'src/players/skills');
const PINNED = path.join(ROOT, 'src/bench/calibration-kits');

async function main(): Promise<void> {
  fs.rmSync(PINNED, { recursive: true, force: true });
  fs.mkdirSync(PINNED, { recursive: true });
  const names: [exportName: string, file: string, id: string][] = [];
  for (const file of fs.readdirSync(LIVE).filter(f => f.endsWith('.ts')).sort()) {
    const mod = await import(path.join(LIVE, file)) as Record<string, unknown>;
    const found = Object.entries(mod).filter(([, v]) =>
      typeof v === 'object' && v !== null && Array.isArray((v as PinnableSkill).actions) && typeof (v as PinnableSkill).id === 'string');
    if (found.length !== 1) throw new Error(`${file}: expected exactly one exported SkillDefinition, found ${found.length}`);
    const [name, skill] = found[0] as [string, PinnableSkill];
    fs.writeFileSync(path.join(PINNED, file), pinSource(fs.readFileSync(path.join(LIVE, file), 'utf8'), skill));
    names.push([name, file, skill.id]);
  }
  fs.writeFileSync(path.join(PINNED, 'index.ts'), PIN_HEADER
    + names.map(([n, f]) => `import { ${n} } from './${f.replace(/\.ts$/, '.js')}';`).join('\n') + '\n'
    + `import type { SkillDefinition } from '../../players/types.js';\n\n`
    + `/** When the snapshot was taken. */\n`
    + `export const REFRESHED = '${new Date().toISOString().slice(0, 10)}';\n\n`
    + `export const PINNED_SKILLS: SkillDefinition[] = [${names.map(([n]) => n).join(', ')}];\n\n`
    + `/** Live skill id → the file both copies live in, for the drift check. */\n`
    + `export const PINNED_FILES: Record<string, string> = {\n`
    + names.map(([, f, id]) => `  '${id}': '${f}',`).join('\n') + '\n};\n');
  console.log(`calibration snapshot refreshed: ${names.length} kits → ${path.relative(process.cwd(), PINNED)}`);
  console.log('The next measurement recalibrates every baseline from scratch.');
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
