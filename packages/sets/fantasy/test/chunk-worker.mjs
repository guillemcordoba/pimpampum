// A worker of the test's chunk pool: plays chunks of fights for the solver.
import { parentPort } from 'node:worker_threads';
import { playEncounterChunk } from '../dist/index.js';
parentPort.on('message', ({ id, party, job }) => {
  parentPort.postMessage({ id, totals: playEncounterChunk(party, job) });
});
