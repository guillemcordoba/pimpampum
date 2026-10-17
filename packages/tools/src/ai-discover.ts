/**
 * AI DISCOVERY — where does the AI's choice lose games? At REAL size: the
 * measured shapes (4 heroes against 1-5) and hand sizes, real dice, every
 * fight played to its real end. Each position goes to the playout judge
 * (`@pimpampum/ai/audit` `playoutCheck`): with the AI playing both sides from
 * the next round on, does another card this round win clearly more often than
 * the AI's? Each position's side-B PV is first scaled toward an even fight
 * (`balance`), since in a settled one no card matters. A position where one does is a DISCOVERY, written for the shrinker
 * to cut down to a test.
 *
 * Output, in `--out` (default /tmp/ai-discover):
 *   report-<date>.md       rates by shape and archetype; every discovery
 *   discoveries-<date>.json the positions, for `ai-shrink.ts`
 *
 * Run:  pnpm --filter @pimpampum/tools exec tsx src/ai-discover.ts --games 400 --lanes 4 --hours 4
 *       --playouts 200   games per candidate per batch
 *
 * Every lane is a child process at nice 19.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balance, generatePosition, playoutCheck, type PlayoutResult } from '@pimpampum/ai/audit';
import { flag, games, share, SMOKE } from '@pimpampum/bench';

const HERE = fileURLToPath(import.meta.url);

interface Row { seed: number; result?: PlayoutResult; error?: string }

function runOne(seed: number): Row {
  // The real mix: shape and hands from the measured profile (hands capped at
  // 6), the fight paced to last 2-4 rounds, then played to its end.
  const pace = 2 + (seed % 3);
  const dealt = generatePosition(seed, { maxCards: 6, roundsLeft: pace, toTheEnd: true, multiShare: 0.8 });
  const playouts = SMOKE ? 4 : Number(flag('--playouts') ?? 200);
  // Side B's PV scaled toward an even fight between the AI and itself: a
  // settled result has no card that matters.
  const pos = balance(dealt, SMOKE ? 2 : 24, SMOKE ? 1 : 6, seed);
  return { seed, result: playoutCheck(pos, { games: playouts, seed }) };
}

function readRows(runDir: string): Row[] {
  return fs.readdirSync(runDir).filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(runDir, f), 'utf8').split('\n').filter(Boolean).flatMap(l => {
      try { return [JSON.parse(l) as Row]; } catch { return []; }
    }));
}

if (process.argv.includes('--worker')) {
  const lane = Number(flag('--worker'));
  const n = Number(flag('--n'));
  const base = Number(flag('--seed') ?? 1);
  const runDir = flag('--run-dir')!;
  const out = path.join(runDir, `lane-${lane}.jsonl`);
  const claims = path.join(runDir, 'claims');
  fs.mkdirSync(claims, { recursive: true });
  const deadline = Number(flag('--deadline') ?? Infinity);
  for (let i = 0; i < n; i++) {
    if (Date.now() > deadline) break;
    try { fs.closeSync(fs.openSync(path.join(claims, String(i)), 'wx')); } catch { continue; }
    let row: Row;
    try { row = runOne(base + i); } catch (err) { row = { seed: base + i, error: String((err as Error).stack ?? err).slice(0, 2000) }; }
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  }
  process.exit(0);
}

const N = games(400);
const LANES = Math.max(1, Number(flag('--lanes') ?? (SMOKE ? 2 : 4)));
const BASE = Number(flag('--seed') ?? 1);
const OUT = flag('--out') ?? '/tmp/ai-discover';
const HOURS = Number(flag('--hours') ?? 0);
const date = new Date().toISOString().slice(0, 10);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = path.join(OUT, `run-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });

const OWN = ['--lanes', '--games', '--out', '--hours'];
const passthrough = process.argv.slice(2).filter((a, i, arr) => !OWN.includes(a) && !OWN.includes(arr[i - 1]));
const t0 = performance.now();
console.log(`AI discovery: ${N} positions, ${LANES} lanes at nice 19 → ${runDir}`);
const partial = setInterval(() => { try { report(readRows(runDir), false); } catch (err) { console.error(err); } }, 10 * 60_000);
await Promise.all(Array.from({ length: LANES }, (_, lane) => new Promise<void>(resolve => {
  const args = ['-n', '19', process.execPath, '--import', 'tsx', HERE, ...passthrough,
    '--worker', String(lane), '--n', String(N), '--seed', String(BASE), '--run-dir', runDir,
    ...(HOURS ? ['--deadline', String(Date.now() + HOURS * 3_600_000)] : [])];
  const child = spawn('nice', args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  child.on('exit', code => { if (code !== 0) console.error(`lane ${lane} exited ${code}`); resolve(); });
})));
clearInterval(partial);
report(readRows(runDir), true);

function report(rows: Row[], final: boolean): void {
  const done = rows.filter(r => r.result);
  const judged = done.filter(r => !r.result!.settledOut);
  const found = judged.filter(r => r.result!.best);
  const md: string[] = [];
  const say = (s = ''): void => { md.push(s); };
  say(`# AI discovery — ${date}${final ? '' : ' (PARTIAL)'}`);
  say();
  say(`${rows.length} positions, ${LANES} lanes, ${((performance.now() - t0) / 1000).toFixed(0)} s wall; real shapes and hands (≤ 6 cards), real dice, played to the end.`);
  say();
  say(`- all but settled (screened out): ${share(done.length - judged.length, done.length)}`);
  say(`- judged: ${judged.length}; a single-seat change beats the AI's pick: **${share(found.length, judged.length)}**`);
  say(`- threw: ${rows.length - done.length}`);
  say();
  const table = (title: string, keyOf: (r: Row) => string[]): void => {
    const g = new Map<string, Row[]>();
    for (const r of judged) for (const k of keyOf(r)) g.set(k, [...(g.get(k) ?? []), r]);
    say(`## By ${title}`);
    say();
    say(`| ${title} | judged | beaten |`);
    say('|---|---|---|');
    for (const [k, v] of [...g].sort((a, b) => a[0].localeCompare(b[0]))) say(`| ${k} | ${v.length} | ${share(v.filter(r => r.result!.best).length, v.length)} |`);
    say();
  };
  table('shape', r => [r.result!.position.tags.shape]);
  table('archetype the AI played', r => [...new Set(r.result!.ai.cards)]);
  table('archetype that beat it', r => (r.result!.best ? [...new Set(r.result!.best.cards.filter((c, k) => c !== r.result!.ai.cards[k]))] : []));
  say('## Discoveries');
  say();
  for (const r of found) {
    const res = r.result!;
    say(`- **${res.position.id}** (${res.position.tags.shape}): AI ${res.ai.cards.join(',')} (${res.ai.count}/4, mean ${res.ai.mean.toFixed(2)}) → ${res.best!.cards.join(',')} lead ${res.best!.lead.toFixed(2)}±${res.best!.se.toFixed(2)}`);
  }
  for (const r of rows.filter(x => x.error).slice(0, 10)) say(`- threw, seed ${r.seed}: ${r.error!.split('\n')[0]}`);
  const suffix = final ? '' : '-partial';
  fs.writeFileSync(path.join(OUT, `report-${date}${suffix}.md`), md.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, `discoveries-${date}${suffix}.json`), JSON.stringify(found.map(r => r.result), null, 1));
  if (final) console.log(md.slice(0, 9).join('\n'));
}
