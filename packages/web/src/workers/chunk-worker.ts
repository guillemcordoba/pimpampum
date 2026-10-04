/**
 * One worker of the encounter creator's pool: plays chunks of fights for the
 * solver (`solveEncounterAsync`). The search itself runs on the page and only
 * hands out fights, so a solve spreads over every worker of the pool.
 */
import { playEncounterChunk, type ChunkJob, type ChunkTotals, type PartySpec } from '@pimpampum/set-fantasy';

export interface ChunkRequest { id: number; party: PartySpec; job: ChunkJob }
export interface ChunkReply { id: number; totals: ChunkTotals }

self.onmessage = (event: MessageEvent<ChunkRequest>) => {
  const { id, party, job } = event.data;
  const reply: ChunkReply = { id, totals: playEncounterChunk(party, job) };
  (self as unknown as Worker).postMessage(reply);
};
