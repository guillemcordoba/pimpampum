/**
 * THE AI AUDIT — the production AI against an objective referee, on fights
 * dealt from imaginary cards (`@pimpampum/ai/audit`). Imports no content set.
 *
 * Each position is solved by the referee (every round a zero-sum matrix game,
 * solved for its Nash equilibrium, recursively to the real end of the fight)
 * and the AI is asked the same position; a pick the equilibrium never plays,
 * and that loses more than ε and the referee's own noise against the
 * equilibrium opponent — confirmed by independent re-solves — is a MISMATCH.
 *
 * Positions come from a MIX of generator configs (shape, cards, rounds left),
 * chosen per position by its seed, so a run is reproducible position by
 * position: `--seed S` plus the index. The hand-made controls run every time.
 *
 * Output, in `--out` (default /tmp/ai-audit):
 *   report-<date>.md   rates by horizon, shape, archetype; every mismatch
 *   report-<date>.json every result
 * and every confirmed mismatch whose position solves in under a minute is
 * appended to `packages/ai/test/audit-fixtures.json`, marked `todo`, for the
 * fast tier to replay (`--no-fixtures` to skip).
 *
 * Run:  pnpm --filter @pimpampum/tools exec tsx src/ai-audit.ts --games 50 --lanes 4
 *       … --mix night (default), --mix small, or a single config:
 *       --shape 2x2 --cards 3 --rounds 3   (and --samples 8,2,1 --max-joint 16)
 *       --replicates 2   re-solve every position twice more (referee error)
 *
 * Every lane is a child process at nice 19.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTROLS, DEFAULT_REFEREE, checkPosition, generatePosition, type CheckResult, type GeneratorConfig,
  type Position, type RefereeOptions,
} from '@pimpampum/ai/audit';
import { DEFAULT_LOOKAHEAD, type LookaheadOptions } from '@pimpampum/ai';
import { flag, games, pct, share, SMOKE } from '@pimpampum/bench';

const HERE = fileURLToPath(import.meta.url);
const FIXTURES = path.resolve(path.dirname(HERE), '../../ai/test/audit-fixtures.json');

/** One slice of a mix: a generator config, its referee settings, its weight. */
interface Slice { label: string; weight: number; gen: GeneratorConfig; referee?: Partial<RefereeOptions> }

/**
 * THE MIXES. `night` is sized by the timing sweep in NEXT-STEPS §51: the
 * largest shapes and horizons that solve inside the per-position budget,
 * weighted toward multi-round payoffs (`multiShare`) and toward the real
 * shapes (4 heroes against 1-5 enemies) as far as the budget allows.
 */
const MIXES: Record<string, Slice[]> = {
  small: [
    { label: '1x1 c3 r3', weight: 1, gen: { shape: '1x1', cards: 3, roundsLeft: 3 } },
    { label: '2x1 c3 r3', weight: 1, gen: { shape: '2x1', cards: 3, roundsLeft: 3 } },
  ],
  // Weights are shares, by position count. Sized on 2026-10-14 (§51.4) for a
  // 7¼-hour night on 28 lanes with `--hours 7.25`: the deadline, not N,
  // ends it, and positions are dealt mixed so the shares hold wherever it
  // stops. A round cap of 2 leaves no room for a multi-round payoff, so the
  // biggest shapes test this-round play; the long horizons live in the
  // smaller ones, where the whole fight still solves.
  night: [
    { label: '1x1 c4 r5', weight: 1500, gen: { shape: '1x1', cards: 4, roundsLeft: 5, multiShare: 0.8 } },
    { label: '1x1 c4 r4', weight: 1000, gen: { shape: '1x1', cards: 4, roundsLeft: 4, multiShare: 0.8 } },
    { label: '2x1 c3 r4', weight: 1500, gen: { shape: '2x1', cards: 3, roundsLeft: 4, multiShare: 0.8 } },
    { label: '1x2 c3 r4', weight: 800, gen: { shape: '1x2', cards: 3, roundsLeft: 4, multiShare: 0.8 } },
    { label: '2x1 c3 r5', weight: 800, gen: { shape: '2x1', cards: 3, roundsLeft: 5, multiShare: 0.8 } },
    { label: '2x2 c3 r2', weight: 600, gen: { shape: '2x2', cards: 3, roundsLeft: 2 } },
    { label: '2x2 c3 r3', weight: 1000, gen: { shape: '2x2', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '2x2 c3 r4', weight: 300, gen: { shape: '2x2', cards: 3, roundsLeft: 4, multiShare: 0.8 } },
    { label: '4x1 c3 r3', weight: 1200, gen: { shape: '4x1', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '1x4 c3 r3', weight: 600, gen: { shape: '1x4', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '4x1 c3 r4', weight: 400, gen: { shape: '4x1', cards: 3, roundsLeft: 4, multiShare: 0.8 } },
    { label: '4x1 c4 r3', weight: 200, gen: { shape: '4x1', cards: 4, roundsLeft: 3, multiShare: 0.8 } },
    { label: '4x2 c3 r2', weight: 600, gen: { shape: '4x2', cards: 3, roundsLeft: 2 } },
    { label: '4x2 c3 r3', weight: 150, gen: { shape: '4x2', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '3x3 c3 r2', weight: 400, gen: { shape: '3x3', cards: 3, roundsLeft: 2 } },
    { label: '3x3 c3 r3', weight: 100, gen: { shape: '3x3', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '4x4 c3 r2', weight: 300, gen: { shape: '4x4', cards: 3, roundsLeft: 2 } },
    { label: '4x5 c3 r2', weight: 150, gen: { shape: '4x5', cards: 3, roundsLeft: 2 } },
  ],
  // The fresh slices an AI fix is re-verified on (NEXT-STEPS §52), half of
  // them with a hide dealt to the OTHER side — the search's opponent model.
  verify: [
    { label: '1x1 c4 r4', weight: 1, gen: { shape: '1x1', cards: 4, roundsLeft: 4, multiShare: 0.8 } },
    { label: '2x1 c3 r3', weight: 1, gen: { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8 } },
    { label: '2x2 c3 r2', weight: 1, gen: { shape: '2x2', cards: 3, roundsLeft: 2 } },
    { label: '4x1 c3 r2', weight: 1, gen: { shape: '4x1', cards: 3, roundsLeft: 2 } },
    { label: '1x1 c4 r3 foe-hide', weight: 1, gen: { shape: '1x1', cards: 4, roundsLeft: 3, foeCard: 'hide' } },
    { label: '2x1 c3 r3 foe-hide', weight: 1, gen: { shape: '2x1', cards: 3, roundsLeft: 3, foeCard: 'hide' } },
    { label: '2x2 c3 r2 foe-hide', weight: 1, gen: { shape: '2x2', cards: 3, roundsLeft: 2, foeCard: 'hide' } },
    { label: '4x1 c3 r2 foe-hide', weight: 1, gen: { shape: '4x1', cards: 3, roundsLeft: 2, foeCard: 'hide' } },
  ],
};

function slices(): Slice[] {
  if (flag('--shape')) {
    const gen: GeneratorConfig = {
      shape: flag('--shape'),
      cards: flag('--cards') ? Number(flag('--cards')) : undefined,
      maxCards: flag('--max-cards') ? Number(flag('--max-cards')) : undefined,
      roundsLeft: flag('--rounds') ? Number(flag('--rounds')) : undefined,
      foeCard: flag('--foe-card'),
    };
    const foe = gen.foeCard ? ` foe-${gen.foeCard}` : '';
    return [{ label: `${gen.shape} c${gen.cards ?? 'real'} r${gen.roundsLeft ?? 'auto'}${foe}`, weight: 1, gen }];
  }
  const mix = flag('--mix') ?? (SMOKE ? 'small' : 'night');
  const m = MIXES[mix];
  if (!m) throw new Error(`--mix ${mix}: unknown (${Object.keys(MIXES).join(', ')})`);
  return m;
}

function refereeOpts(slice: Slice, seed: number): Partial<RefereeOptions> {
  const out: Partial<RefereeOptions> = { ...slice.referee, seed };
  if (flag('--samples')) out.samples = flag('--samples')!.split(',').map(Number);
  if (flag('--max-joint')) out.maxJoint = Number(flag('--max-joint'));
  if (flag('--budget')) out.budget = Number(flag('--budget'));
  if (flag('--solved-rounds')) out.solvedRounds = Number(flag('--solved-rounds'));
  return out;
}

/** The slice position `i` of a run falls in, by its seed. */
function sliceFor(all: Slice[], seed: number): Slice {
  const total = all.reduce((s, x) => s + x.weight, 0);
  let x = ((Math.imul(seed, 2654435761) >>> 0) / 4294967296) * total;
  for (const s of all) { x -= s.weight; if (x < 0) return s; }
  return all[all.length - 1];
}

interface Row { slice: string; seed: number; result: CheckResult }

function runOne(i: number, base: number): Row {
  const all = slices();
  if (i < 0) {
    const c = CONTROLS[-i - 1];
    return { slice: 'control', seed: 0, result: checkPosition(c.position, { referee: { ...DEFAULT_REFEREE, seed: 1 } }) };
  }
  const seed = base + i;
  const s = sliceFor(all, seed);
  const pos = generatePosition(seed, s.gen);
  const replicates = Number(flag('--replicates') ?? 0);
  return { slice: s.label, seed, result: checkPosition(pos, { referee: refereeOpts(s, 1), replicates, rival: rival() }) };
}

/**
 * `--rival '<json>'`: a second AI setting — `DEFAULT_LOOKAHEAD` with these
 * fields replaced (`null` removes one) — asked every position and judged on
 * the SAME solves (`CheckOptions.rival`). How an AI change is A/B'd against
 * the referee.
 */
function rival(): LookaheadOptions | undefined {
  const raw = flag('--rival');
  if (!raw) return undefined;
  const over = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_LOOKAHEAD };
  for (const [k, v] of Object.entries(over)) { if (v === null) delete out[k]; else out[k] = v; }
  return out as unknown as LookaheadOptions;
}

// --- a lane ---------------------------------------------------------------

/** Read every lane's results so far. */
function readRows(runDir: string): Row[] {
  return fs.readdirSync(runDir).filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(runDir, f), 'utf8').split('\n').filter(Boolean).flatMap(l => {
      try { return [JSON.parse(l) as Row]; } catch { return []; }   // a line cut short by a kill
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
  // Controls first (negative indices), then positions. A SHARED QUEUE: each
  // job is claimed by creating its file exclusively, so a lane that drew a
  // cheap stretch takes more of them and none sits idle at the end.
  const jobs = [...CONTROLS.map((_, k) => -k - 1), ...Array.from({ length: n }, (_, i) => i)];
  // `--deadline` (epoch ms, from the parent's `--hours`): claim nothing new
  // after it, so a night run ends — and reports — on time.
  const deadline = Number(flag('--deadline') ?? Infinity);
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    try { fs.closeSync(fs.openSync(path.join(claims, String(job)), 'wx')); } catch { continue; }
    let row: Row;
    try {
      row = runOne(job, base);
    } catch (err) {
      // One position that throws must not take its lane's remaining work down.
      const seed = job < 0 ? 0 : base + job;
      row = { slice: 'error', seed, result: { solved: false, error: String((err as Error).stack ?? err).slice(0, 2000) } as unknown as CheckResult };
    }
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  }
  process.exit(0);
}

// --- the parent -----------------------------------------------------------

const N = games(200);
const LANES = Math.max(1, Number(flag('--lanes') ?? (SMOKE ? 2 : 4)));
const BASE = Number(flag('--seed') ?? 1);
const OUT = flag('--out') ?? '/tmp/ai-audit';
const PARTIAL_MINUTES = Number(flag('--partial-every') ?? 10);
/** Stop dealing new positions after this many hours (the run still reports). */
const HOURS = Number(flag('--hours') ?? 0);
const date = new Date().toISOString().slice(0, 10);

if (flag('--report-only')) {
  // Rebuild the report (and fixtures) from a run's lane files — after a crash,
  // a kill, or to re-read a finished run.
  const runDir = flag('--report-only')!;
  writeReport(readRows(runDir), NaN, true);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = path.join(OUT, `run-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });

const OWN = ['--lanes', '--games', '--out', '--partial-every', '--hours'];
const passthrough = process.argv.slice(2).filter((a, i, arr) => !OWN.includes(a) && !OWN.includes(arr[i - 1]));
const t0 = performance.now();
console.log(`AI audit: ${N} positions + ${CONTROLS.length} controls, ${LANES} lanes at nice 19 → ${runDir}`);
const partial = setInterval(() => {
  try { writeReport(readRows(runDir), (performance.now() - t0) / 1000, false); } catch (err) { console.error('partial report failed:', err); }
}, PARTIAL_MINUTES * 60_000);
await Promise.all(Array.from({ length: LANES }, (_, lane) => new Promise<void>(resolve => {
  const args = ['-n', '19', process.execPath, '--import', 'tsx', HERE, ...passthrough,
    '--worker', String(lane), '--n', String(N), '--seed', String(BASE), '--run-dir', runDir,
    ...(HOURS ? ['--deadline', String(Date.now() + HOURS * 3_600_000)] : [])];
  const child = spawn('nice', args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  // A lane that dies leaves its results on disk; report what there is.
  child.on('exit', code => { if (code !== 0) console.error(`lane ${lane} exited ${code}`); resolve(); });
})));
clearInterval(partial);
writeReport(readRows(runDir), (performance.now() - t0) / 1000, true);

// --- the report -------------------------------------------------------------

function writeReport(rows: Row[], wall: number, final: boolean): void {
const errors = rows.filter(r => r.slice === 'error');
const generated = rows.filter(r => r.slice !== 'control' && r.slice !== 'error');
const controls = rows.filter(r => r.slice === 'control');
const solved = generated.filter(r => r.result.solved);
const hasMismatch = (r: Row): boolean => r.result.picks.some(p => p.mismatch);
const hasScreened = (r: Row): boolean => r.result.picks.some(p => p.screened);
const md: string[] = [];
const say = (s = ''): void => { md.push(s); };

say(`# AI audit — ${date}${final ? '' : ' (PARTIAL, run still going)'}`);
say();
say(`${generated.length} generated positions (seeds ${BASE}…${BASE + N - 1}) + ${controls.length} controls, ${LANES} lanes, ${wall.toFixed(0)} s wall.`);
say(`Mix: ${slices().map(s => `${s.label} ×${s.weight}`).join(', ')}.`);
say(`Referee: samples ${JSON.stringify(flag('--samples') ?? DEFAULT_REFEREE.samples)}, maxJoint ${flag('--max-joint') ?? DEFAULT_REFEREE.maxJoint}, maxTargets ${DEFAULT_REFEREE.maxTargets}, budget ${flag('--budget') ?? DEFAULT_REFEREE.budget} rounds. AI: bestResponse at DEFAULT_LOOKAHEAD, 4 seeds.`);
say();
say('## Headline');
say();
say(`- solved: ${share(solved.length, generated.length)} (${generated.length - solved.length} over budget, ${errors.length} threw)`);
say(`- positions with a confirmed mismatch: ${share(solved.filter(hasMismatch).length, solved.length)} (screened before confirmation: ${solved.filter(hasScreened).length})`);
const pickShare = solved.reduce((s, r) => s + r.result.mismatchShare, 0);
say(`- AI decisions that are mismatches (seed-weighted): ${solved.length ? pct(pickShare / solved.length, solved.length) : '—'}`);
const ms = solved.map(r => r.result.ms / 1000).sort((a, b) => a - b);
const q = (p: number): number => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? NaN;
say(`- seconds per solved position: mean ${(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)).toFixed(1)}, median ${q(0.5).toFixed(1)}, p90 ${q(0.9).toFixed(1)}, max ${q(1).toFixed(1)}`);
say();

const table = (title: string, keyOf: (r: Row) => string[]): void => {
  const groups = new Map<string, Row[]>();
  for (const r of solved) for (const k of keyOf(r)) groups.set(k, [...(groups.get(k) ?? []), r]);
  say(`## By ${title}`);
  say();
  say(`| ${title} | positions | mismatch | mean s |`);
  say('|---|---|---|---|');
  for (const [k, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sec = g.reduce((s, r) => s + r.result.ms, 0) / g.length / 1000;
    say(`| ${k} | ${g.length} | ${share(g.filter(hasMismatch).length, g.length)} | ${sec.toFixed(1)} |`);
  }
  say();
};
const horizonBucket = (h: number): string => (h >= 3 ? '3+' : String(h));
table('horizon', r => [horizonBucket(r.result.position.tags.horizon)]);
table('slice', r => [r.slice]);
table('featured archetype', r => [r.result.position.tags.featured ?? '(none)']);
table('archetype in the tested hand', r => [...new Set(r.result.position.teams[0].flatMap(f => f.cards.map(c => c.arch)))]);
table('archetype in the other hand', r => [...new Set(r.result.position.teams[1].flatMap(f => f.cards.map(c => c.arch)))]);
table('priced statuses', r => [r.result.position.teams[0].some(f => f.cards.some(c => c.p.priced === 0)) ? 'hand has an unpriced status card' : 'all priced']);

const rivalled = solved.filter(r => r.result.rivalPicks);
if (rivalled.length) {
  // Paired: the same position, the same solves, two AI settings.
  const rivalMismatch = (r: Row): boolean => (r.result.rivalPicks ?? []).some(p => p.mismatch);
  say(`## Production vs rival (\`--rival ${flag('--rival')}\`), on the same solves`);
  say();
  say('| group | positions | production | rival | production − rival |');
  say('|---|---|---|---|---|');
  const groups = new Map<string, Row[]>();
  for (const r of rivalled) {
    const keys = ['all', r.slice, ...new Set(r.result.position.teams[1].flatMap(f => f.cards.map(c => `other hand: ${c.arch}`)))];
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, g] of groups) {
    if (g.length < 10) continue;
    const d = g.map(r => (hasMismatch(r) ? 1 : 0) - (rivalMismatch(r) ? 1 : 0));
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, d.length - 1));
    say(`| ${k} | ${g.length} | ${share(g.filter(hasMismatch).length, g.length)} | ${share(g.filter(rivalMismatch).length, g.length)} | ${(100 * mean).toFixed(1)}pp±${(100 * sd / Math.sqrt(d.length)).toFixed(1)} |`);
  }
  say();
}

// Which card the AI played, and what the equilibrium played instead.
const swaps = new Map<string, number>();
for (const r of solved) {
  for (const p of r.result.picks.filter(x => x.mismatch)) {
    const eq = (r.result.eqCards ?? []).map(m => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?').join(',');
    const k = `AI ${p.cards.join(',')} → eq ${eq}`;
    swaps.set(k, (swaps.get(k) ?? 0) + 1);
  }
}
say('## Mismatches by what the AI played instead of the equilibrium card');
say();
for (const [k, n] of [...swaps].sort((a, b) => b[1] - a[1]).slice(0, 30)) say(`- ${n}× ${k}`);
say();

say('## Controls');
say();
say('| control | horizon | value | equilibrium | AI picks |');
say('|---|---|---|---|---|');
for (const r of controls) {
  const res = r.result;
  say(`| ${res.position.id} | ${res.position.tags.horizon} | ${res.value?.toFixed(2)} | ${JSON.stringify(res.eqCards)} | ${res.picks.map(p => `${p.cards.join(',')}×${p.count}${p.mismatch ? ' **MISMATCH**' : ''}`).join(' ')} |`);
}
say();

const replicated = solved.filter(r => (r.result.replicateValues ?? []).length);
if (replicated.length) {
  const diffs = replicated.flatMap(r => r.result.replicateValues!.map(v => v - r.result.value!));
  const sd = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length / 2);
  const pickDiffs = replicated.flatMap(r => r.result.picks.flatMap(p => p.replicateLoss.map(l => l - p.loss)));
  const psd = Math.sqrt(pickDiffs.reduce((s, d) => s + d * d, 0) / Math.max(1, pickDiffs.length) / 2);
  say('## Referee error (independent re-solves)');
  say();
  say(`- game value: sd ${sd.toFixed(2)} PV over ${replicated.length} positions`);
  say(`- an AI pick's loss: sd ${psd.toFixed(2)} PV`);
  say(`- largest value disagreement: ${Math.max(...diffs.map(Math.abs)).toFixed(2)} PV`);
  say();
}

if (errors.length) {
  say('## Positions that threw');
  say();
  for (const r of errors.slice(0, 10)) say(`- seed ${r.seed}: ${(r.result.error ?? '').split('\n')[0]}`);
  say();
}

say('## Every mismatch');
say();
for (const r of solved.filter(hasMismatch)) {
  const res = r.result;
  const t = res.position.tags;
  for (const p of res.picks.filter(x => x.mismatch)) {
    say(`- **${res.position.id}** (seed ${r.seed}, ${r.slice}, ${t.shape}, horizon ${t.horizon}, featured ${t.featured ?? '—'}): AI ${p.cards.join(',')} ×${p.count}, loses ${p.loss.toFixed(2)} PV (noise ${p.noise.toFixed(2)}, re-solves ${p.replicateLoss.map(x => x.toFixed(2)).join('/')}); equilibrium ${JSON.stringify(res.eqCards)}; value ${res.value?.toFixed(2)}`);
  }
}
say();
say(`Reproduce one: \`--shape … --seed <seed> --games 1\` with the slice's config, or load it from the JSON.`);

const suffix = final ? '' : '-partial';
const mdPath = path.join(OUT, `report-${date}${suffix}.md`);
const jsonPath = path.join(OUT, `report-${date}${suffix}.json`);
fs.writeFileSync(mdPath, md.join('\n') + '\n');
fs.writeFileSync(jsonPath, JSON.stringify({ date, n: N, lanes: LANES, wall, base: BASE, slices: slices(), rows }, null, 1));
console.log(md.slice(0, 12).join('\n'));
console.log(`\nreport: ${mdPath}\njson:   ${jsonPath}`);

// --- the fixtures -----------------------------------------------------------

interface Fixture {
  id: string; found: string; slice: string; seed: number; todo: boolean;
  position: Position; value: number;
  combos: NonNullable<CheckResult['combos']>;
  ai: string[][];
}
if (final && !process.argv.includes('--no-fixtures') && !SMOKE) {
  const existing: Fixture[] = fs.existsSync(FIXTURES) ? JSON.parse(fs.readFileSync(FIXTURES, 'utf8')) : [];
  const known = new Set(existing.map(f => f.id));
  let added = 0;
  for (const r of solved.filter(hasMismatch)) {
    // The fast tier replays the AI only; still, keep the fixtures to fights the
    // referee can re-check by hand in under a minute.
    if (r.result.ms > 60_000) continue;
    const id = `${r.result.position.id}:${r.slice}`;
    if (known.has(id)) continue;
    existing.push({
      id, found: date, slice: r.slice, seed: r.seed, todo: true,
      position: r.result.position, value: r.result.value!, combos: r.result.combos ?? [],
      ai: r.result.picks.filter(p => p.mismatch).map(p => p.cards),
    });
    added++;
  }
  fs.writeFileSync(FIXTURES, JSON.stringify(existing, null, 1) + '\n');
  console.log(`fixtures: +${added} → ${FIXTURES}`);
}
}
