/**
 * A pool of Node worker threads playing a solve's chunks of fights — the
 * test-side twin of the web app's browser worker pool, so the encounter
 * creator's time budget is measured on the same parallel path the page uses.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { ChunkJob, ChunkTotals, PartySpec } from '../src/index.js';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'chunk-worker.mjs');

export class ChunkPool {
  private readonly workers: Worker[];
  private next = 0;
  private seq = 0;
  private readonly pending = new Map<number, (t: ChunkTotals) => void>();

  /** `size` defaults to a laptop's eight cores, never this machine's count. */
  constructor(size = Math.min(8, os.availableParallelism())) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(WORKER);
      w.on('message', ({ id, totals }: { id: number; totals: ChunkTotals }) => {
        this.pending.get(id)?.(totals);
        this.pending.delete(id);
      });
      return w;
    });
  }

  get size(): number { return this.workers.length; }

  /** Play every job, spread round-robin over the workers. */
  run(party: PartySpec, jobs: ChunkJob[]): Promise<ChunkTotals[]> {
    return Promise.all(jobs.map(job => new Promise<ChunkTotals>(resolve => {
      const id = this.seq++;
      this.pending.set(id, resolve);
      this.workers[this.next++ % this.workers.length].postMessage({ id, party, job });
    })));
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}
