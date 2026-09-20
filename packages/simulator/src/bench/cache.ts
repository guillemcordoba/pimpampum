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
import { ALL_SKILLS } from '@pimpampum/skills';
import { getEnemy } from '@pimpampum/enemies';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(HERE, '../../.bench-cache');
const REPO = path.resolve(HERE, '../../../..');

/** Disable with `BENCH_NO_CACHE=1` when you suspect the cache rather than the game. */
const ENABLED = process.env.BENCH_NO_CACHE !== '1';

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
function actionPrint(a: ActionDefinition): string {
  return JSON.stringify([
    a.id, a.unlockLevel, a.actionType, a.speed, a.rollBonus ?? 0,
    a.dice ? [a.dice.numDice, a.dice.sides, (a.dice as { bonus?: number }).bonus ?? 0] : null,
    a.lastResort ?? false,
    a.effects,
  ]);
}

const skillPrints = new Map<string, string>();
export function skillPrint(skillId: string): string {
  let p = skillPrints.get(skillId);
  if (!p) {
    const s = ALL_SKILLS.find(x => x.id === skillId);
    p = s ? `${s.id}:${s.actions.map(actionPrint).join('|')}` : `${skillId}:?`;
    skillPrints.set(skillId, p);
  }
  return p;
}

const enemyPrints = new Map<string, string>();
export function enemyPrint(enemyId: string): string {
  let p = enemyPrints.get(enemyId);
  if (!p) {
    const e = getEnemy(enemyId);
    p = e
      ? `${e.id}:${e.bulk ?? 1}:${e.skills.flatMap(s => s.actions).map(actionPrint).join('|')}`
      : `${enemyId}:?`;
    enemyPrints.set(enemyId, p);
  }
  return p;
}

/**
 * A fingerprint of the ENGINE, from its source.
 *
 * Card fingerprints cannot see a change to how a contest resolves, how the AI
 * chooses or what a level adds to a roll — and every one of those moves every
 * number in the cache. Hashing the source is blunt and it is right: an engine
 * edit invalidates the lot, which is what should happen.
 */
let enginePrintCache: string | null = null;
export function enginePrint(): string {
  if (enginePrintCache) return enginePrintCache;
  const dir = path.join(REPO, 'packages', 'engine', 'src');
  const parts: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) parts.push(e.name, fs.readFileSync(full, 'utf8'));
    }
  };
  try { walk(dir); } catch { parts.push('no-engine-source'); }
  enginePrintCache = sha(...parts);
  return enginePrintCache;
}

/** Build a cache key from the engine plus whatever the caller says it depends on. */
export function key(...parts: string[]): string {
  return sha(enginePrint(), ...parts);
}

/**
 * Read a cached value, or compute and store it.
 *
 * `namespace` keeps unrelated kinds of value apart so a bug in one cannot serve
 * the other.
 */
export function cached<T>(namespace: string, k: string, compute: () => T): T {
  if (!ENABLED) return compute();
  const file = path.join(CACHE_DIR, namespace, `${k}.json`);
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

export function countedCached<T>(namespace: string, k: string, compute: () => T): T {
  if (!ENABLED) { cacheStatus.misses++; return compute(); }
  const file = path.join(CACHE_DIR, namespace, `${k}.json`);
  const hit = fs.existsSync(file);
  const value = cached(namespace, k, compute);
  if (hit) cacheStatus.hits++; else cacheStatus.misses++;
  return value;
}
