/**
 * Encounter solving, off the main thread.
 *
 * The balancer prices a fight by PLAYING it a few hundred times, which takes
 * one to two seconds of solid CPU. Run on the main thread that freezes the
 * page — and worse, it cannot be interrupted, so bumping the enemy count twice
 * in a row queues up two full solves behind an unresponsive UI.
 *
 * A worker fixes both: the page stays live while it computes, and the host can
 * `terminate()` it the instant an input changes, which is the only way to
 * genuinely STOP a synchronous solve mid-flight.
 */
import { solveEncounter, type PoolSpec, type SolvedEncounter } from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';

export interface SolveRequest {
  /** Echoed back so the host can discard replies from a superseded job. */
  id: number;
  pool: PoolSpec[];
  party: PartySpec;
  target: number;
}

export type SolveReply =
  | { id: number; ok: true; result: SolvedEncounter | null }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { id, pool, party, target } = event.data;
  try {
    const result = solveEncounter(pool, party, target);
    const reply: SolveReply = { id, ok: true, result };
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    const reply: SolveReply = { id, ok: false, error: String(err) };
    (self as unknown as Worker).postMessage(reply);
  }
};
