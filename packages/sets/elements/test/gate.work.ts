/**
 * The measuring half of `gate.slow.test.ts`: the kit gate on this set, warmed
 * across bench's lanes, then read from the cache.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games, useSet } from '@pimpampum/bench';
import { GATE_BUDGET, measureGate, prepareGate, type GateBudget, type GateReport } from '@pimpampum/playtest';
import { ELEMENTS } from '../src/bench/index.js';

const SET = { module: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bench/index.js'), export: 'ELEMENTS' };

export async function gate(): Promise<GateReport> {
  useSet(ELEMENTS);
  const budget: GateBudget = {
    kitFights: games(GATE_BUDGET.kitFights), duelGames: games(GATE_BUDGET.duelGames),
    cardFights: games(GATE_BUDGET.cardFights), modelFights: games(GATE_BUDGET.modelFights!),
  };
  await prepareGate({ set: SET, budget });
  return measureGate({}, budget);
}
