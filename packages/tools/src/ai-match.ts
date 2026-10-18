/**
 * AI MATCH — is the AI in the working tree stronger than the one at a commit?
 * The test that accepts or rejects an AI change (`@pimpampum/ai/audit`
 * `match.ts`): the two play duplicate pairs on imaginary real-size fights,
 * played to the end, and a sequential test stops the match once one of
 * better / worse / equal is clear.
 *
 * The baseline AI is the `packages/ai` source at `--baseline <ref>`, extracted
 * into a cache and run on TODAY'S engine. The match refuses unless the
 * engine at that commit is byte-identical to the working tree's: a different
 * engine would be scored as a different AI.
 *
 * Positions are dealt and balanced once (toward an even fight, the candidate
 * playing itself) and kept in `--deck`, so the next match only plays.
 *
 * Run:  pnpm --filter @pimpampum/tools exec tsx src/ai-match.ts --baseline HEAD --lanes 4 --hours 3
 *       --delta 0.02   the edge (mean pair result) the test resolves
 *       --pairs 16     duplicate pairs per position
 *       --candidate <ref>  instead of the working tree's (built) AI
 *
 * Every lane is a child process at nice 19, and yields while the user is
 * active (bench `lanesNow`).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { balance, generatePosition, playPair, sprt, type Position } from '@pimpampum/ai/audit';
import type { Policy } from '@pimpampum/ai';
import { flag, games, lanesNow, SMOKE } from '@pimpampum/bench';

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), '../../..');
/** Memory, not CPU, is what ran out (2026-10-18: 26 lanes, OOM). */
const MAX_LANES = 16;

interface Row { seed: number; shape?: string; pairs?: number[]; error?: string }

const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** The AI source at `ref`, runnable on this tree's engine; returns its directory. */
function extractAi(ref: string, cache: string): string {
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  try { execFileSync('git', ['diff', '--quiet', sha, '--', 'packages/engine/src'], { cwd: ROOT }); } catch {
    throw new Error(`ai-match: the engine at ${ref} (${sha.slice(0, 8)}) differs from the working tree's; only AIs on the same engine can be compared`);
  }
  if (git('ls-files', '--others', '--exclude-standard', 'packages/engine/src')) {
    throw new Error('ai-match: the working tree has untracked engine files; the engines would differ');
  }
  const dir = path.join(cache, sha);
  if (!fs.existsSync(path.join(dir, 'packages/ai/src/index.ts'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('sh', ['-c', `git archive ${sha} packages/ai/src packages/ai/package.json | tar -x -C '${dir}'`], { cwd: ROOT });
    // The extracted AI must import THIS engine module (one random source).
    fs.mkdirSync(path.join(dir, 'node_modules/@pimpampum'), { recursive: true });
    fs.symlinkSync(path.join(ROOT, 'packages/engine'), path.join(dir, 'node_modules/@pimpampum/engine'));
  }
  return dir;
}

/** The built working-tree AI must be fresh: otherwise the match measures an older one. */
function checkBuilt(): void {
  const newest = (d: string): number => fs.readdirSync(d, { withFileTypes: true, recursive: true })
    .filter(f => f.isFile()).reduce((m, f) => Math.max(m, fs.statSync(path.join(f.parentPath, f.name)).mtimeMs), 0);
  for (const pkg of ['engine', 'ai']) {
    if (newest(path.join(ROOT, 'packages', pkg, 'src')) > newest(path.join(ROOT, 'packages', pkg, 'dist'))) {
      throw new Error(`ai-match: packages/${pkg} has source newer than its build; run pnpm build`);
    }
  }
}

async function loadPolicy(dir: string | undefined): Promise<() => Policy> {
  const mod = dir ? await import(pathToFileURL(path.join(dir, 'packages/ai/src/index.ts')).href) : await import('@pimpampum/ai');
  return () => mod.aiPolicy({ depth: 1 }) as Policy;
}

function deal(seed: number, deck: string): Position {
  const file = path.join(deck, `${seed}.json`);
  if (!SMOKE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as Position;
  const dealt = generatePosition(seed, { maxCards: 6, roundsLeft: 2 + (seed % 3), toTheEnd: true, multiShare: 0.8 });
  const pos = balance(dealt, SMOKE ? 2 : 24, SMOKE ? 1 : 8, seed);
  if (!SMOKE) { fs.mkdirSync(deck, { recursive: true }); fs.writeFileSync(file, JSON.stringify(pos)); }
  return pos;
}

function readRows(runDir: string): Row[] {
  return fs.readdirSync(runDir).filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(runDir, f), 'utf8').split('\n').filter(Boolean).flatMap(l => {
      try { return [JSON.parse(l) as Row]; } catch { return []; }
    }));
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

if (process.argv.includes('--worker')) {
  const lane = Number(flag('--worker'));
  const n = Number(flag('--n'));
  const base = Number(flag('--seed') ?? 1);
  const runDir = flag('--run-dir')!;
  const deck = flag('--deck')!;
  const pairs = Number(flag('--pairs'));
  const deadline = Number(flag('--deadline') ?? Infinity);
  const candidate = await loadPolicy(flag('--candidate-dir'));
  const baseline = await loadPolicy(flag('--baseline-dir'));
  const out = path.join(runDir, `lane-${lane}.jsonl`);
  const claims = path.join(runDir, 'claims');
  fs.mkdirSync(claims, { recursive: true });
  for (let i = 0; i < n; i++) {
    while (lane >= lanesNow() && !SMOKE) await new Promise(r => setTimeout(r, 30_000));
    if (Date.now() > deadline || fs.existsSync(path.join(runDir, 'STOP'))) break;
    try { fs.closeSync(fs.openSync(path.join(claims, String(i)), 'wx')); } catch { continue; }
    const seed = base + i;
    let row: Row;
    try {
      const pos = deal(seed, deck);
      row = { seed, shape: pos.tags.shape, pairs: Array.from({ length: pairs }, (_, k) => playPair(pos, candidate, baseline, seed * 1_000 + k)) };
    } catch (err) { row = { seed, error: String((err as Error).stack ?? err).slice(0, 2000) }; }
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  }
  process.exit(0);
}

const N = games(2000);
const LANES = Math.min(MAX_LANES, Math.max(1, Number(flag('--lanes') ?? (SMOKE ? 2 : 4))));
const PAIRS = SMOKE ? 1 : Number(flag('--pairs') ?? 16);
const DELTA = Number(flag('--delta') ?? 0.02);
const BASE = Number(flag('--seed') ?? 1);
const OUT = flag('--out') ?? '/tmp/ai-match';
const DECK = flag('--deck') ?? path.join(OUT, 'deck');
const HOURS = Number(flag('--hours') ?? 0);
const cache = path.join(OUT, 'ai-at');

// In a smoke run with no baseline named, the AI meets itself: the machinery
// still executes end to end, and the result must be exactly even.
const baselineRef = flag('--baseline') ?? (SMOKE ? undefined : 'HEAD');
const baselineDir = baselineRef ? extractAi(baselineRef, cache) : undefined;
const candidateRef = flag('--candidate');
const candidateDir = candidateRef ? extractAi(candidateRef, cache) : undefined;
if (!candidateDir) checkBuilt();

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = path.join(OUT, `run-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });
const who = `${candidateRef ?? 'working tree'} vs ${baselineRef ?? 'itself'}`;
console.log(`AI match: ${who}; up to ${N} positions × ${PAIRS} pairs, δ ${DELTA}, ${LANES} lanes at nice 19 → ${runDir}`);

const t0 = performance.now();
const children: ChildProcess[] = [];
const done = Promise.all(Array.from({ length: LANES }, (_, lane) => new Promise<void>(resolve => {
  const args = ['-n', '19', process.execPath, '--import', 'tsx', HERE,
    '--worker', String(lane), '--n', String(N), '--seed', String(BASE), '--run-dir', runDir,
    '--deck', DECK, '--pairs', String(PAIRS),
    ...(baselineDir ? ['--baseline-dir', baselineDir] : []),
    ...(candidateDir ? ['--candidate-dir', candidateDir] : []),
    ...(HOURS ? ['--deadline', String(Date.now() + HOURS * 3_600_000)] : [])];
  const child = spawn('nice', args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  children.push(child);
  child.on('exit', code => { if (code !== 0 && code !== null) console.error(`lane ${lane} exited ${code}`); resolve(); });
})));

let decided = false;
const poll = setInterval(() => {
  const s = state(readRows(runDir));
  if (s.verdict !== 'undecided' && !decided) {
    decided = true;
    fs.writeFileSync(path.join(runDir, 'STOP'), s.verdict);
    for (const c of children) c.kill();
  }
}, SMOKE ? 500 : 20_000);
const partial = setInterval(() => report(readRows(runDir), false), 10 * 60_000);
await done;
clearInterval(poll);
clearInterval(partial);
report(readRows(runDir), true);

function state(rows: Row[]): ReturnType<typeof sprt> {
  return sprt(rows.filter(r => r.pairs).map(r => mean(r.pairs!)), DELTA);
}

function report(rows: Row[], final: boolean): void {
  const played = rows.filter(r => r.pairs);
  const s = state(rows);
  const md: string[] = [];
  const say = (x = ''): void => { md.push(x); };
  say(`# AI match — ${who}${final ? '' : ' (PARTIAL)'}`);
  say();
  say(`${played.length} positions × ${PAIRS} duplicate pairs, ${LANES} lanes, ${((performance.now() - t0) / 1000).toFixed(0)} s wall; imaginary real-size fights, real dice, played to the end.`);
  say();
  say(`- **verdict: ${s.verdict}** (δ ${DELTA}: LLR better ${s.llrBetter.toFixed(2)}, worse ${s.llrWorse.toFixed(2)}, bounds ±${Math.log(19).toFixed(2)})`);
  say(`- candidate's mean pair result: **${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(4)} ± ${s.se.toFixed(4)}** (+1 = wins both seats every time)`);
  say(`- positions where no pair differed at all: ${played.filter(r => r.pairs!.every(x => x === 0)).length}`);
  say(`- threw: ${rows.length - played.length}`);
  say();
  const byShape = new Map<string, number[]>();
  for (const r of played) byShape.set(r.shape!, [...(byShape.get(r.shape!) ?? []), mean(r.pairs!)]);
  say('| shape | positions | mean pair result |');
  say('|---|---|---|');
  for (const [k, v] of [...byShape].sort((a, b) => a[0].localeCompare(b[0]))) say(`| ${k} | ${v.length} | ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(3)} |`);
  for (const r of rows.filter(x => x.error).slice(0, 5)) say(`\n- threw, seed ${r.seed}: ${r.error!.split('\n')[0]}`);
  fs.writeFileSync(path.join(runDir, `report${final ? '' : '-partial'}.md`), md.join('\n') + '\n');
  if (final) console.log(md.slice(0, 8).join('\n'));
}
