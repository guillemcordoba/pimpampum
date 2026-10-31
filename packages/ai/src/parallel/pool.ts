/**
 * A POOL OF WORKER THREADS THAT EVALUATE A SOLVE'S CELLS — `Referee.solveAsync`
 * hands it each batch the double oracle is about to read. Node only (it is
 * not part of the browser-safe root: `@pimpampum/ai/parallel`).
 *
 * Each worker holds the solve's root round, rebuilt from its snapshot, and
 * takes the next cell whenever it is free, so a slow cell does not hold the
 * others back. The answers are the same as a solve on one thread; only the
 * simulated-round budget is counted per worker.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BudgetExceeded, Unsupported, type CellPool, type CellStat, type Joint, type RefereeContent, type RootRound } from '../audit/referee.js';

export interface CellPoolOptions {
  workers: number;
  /** The content on this thread: names for the snapshot each solve sends. */
  content: RefereeContent;
  /** Where each worker imports the same content from: a module specifier
   *  (resolvable from this package) and the export holding it. */
  contentModule: { specifier: string; name: string };
}

interface Task { id: number; row: Joint; col: Joint; resolve: (r: { stat: CellStat; sims: number }) => void; reject: (e: Error) => void }

export class NodeCellPool implements CellPool {
  readonly refOf: CellPool['refOf'];
  private readonly workers: Worker[];
  private readonly idle: Worker[];
  private readonly queue: Task[] = [];
  private readonly busy = new Map<Worker, Task>();
  private nextId = 0;
  private closed = false;

  constructor(opts: CellPoolOptions) {
    if (opts.workers < 1) throw new Error('cell pool: at least one worker');
    this.refOf = opts.content.refOf;
    this.workers = Array.from({ length: opts.workers }, () => {
      const w = new Worker(workerFile(), { workerData: opts.contentModule });
      w.on('message', (m: { id: number; stat?: CellStat; sims?: number; error?: { kind: string; message: string; stack?: string } }) => this.done(w, m));
      w.on('error', e => this.fail(w, e));
      return w;
    });
    this.idle = [...this.workers];
  }

  begin(root: RootRound): void {
    if (this.queue.length || this.busy.size) throw new Error('cell pool: a new round while cells are still out');
    for (const w of this.workers) w.postMessage({ type: 'begin', root });
  }

  cells(pairs: { row: Joint; col: Joint }[]): Promise<{ stat: CellStat; sims: number }[]> {
    if (this.closed) return Promise.reject(new Error('cell pool: closed'));
    const out = Promise.all(pairs.map(p => new Promise<{ stat: CellStat; sims: number }>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, row: p.row, col: p.col, resolve, reject });
    })));
    this.pump();
    return out;
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map(w => w.terminate()));
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const t = this.queue.shift()!;
      this.busy.set(w, t);
      w.postMessage({ type: 'cell', id: t.id, row: t.row, col: t.col });
    }
  }

  private done(w: Worker, m: { id: number; stat?: CellStat; sims?: number; error?: { kind: string; message: string; stack?: string } }): void {
    const t = this.busy.get(w);
    if (!t || t.id !== m.id) return this.fail(w, new Error('cell pool: an answer to no question'));
    this.busy.delete(w);
    this.idle.push(w);
    if (m.error) {
      const E = m.error.kind === 'BudgetExceeded' ? BudgetExceeded : m.error.kind === 'Unsupported' ? Unsupported : Error;
      const e = new E(m.error.message);
      if (m.error.stack) e.stack = m.error.stack;
      t.reject(e);
    } else {
      t.resolve({ stat: m.stat!, sims: m.sims! });
    }
    this.pump();
  }

  private fail(w: Worker, e: Error): void {
    const t = this.busy.get(w);
    this.busy.delete(w);
    t?.reject(e);
    for (const q of this.queue.splice(0)) q.reject(e);
  }
}

export function createCellPool(opts: CellPoolOptions): NodeCellPool {
  return new NodeCellPool(opts);
}

/** The built worker: from `dist`, it sits beside this file; run from `src`
 *  (the package's own tests), the build's copy is used. */
function workerFile(): URL {
  const beside = new URL('./worker.js', import.meta.url);
  if (existsSync(fileURLToPath(beside))) return beside;
  const built = new URL('../../dist/parallel/worker.js', import.meta.url);
  if (!existsSync(fileURLToPath(built))) throw new Error('cell pool: build @pimpampum/ai first (dist/parallel/worker.js)');
  return built;
}
