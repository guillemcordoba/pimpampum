/**
 * A POOL OF WORKER THREADS THAT EVALUATE A SOLVE'S CELLS — a `Referee` given
 * one (`new Referee(opts, pool)`) has each batch the double oracle is about to
 * read computed here. Node only (not part of the browser-safe root:
 * `@pimpampum/ai/parallel`).
 *
 * SYNCHRONOUS: `cells` returns when the batch is done, the calling thread
 * blocked on shared memory meanwhile (`Atomics.wait`). So a solve on a pool
 * fits where the engine asks its AI for a card and waits for the answer, and
 * an equilibrium player on a pool is a plain `Policy`. (A browser forbids that
 * wait on its main thread; it allows it in a Web Worker.)
 *
 * Each worker holds the solve's root round, rebuilt from its snapshot, and
 * claims the batch's next cell whenever it is free, so a slow cell does not
 * hold the others back. The answers are the same as a solve on one thread;
 * only the simulated-round budget is counted per worker.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads';
import { BudgetExceeded, Unsupported, type CellPool, type CellStat, type Joint, type RefereeContent, type RootRound } from '../audit/referee.js';
import { BATCH_SLOTS, DONE, ERR, POOL_SLOTS, READY } from './shared.js';

export interface CellPoolOptions {
  workers: number;
  /** The content on this thread: names for the snapshot each solve sends. */
  content: RefereeContent;
  /** Where each worker imports the same content from: a module specifier
   *  (resolvable from this package) and the export holding it. */
  contentModule: { specifier: string; name: string };
}

/** How long the pool waits for workers to load, and for a batch to make any progress. */
const STARTUP_MS = 60_000;
const STALL_MS = 600_000;

export class NodeCellPool implements CellPool {
  readonly refOf: CellPool['refOf'];
  private readonly workers: Worker[] = [];
  /** This thread's end of each worker's error channel. */
  private readonly errorPorts: MessagePort[] = [];
  private readonly ctrl = new Int32Array(new SharedArrayBuffer(POOL_SLOTS * Int32Array.BYTES_PER_ELEMENT));
  private started = false;

  constructor(opts: CellPoolOptions) {
    if (opts.workers < 1) throw new Error('cell pool: at least one worker');
    this.refOf = opts.content.refOf;
    for (let n = 0; n < opts.workers; n++) {
      const { port1, port2 } = new MessageChannel();
      const w = new Worker(workerFile(), {
        workerData: { ...opts.contentModule, ctrl: this.ctrl.buffer, errors: port2 },
        transferList: [port2],
      });
      // Nothing here ever waits on the event loop, so a pool nobody closed
      // does not keep the process alive.
      w.unref();
      this.workers.push(w);
      this.errorPorts.push(port1);
    }
  }

  begin(root: RootRound): void {
    this.awaitStarted();
    for (const w of this.workers) w.postMessage({ type: 'begin', root });
  }

  cells(pairs: { row: Joint; col: Joint }[]): { stat: CellStat; sims: number }[] {
    if (!pairs.length) return [];
    const claim = new Int32Array(new SharedArrayBuffer(BATCH_SLOTS * Int32Array.BYTES_PER_ELEMENT));
    const results = new Float64Array(new SharedArrayBuffer(pairs.length * 3 * Float64Array.BYTES_PER_ELEMENT));
    for (const w of this.workers) w.postMessage({ type: 'batch', pairs, claim: claim.buffer, results: results.buffer });
    let lastProgress = performance.now();
    for (let done = Atomics.load(claim, DONE); done < pairs.length; done = Atomics.load(claim, DONE)) {
      Atomics.wait(claim, DONE, done, 1000);
      if (Atomics.load(claim, DONE) !== done) lastProgress = performance.now();
      else if (performance.now() - lastProgress > STALL_MS) throw new Error('cell pool: no cell finished for ten minutes (a worker died?)');
    }
    this.throwIfFailed();
    return pairs.map((_, i) => ({ stat: { mean: results[i * 3], se: results[i * 3 + 1] }, sims: results[i * 3 + 2] }));
  }

  close(): Promise<void> {
    for (const p of this.errorPorts) p.close();
    return Promise.all(this.workers.map(w => w.terminate())).then(() => undefined);
  }

  private awaitStarted(): void {
    if (this.started) return;
    const deadline = performance.now() + STARTUP_MS;
    for (let ready = Atomics.load(this.ctrl, READY); ready < this.workers.length; ready = Atomics.load(this.ctrl, READY)) {
      if (performance.now() > deadline) throw new Error('cell pool: the workers did not start within a minute');
      Atomics.wait(this.ctrl, READY, ready, 1000);
    }
    this.started = true;
    this.throwIfFailed();
  }

  /** The first error a worker reported, as the error it was there. */
  private throwIfFailed(): void {
    if (!Atomics.load(this.ctrl, ERR)) return;
    Atomics.store(this.ctrl, ERR, 0);
    let first: Error | undefined;
    for (const port of this.errorPorts) {
      for (let m = receiveMessageOnPort(port); m; m = receiveMessageOnPort(port)) {
        const { kind, message, stack } = m.message as { kind: string; message: string; stack?: string };
        if (first) continue;
        first = new (kind === 'BudgetExceeded' ? BudgetExceeded : kind === 'Unsupported' ? Unsupported : Error)(message);
        if (stack) first.stack = stack;
      }
    }
    throw first ?? new Error('cell pool: a worker failed');
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
