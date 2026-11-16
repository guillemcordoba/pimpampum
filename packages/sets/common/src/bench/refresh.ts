/**
 * TAKE A NEW CALIBRATION SNAPSHOT — the one deliberate way to move the ruler.
 *
 * The calibration (reference party, stand-ins, company rows) is built from
 * PINNED copies of the player kits in `src/bench/calibration-kits/`, so editing
 * a live kit re-measures only that kit and every baseline stays cached. This
 * re-copies the live kits over the pinned ones. Run it when you WANT the
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
 * imported (a set's `src/bench/pinned.ts`), not here.
 *
 * Each set runs it from `scripts/refresh-calibration.ts`, under tsx: the live
 * kits are imported as source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { liveKitFiles, PIN_HEADER, pinSource, type PinnableSkill } from './pin-source.js';

/**
 * Rewrite `copies` from the kits in `live` — the set's own, plus the
 * set-common kits its catalogue fields; each copy is named after its live file.
 */
export async function refreshCalibration(live: string, copies: string, fielded: (id: string) => boolean): Promise<void> {
  fs.rmSync(copies, { recursive: true, force: true });
  fs.mkdirSync(copies, { recursive: true });
  const names: [exportName: string, file: string, id: string][] = [];
  for (const liveFile of liveKitFiles(live, fielded)) {
    const file = path.basename(liveFile);
    if (names.some(([, f]) => f === file)) throw new Error(`${file}: two live kits share a file name`);
    const mod = await import(liveFile) as Record<string, unknown>;
    const found = Object.entries(mod).filter(([, v]) =>
      typeof v === 'object' && v !== null && Array.isArray((v as PinnableSkill).actions) && typeof (v as PinnableSkill).id === 'string');
    if (found.length !== 1) throw new Error(`${file}: expected exactly one exported SkillDefinition, found ${found.length}`);
    const [name, skill] = found[0] as [string, PinnableSkill];
    fs.writeFileSync(path.join(copies, file), pinSource(fs.readFileSync(liveFile, 'utf8'), skill));
    names.push([name, file, skill.id]);
  }
  fs.writeFileSync(path.join(copies, 'index.ts'), PIN_HEADER
    + names.map(([n, f]) => `import { ${n} } from './${f.replace(/\.ts$/, '.js')}';`).join('\n') + '\n'
    + `import type { SkillDefinition } from '../../players/types.js';\n\n`
    + `/** When the snapshot was taken. */\n`
    + `export const REFRESHED = '${new Date().toISOString().slice(0, 10)}';\n\n`
    + `export const PINNED_SKILLS: SkillDefinition[] = [${names.map(([n]) => n).join(', ')}];\n\n`
    + `/** Live skill id → the file both copies live in, for the drift check. */\n`
    + `export const PINNED_FILES: Record<string, string> = {\n`
    + names.map(([, f, id]) => `  '${id}': '${f}',`).join('\n') + '\n};\n');
  console.log(`calibration snapshot refreshed: ${names.length} kits → ${path.relative(process.cwd(), copies)}`);
  console.log('The next measurement recalibrates every baseline from scratch.');
}
