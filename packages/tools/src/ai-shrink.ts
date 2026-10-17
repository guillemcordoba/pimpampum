/**
 * DISCOVERIES → TESTS. Each position `ai-discover.ts` found (another card wins
 * clearly more often than the AI's, played to the end) is shrunk
 * (`@pimpampum/ai/audit` `shrink`) to the smallest position on which the
 * playout judge still says so, re-confirmed on a fresh batch four times the
 * size, and written to `packages/ai/test/discovered.json` — marked `todo`, so
 * the fast tier lists it until the AI is fixed; flip it and it guards.
 *
 * Run:  pnpm --filter @pimpampum/tools exec tsx src/ai-shrink.ts <discoveries.json> --lanes 4
 *       --playouts 100   games per candidate per batch while shrinking
 *
 * Every lane is a child process at nice 19.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROLS, playoutCheck, shrink, type PlayoutResult, type Position } from '@pimpampum/ai/audit';
import os from 'node:os';
import { flag, SMOKE } from '@pimpampum/bench';

const HERE = fileURLToPath(import.meta.url);
const TESTS = path.resolve(path.dirname(HERE), '../../ai/test/discovered.json');

export interface Discovered {
  id: string;
  found: string;
  /** The discovery it was shrunk from, and what was removed on the way. */
  from: string;
  steps: string[];
  position: Position;
  /** What the AI played, and the card change that beat it. */
  ai: { actions: number[]; cards: string[] };
  better: { actions: number[]; cards: string[]; lead: number; se: number };
  games: number;
  todo: boolean;
}

/** The smoke run (no file given) feeds itself one tiny discovery: it checks
 *  that this still EXECUTES, nothing more. */
function smokeInput(): string {
  const file = path.join(os.tmpdir(), 'ai-shrink-smoke.json');
  const pos = { ...CONTROLS.find(c => c.position.id === 'interrupt-delayed')!.position, roundsLeft: 50 };
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([playoutCheck(pos, { games: 4, settled: 1.1 })]));
  return file;
}
const input = process.argv.slice(2).find(a => a.endsWith('.json')) ?? (SMOKE ? smokeInput() : undefined);
const playouts = SMOKE ? 4 : Number(flag('--playouts') ?? 100);

function shrinkOne(d: PlayoutResult, k: number): Discovered | null {
  const seed = 31 * (k + 1);
  const fails = (p: Position): boolean => !!playoutCheck(p, { games: playouts, seed }).best;
  const r = shrink(d.position, fails, SMOKE ? 3 : 300);
  const confirm = playoutCheck(r.position, { games: 4 * playouts, seed: seed + 7 });
  if (!confirm.best) return null;
  return {
    id: `${d.position.id}~${r.steps.length}`, found: new Date().toISOString().slice(0, 10),
    from: `${d.position.id} (${d.position.tags.shape})`, steps: r.steps, position: r.position,
    ai: { actions: confirm.ai.actions, cards: confirm.ai.cards },
    better: { actions: confirm.best.actions, cards: confirm.best.cards, lead: confirm.best.lead, se: confirm.best.se },
    games: 4 * playouts, todo: true,
  };
}

if (process.argv.includes('--worker')) {
  const lane = Number(flag('--worker'));
  const runDir = flag('--run-dir')!;
  const all = JSON.parse(fs.readFileSync(input!, 'utf8')) as PlayoutResult[];
  fs.mkdirSync(path.join(runDir, 'claims'), { recursive: true });
  for (let k = 0; k < all.length; k++) {
    try { fs.closeSync(fs.openSync(path.join(runDir, 'claims', String(k)), 'wx')); } catch { continue; }
    let line: unknown;
    try { line = { k, test: shrinkOne(all[k], k) }; } catch (err) { line = { k, error: String((err as Error).stack ?? err).slice(0, 2000) }; }
    fs.appendFileSync(path.join(runDir, `lane-${lane}.jsonl`), JSON.stringify(line) + '\n');
  }
  process.exit(0);
}

if (!input) throw new Error('ai-shrink: give the discoveries JSON (ai-discover.ts output)');
const LANES = Math.max(1, Number(flag('--lanes') ?? (SMOKE ? 1 : 4)));
const runDir = path.join(path.dirname(input), `shrink-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
fs.mkdirSync(runDir, { recursive: true });
console.log(`AI shrink: ${input}, ${LANES} lanes at nice 19 → ${runDir}`);
const passthrough = process.argv.slice(2).filter((a, i, arr) => a !== '--lanes' && arr[i - 1] !== '--lanes');
await Promise.all(Array.from({ length: LANES }, (_, lane) => new Promise<void>(resolve => {
  const child = spawn('nice', ['-n', '19', process.execPath, '--import', 'tsx', HERE, ...passthrough, '--worker', String(lane), '--run-dir', runDir],
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  child.on('exit', code => { if (code !== 0) console.error(`lane ${lane} exited ${code}`); resolve(); });
})));

const lines = fs.readdirSync(runDir).filter(f => f.endsWith('.jsonl'))
  .flatMap(f => fs.readFileSync(path.join(runDir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { k: number; test?: Discovered | null; error?: string }));
const made = lines.flatMap(l => (l.test ? [l.test] : []));
const md: string[] = [`# Discoveries shrunk — ${new Date().toISOString().slice(0, 10)}`, '',
  `${lines.length} discoveries: ${made.length} became tests, ${lines.filter(l => l.test === null).length} no longer held once re-confirmed, ${lines.filter(l => l.error).length} threw.`, ''];
for (const t of made) {
  md.push(`## ${t.id} (from ${t.from})`, '');
  md.push(`AI plays **${t.ai.cards.join(', ')}**; **${t.better.cards.join(', ')}** wins more, lead ${t.better.lead.toFixed(2)}±${t.better.se.toFixed(2)} over ${t.games} games.`, '');
  for (const [ti, team] of t.position.teams.entries()) {
    for (const f of team) md.push(`- side ${ti ? 'B' : 'A'} ${f.name}: PV ${f.pv}/${f.maxPv}, armour ${f.armour}, level ${f.level}, fatigue ${f.fatigue} — ${f.cards.map(c => `${c.arch}(${Object.entries(c.p).map(([k, v]) => `${k} ${v}`).join(', ')})`).join('; ')}`);
  }
  md.push('', `Removed: ${t.steps.join('; ') || 'nothing'}.`, '');
}
for (const l of lines.filter(x => x.error).slice(0, 10)) md.push(`- threw on discovery ${l.k}: ${l.error!.split('\n')[0]}`);
fs.writeFileSync(path.join(runDir, 'report.md'), md.join('\n') + '\n');
if (!SMOKE) {
  const existing: Discovered[] = fs.existsSync(TESTS) ? JSON.parse(fs.readFileSync(TESTS, 'utf8')) : [];
  const known = new Set(existing.map(t => t.id));
  const added = made.filter(t => !known.has(t.id));
  fs.writeFileSync(TESTS, JSON.stringify([...existing, ...added], null, 1) + '\n');
  console.log(`tests: +${added.length} → ${TESTS}`);
}
console.log(md.slice(0, 3).join('\n'));
console.log(`report: ${path.join(runDir, 'report.md')}`);
