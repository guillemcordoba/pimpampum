/**
 * THE PARALLEL WARM (`prepare`) — it must be invisible.
 *
 * Its whole contract is that `analyze` then runs as it always did and finds
 * every cell computed. Two ways that breaks, both SILENT:
 *
 *  - the warm plan drifts from what `analyze` measures (a budget it ignores, a
 *    key built differently), and the workers fill entries nothing reads: the
 *    numbers stay right and the run quietly goes serial again. It had: the old
 *    warm ignored the budget, so every control warmed keys nobody read.
 *  - a worker measures something other than what the serial run would have,
 *    and the numbers change with the core count.
 *
 * So: after `prepare`, `analyze` computes NOTHING — for a set kit, and for a
 * control kit under a budget (`allSeats`, custom samples); and a warmed report
 * is IDENTICAL to a serial one.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games, isolated } from '@pimpampum/bench';
import type { KitReport, RunContext } from '../src/index.js';
import { SYNTHETIC_MODULE } from './budgets.js';

const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prepare.work.ts');
const SET = { module: SYNTHETIC_MODULE, export: 'SYNTHETIC' };
const GAMES = games(80);
const SMALL = { mindlessGames: games(80), oneTrickGames: games(80), cardValueGames: games(24) };

type Run = { report: KitReport; misses: number };
const analysed = (ctx: RunContext, serial = false) => isolated<Run>(WORK, 'analysed', [ctx, GAMES, serial]);

describe('prepare', () => {
  it('leaves analyze nothing to compute — a set kit', async () => {
    const { misses } = await analysed({ set: SET, subject: { mode: 'player', id: 'brawler' }, budget: SMALL });
    expect(misses).toBe(0);
  });

  it('leaves analyze nothing to compute — a control kit under a budget', async () => {
    const { misses } = await analysed({ set: SET, subject: { control: 'ladderKit', args: [] }, budget: { ...SMALL, allSeats: true } });
    expect(misses).toBe(0);
  });

  it('changes no number: a warmed report is the serial report', async () => {
    const ctx: RunContext = { set: SET, subject: { mode: 'player', id: 'duelist' }, budget: SMALL };
    const [warmed, serial] = await Promise.all([analysed(ctx), analysed(ctx, true)]);
    expect(warmed.report).toEqual(serial.report);
  });
});
