/**
 * The encounter creator's pool of fight-playing workers.
 *
 * A solve plays a few thousand fights, and the slow ones — with the real AI —
 * are what made the creator take 5–20 s on one thread. Spread over a pool, the
 * same solve (same chunks, same seeds, the same answer) comes back inside the
 * 3-second budget a DM needs to try a few compositions in a row
 * (`sets/fantasy/test/encounter-speed.test.ts`).
 *
 * Created once and kept: starting workers costs more than a solve's first step.
 */
import type { ChunkJob, ChunkTotals, PartySpec } from '@pimpampum/set-fantasy';
import type { ChunkReply, ChunkRequest } from '../workers/chunk-worker';

/** Up to eight workers — what the speed test is held to — and never more than the cores. */
const POOL_SIZE = Math.max(1, Math.min(8, globalThis.navigator?.hardwareConcurrency ?? 4));

export class ChunkPool {
  private readonly workers: Worker[];
  private next = 0;
  private seq = 0;
  private readonly pending = new Map<number, (t: ChunkTotals) => void>();

  constructor(size = POOL_SIZE) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('../workers/chunk-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (event: MessageEvent<ChunkReply>) => {
        this.pending.get(event.data.id)?.(event.data.totals);
        this.pending.delete(event.data.id);
      };
      return w;
    });
  }

  /** Play every job, spread round-robin over the workers. */
  run(party: PartySpec, jobs: ChunkJob[]): Promise<ChunkTotals[]> {
    return Promise.all(jobs.map(job => new Promise<ChunkTotals>(resolve => {
      const id = this.seq++;
      this.pending.set(id, resolve);
      const request: ChunkRequest = { id, party, job };
      this.workers[this.next++ % this.workers.length].postMessage(request);
    })));
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.pending.clear();
  }
}
