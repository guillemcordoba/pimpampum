/**
 * CACHING THE FIXED COST OF A RUN.
 *
 * Every invocation of a harness pays ~30 s before it measures anything: the
 * fight shapes have to be solved, and each one's neutral baseline measured in
 * every company row (2,000 combats per shape, 22 s of the 30). That cost is
 * identical across runs unless the CONTENT it depends on changed — which is
 * exactly what a cache key is for, and exactly what makes iterating on a card
 * slow when it is paid every time.
 *
 * The key is a fingerprint of what the cell actually depends on, and nothing
 * else. That precision is the point: editing one player kit invalidates only
 * the company rows containing it — typically one of four — so a card-design
 * loop re-measures a quarter of the baselines instead of all of them, and
 * re-running with no edit at all is free.
 *
 * CORRECTNESS OVER HIT RATE. A stale cached number is far worse than a slow
 * run, so the fingerprint covers the engine's own source as well as the card
 * definitions: any change to how a fight resolves invalidates everything. If
 * you are ever unsure, delete the directory — it is pure derived data.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActionDefinition } from '@pimpampum/engine';
import { theSet } from './gameset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(HERE, '../../.bench-cache');
/** `BENCH_CACHE_DIR` points the cache elsewhere — a test run uses a fresh
 *  empty one, so it never reads an old number yet its warm workers (which
 *  inherit the environment) still share their results with it. Read per call,
 *  like `BENCH_NO_CACHE`. */
const cacheDir = (): string => process.env.BENCH_CACHE_DIR || DEFAULT_CACHE_DIR;
const REPO = path.resolve(HERE, '../../../..');

/** Disable with `BENCH_NO_CACHE=1` when you suspect the cache rather than the game.
 *  Read on every call, not once at import: a test setup file that sets it after
 *  its imports have been hoisted must still be obeyed. */
const enabled = (): boolean => process.env.BENCH_NO_CACHE !== '1';

function sha(...parts: string[]): string {
  const h = crypto.createHash('sha1');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 16);
}

/**
 * Everything about a card that changes how a fight goes.
 *
 * Deliberately includes `effects`, serialised whole: a handler's PARAMS are
 * where most balance edits land, and a fingerprint that missed them would hand
 * back numbers for the card as it used to be — the worst failure this module
 * could have.
 */
export function actionPrint(a: ActionDefinition): string {
  // EVERY FIELD BUT THE PRESENTATION ONES, by exclusion rather than by list.
  // A hand-picked list read `dice.bonus` — a field `DiceRoll` does not have
  // (it is `modifier`) — so 2d6 and 2d6+2 printed the same, and it simply
  // lacked `targetCount`, `rollPerTarget`, `isConsumable` and
  // `canReviveTarget`: turning a single-target card into a sweep served the
  // old card's cached numbers. Excluding what cannot change a fight means a
  // field added to the definition tomorrow is fingerprinted without anyone
  // remembering to.
  const { name: _n, description: _d, iconPath: _i, ...rest } = a;
  return JSON.stringify(rest, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v);
}

/**
 * ONE KIT'S / ONE CREATURE'S FINGERPRINT.
 *
 * The bytes come from the SET — only it knows which actions hang off an id —
 * and the memo lives here because the cache is what asks for them, over and
 * over, inside a solve. Keyed by set id as well as content id: two sets in one
 * process (a test installing a synthetic set after a real one) must not read
 * each other's prints.
 */
const prints = new Map<string, string>();

function memoPrint(kind: 'skill' | 'enemy', id: string): string {
  const set = theSet();
  const k = `${set.id}:${kind}:${id}`;
  let p = prints.get(k);
  if (p === undefined) {
    p = kind === 'skill' ? set.skillPrint(id) : set.enemyPrint(id);
    prints.set(k, p);
  }
  return p;
}

export function skillPrint(skillId: string): string {
  return memoPrint('skill', skillId);
}

export function enemyPrint(enemyId: string): string {
  return memoPrint('enemy', enemyId);
}

/**
 * A fingerprint of THE RULES AND THE INSTRUMENT, from their source.
 *
 * Card fingerprints cannot see a change to how a contest resolves, how the AI
 * chooses, how a cell is played or how a shape is solved — and every one of
 * those moves every number in the cache. Hashing the source is blunt and it is
 * right: an edit to any of them invalidates the lot, which is what should
 * happen.
 *
 * FOUR PACKAGES, NOT ONE. This hashed `engine/src` alone, which was complete
 * while the AI lived inside the engine. When the AI moved to its own package
 * the fingerprint stopped seeing it, and an AI change began serving baselines
 * measured with the previous AI — silently, with plausible numbers. Everything
 * that decides a measured fight except the content (which the set prints) is
 * listed here.
 */
export const FINGERPRINTED = ['engine', 'ai', 'bench', 'combat-balancer'];
let enginePrintCache: string | null = null;
export function enginePrint(): string {
  if (enginePrintCache) return enginePrintCache;
  const parts: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) parts.push(e.name, fs.readFileSync(full, 'utf8'));
    }
  };
  for (const pkg of FINGERPRINTED) {
    parts.push(pkg);
    try { walk(path.join(REPO, 'packages', pkg, 'src')); } catch { parts.push('missing'); }
  }
  enginePrintCache = sha(...parts);
  return enginePrintCache;
}

/**
 * Build a cache key from the engine, the SET, and whatever the caller says it
 * depends on.
 *
 * The set id is not optional. Two sets ask structurally identical questions —
 * "the neutral baseline of company row 0 on shape 0" — and without the id in
 * the key the second set to run would be served the first set's answer.
 */
export function key(...parts: string[]): string {
  return sha(enginePrint(), theSet().id, ...parts);
}

/**
 * Read a cached value, or compute and store it.
 *
 * `namespace` keeps unrelated kinds of value apart so a bug in one cannot serve
 * the other.
 */
export function cached<T>(namespace: string, k: string, compute: () => T): T {
  if (!enabled()) return compute();
  const file = path.join(cacheDir(), namespace, `${k}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    // A corrupt entry is not worth a crash — recompute and overwrite it.
  }
  const value = compute();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  } catch {
    // An unwritable cache is a performance problem, never a correctness one.
  }
  return value;
}

/** Whether anything was served from cache this run, for the report to say so. */
export const cacheStatus = { hits: 0, misses: 0 };

/**
 * IN-PROCESS, WHATEVER THE DISK SAYS. With the disk cache off (`BENCH_NO_CACHE=1`
 * — exactly what you do when you suspect it) every call used to recompute, and
 * callers ask for the same value over and over: a shape's solved enemies are
 * requested once per cell per arm per level. A run with the cache "off" was
 * re-solving the same encounter hundreds of times. Turning off the DISK must
 * not turn off remembering what this process already computed.
 */
const memo = new Map<string, unknown>();

export function countedCached<T>(namespace: string, k: string, compute: () => T): T {
  const mk = `${namespace}/${k}`;
  if (memo.has(mk)) { cacheStatus.hits++; return memo.get(mk) as T; }
  if (!enabled()) { cacheStatus.misses++; const v = compute(); memo.set(mk, v); return v; }
  const file = path.join(cacheDir(), namespace, `${k}.json`);
  const hit = fs.existsSync(file);
  const value = cached(namespace, k, compute);
  if (hit) cacheStatus.hits++; else cacheStatus.misses++;
  memo.set(mk, value);
  return value;
}
